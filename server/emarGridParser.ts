import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const getStandardFontDataUrl = () => {
  const fontsPath = path.resolve(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts');
  return pathToFileURL(fontsPath + path.sep).toString();
};

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface GridCell {
  medication: string;
  date: string;
  timeSlot: string;
  content: string;
  code: string;
  careWorker: string;
  time: string;
}

export interface ParsedEMAR {
  serviceUserName: string;
  allergies: string;
  auditPeriodStart: string;
  auditPeriodEnd: string;
  dates: string[];
  timeSlots: string[];
  medications: Array<{
    name: string;
    row: number;
    instructions: string;
    timeSlots: string[];
  }>;
  cells: GridCell[];
  rawText: string;
  debugInfo: {
    totalTextItems: number;
    dateColumnsFound: number;
    medicationsFound: number;
    timeSlotsFound: number;
    cellsGenerated: number;
  };
}

const DATE_PATTERNS = [
  // Day name + day + month (e.g., "Sun, 30 Nov", "Mon 01 Dec")
  /\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[,.]?\s*\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/gi,
  // Day + month (e.g., "30 Nov", "01 December")
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/gi,
  /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
  /\d{1,2}\/\d{1,2}/g,
  /\d{1,2}-\d{1,2}-\d{2,4}/g,
];
const TIME_SLOT_PATTERN = /\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}/g;
const CODE_PATTERN = /\b(AD|AS|P|R|MU|NH|SA|FA|F\s*\/\s*A|PRN\s*[-–]?\s*R|PRN\s*[-–]?\s*AD|PRN\s*[-–]?\s*AS|PRN|MISSED|N\/?A)\b/gi;
const CODE_PATTERN_SINGLE = /\b(AD|AS|P|R|MU|NH|SA|FA|F\s*\/\s*A|PRN\s*[-–]?\s*R|PRN\s*[-–]?\s*AD|PRN\s*[-–]?\s*AS|PRN|MISSED|N\/?A)\b/i;
const TIME_PATTERN = /\d{1,2}:\d{2}/g;
const INITIALS_PATTERN = /\b[A-Z]{2,3}\b/g;

const normalizeGridCode = (raw: string): string => {
  const normalized = raw
    .toUpperCase()
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "");

  if (normalized === "N/A" || normalized === "NA") return "N/A";
  if (normalized === "F/A" || normalized === "FA") return "FA";
  if (normalized === "PRNR" || normalized === "PRN-R") return "PRN-R";
  if (normalized === "PRNAD" || normalized === "PRN-AD") return "PRN-AD";
  if (normalized === "PRNAS" || normalized === "PRN-AS") return "PRN-AS";

  return normalized;
};

export async function parseEMARGrid(pdfBuffer: Buffer): Promise<ParsedEMAR> {
  const uint8Array = new Uint8Array(pdfBuffer);
  // Server-side parsing: disable worker to avoid PDF.js API/worker version mismatches.
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    disableWorker: true,
    standardFontDataUrl: getStandardFontDataUrl(),
    useSystemFonts: true,
  } as any);
  const pdf = await loadingTask.promise;
  
  const allTextItems: TextItem[] = [];
  let rawText = "";
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const tx = (item as any).transform;
        const x = tx[4];
        const y = viewport.height - tx[5];
        
        allTextItems.push({
          str: item.str.trim(),
          x: x,
          y: y,
          width: (item as any).width || 0,
          height: (item as any).height || 0,
          page: pageNum
        });
        
        rawText += item.str + " ";
      }
    }

    rawText += "\n\n--- PAGE BREAK ---\n\n";
  }
  
  // IMPORTANT: Group by page first. Y coordinates are only meaningful within a page.
  const yTolerance = 12;
  const itemsByPage = new Map<number, TextItem[]>();
  for (const item of allTextItems) {
    if (!itemsByPage.has(item.page)) itemsByPage.set(item.page, []);
    itemsByPage.get(item.page)!.push(item);
  }
  const rowsByPage = new Map<number, TextItem[][]>();
  for (const [page, items] of Array.from(itemsByPage.entries())) {
    rowsByPage.set(page, groupByY(items, yTolerance));
  }
  
  // Per-page detected headers (each page may cover a different date range)
  const pageHeaders: Array<{
    page: number;
    headerRowIndex: number;
    dateColumns: Array<{ date: string; xStart: number; xEnd: number }>;
  }> = [];

  const allDatesOrdered: string[] = [];
  const dateSeen = new Set<string>();

  const MIN_DATES_FOR_HEADER = 2; // allow shorter EMARs (e.g., 2-4 days)
  const MAX_HEADER_SCAN_ROWS = 40; // keep search near the top to reduce false positives

  for (const [page, rows] of Array.from(rowsByPage.entries()).sort((a, b) => a[0] - b[0])) {
    let headerRowIndex = -1;
    let dateColumns: Array<{ date: string; xStart: number; xEnd: number }> = [];

    for (let i = 0; i < Math.min(rows.length, MAX_HEADER_SCAN_ROWS); i++) {
      const row = rows[i];
      const rowText = row.map(item => item.str).join(" ");
      let foundDates: Array<{ date: string; xStart: number; xEnd: number }> = [];

      for (const pattern of DATE_PATTERNS) {
        const matches = Array.from(rowText.matchAll(pattern));
        for (const match of matches) {
          if (!match[0]) continue;

          const dateStr = match[0].trim();
          const matchIndex = match.index || 0;

          let charCount = 0;
          let xStart = row[0]?.x || 0;
          let xEnd = xStart + 50;

          for (let itemIndex = 0; itemIndex < row.length; itemIndex++) {
            const item = row[itemIndex];
            const itemText = item.str;
            const itemEnd = charCount + itemText.length;
            if (charCount <= matchIndex && matchIndex < itemEnd) {
              xStart = item.x - 5;
            }
            if (charCount <= matchIndex + dateStr.length && matchIndex + dateStr.length <= itemEnd) {
              xEnd = item.x + item.width + 5;
            }
            // account for a space between items in rowText
            charCount = itemEnd + 1;
          }

          foundDates.push({ date: dateStr, xStart, xEnd });
        }

        if (foundDates.length >= MIN_DATES_FOR_HEADER) break;
      }

      // De-duplicate by date string and sort by X; guard against repeated matches
      const byDate = new Map<string, { date: string; xStart: number; xEnd: number }>();
      for (const d of foundDates) {
        if (!byDate.has(d.date)) byDate.set(d.date, d);
      }
      foundDates = Array.from(byDate.values()).sort((a, b) => a.xStart - b.xStart);

      // Simple sanity: header-like row should have multiple dates spread across page
      const spread = foundDates.length >= 2 ? (foundDates[foundDates.length - 1].xStart - foundDates[0].xStart) : 0;
      const looksLikeHeader = foundDates.length >= MIN_DATES_FOR_HEADER && spread >= 150;

      if (looksLikeHeader) {
        headerRowIndex = i;
        dateColumns = [];
        for (let j = 0; j < foundDates.length; j++) {
          const current = foundDates[j];
          const next = foundDates[j + 1];
          dateColumns.push({
            date: current.date,
            xStart: current.xStart,
            xEnd: next ? next.xStart - 1 : current.xEnd + 80
          });
        }

        for (const col of dateColumns) {
          if (!dateSeen.has(col.date)) {
            dateSeen.add(col.date);
            allDatesOrdered.push(col.date);
          }
        }

        console.log(`DEBUG: Found ${dateColumns.length} dates in page ${page} row ${i}:`, dateColumns.map(d => d.date));
        break;
      }
    }

    // FALLBACK: Some PDFs render each date as its own text item (rowText joins won't show multiple dates).
    // In that case, detect date columns by clustering DATE items on similar Y (header line).
    if (headerRowIndex === -1) {
      const pageItems = itemsByPage.get(page) || [];

      const normalizeDateLabel = (value: string): string =>
        (value || "")
          .trim()
          .replace(/\s+/g, " ");

      type DateCandidate = { date: string; x: number; y: number; width: number };
      const candidates: DateCandidate[] = [];

      for (const item of pageItems) {
        const text = item.str;
        if (!text || text.length < 4) continue;
        for (const pattern of DATE_PATTERNS) {
          const matches = Array.from(text.matchAll(pattern));
          for (const m of matches) {
            if (!m[0]) continue;
            candidates.push({
              date: normalizeDateLabel(m[0]),
              x: item.x,
              y: item.y,
              width: item.width || 0,
            });
          }
        }
      }

      if (candidates.length > 0) {
        // Cluster by Y (header items share the same row).
        const sorted = [...candidates].sort((a, b) => a.y - b.y);
        const clusters: DateCandidate[][] = [];
        let current: DateCandidate[] = [sorted[0]];
        let currentY = sorted[0].y;
        for (let i = 1; i < sorted.length; i++) {
          const c = sorted[i];
          if (Math.abs(c.y - currentY) <= yTolerance) {
            current.push(c);
          } else {
            clusters.push(current);
            current = [c];
            currentY = c.y;
          }
        }
        clusters.push(current);

        // Choose best cluster: most unique dates, then widest spread, then nearest to top.
        let best: { cluster: DateCandidate[]; uniqueCount: number; spread: number; avgY: number } | null = null;
        for (const cluster of clusters) {
          const byDate = new Map<string, DateCandidate>();
          for (const c of cluster) {
            if (!byDate.has(c.date)) byDate.set(c.date, c);
          }
          const unique = Array.from(byDate.values()).sort((a, b) => a.x - b.x);
          if (unique.length < MIN_DATES_FOR_HEADER) continue;

          const spread = unique.length >= 2 ? (unique[unique.length - 1].x - unique[0].x) : 0;
          if (spread < 150) continue;

          const avgY = unique.reduce((sum, c) => sum + c.y, 0) / unique.length;
          const candidate = { cluster: unique, uniqueCount: unique.length, spread, avgY };
          if (!best) {
            best = candidate;
            continue;
          }
          if (candidate.uniqueCount > best.uniqueCount) {
            best = candidate;
            continue;
          }
          if (candidate.uniqueCount === best.uniqueCount && candidate.spread > best.spread) {
            best = candidate;
            continue;
          }
          if (
            candidate.uniqueCount === best.uniqueCount &&
            candidate.spread === best.spread &&
            candidate.avgY < best.avgY
          ) {
            best = candidate;
          }
        }

        if (best) {
          // Infer header row index by finding the nearest grouped row to the header Y.
          let nearestIndex = -1;
          let nearestDist = Number.POSITIVE_INFINITY;
          for (let i = 0; i < Math.min(rows.length, MAX_HEADER_SCAN_ROWS); i++) {
            const row = rows[i];
            const avgY = row.reduce((sum, item) => sum + item.y, 0) / row.length;
            const dist = Math.abs(avgY - best.avgY);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestIndex = i;
            }
          }

          headerRowIndex = nearestIndex;
          dateColumns = [];
          for (let j = 0; j < best.cluster.length; j++) {
            const current = best.cluster[j];
            const next = best.cluster[j + 1];
            dateColumns.push({
              date: current.date,
              xStart: current.x - 5,
              xEnd: next ? next.x - 1 : current.x + (current.width || 0) + 80,
            });
          }

          for (const col of dateColumns) {
            if (!dateSeen.has(col.date)) {
              dateSeen.add(col.date);
              allDatesOrdered.push(col.date);
            }
          }

          console.log(
            `DEBUG: Header detected via date-item clustering on page ${page} (row ${headerRowIndex}) with ${dateColumns.length} dates:`
          );
        }
      }
    }

    if (headerRowIndex !== -1 && dateColumns.length > 0) {
      pageHeaders.push({ page, headerRowIndex, dateColumns });
    }
  }

  const dates: string[] = allDatesOrdered;
  const dateColumns: Array<{ date: string; xStart: number; xEnd: number; page: number }> = [];
  for (const ph of pageHeaders) {
    for (const col of ph.dateColumns) {
      dateColumns.push({ ...col, page: ph.page });
    }
  }
  
  if (dateColumns.length === 0) {
    console.log("DEBUG: No dates found. Trying aggregated row search...");

    for (const [page, rows] of Array.from(rowsByPage.entries()).sort((a, b) => a[0] - b[0])) {
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        const rowText = row.map(item => item.str).join(" ");
        console.log(`Page ${page} Row ${i}: ${rowText.substring(0, 100)}`);
      }
    }
    
    const allText = allTextItems.map(i => i.str).join(" ");
    for (const pattern of DATE_PATTERNS) {
      const matches = Array.from(allText.matchAll(pattern));
      if (matches.length > 0) {
        console.log(`DEBUG: Found ${matches.length} date matches with pattern ${pattern}:`, matches.slice(0, 10).map(m => m[0]));
      }
    }
  }
  
  const medicationPattern = /\d+\s*(mg|mcg|ml|%|g|units?|iu)/i;

  // Some EMARs include medicines without strength units on the same line as forms/instructions.
  const medicationPatternLoose = /\b(\d+\s*(mg|mcg|ml|%|g|units?|iu)|tablets?|capsules?|gel|patch|spray|drops?|cream|ointment|lotion|powder)\b/i;

  interface SlotColumn {
    slot: string;
    xStart: number;
    xEnd: number;
  }

  interface DateRow {
    date: string;
    yStart: number;
    yEnd: number;
  }
  
  interface MedicationBlock {
    name: string;
    yStart: number;
    yEnd: number;
    timeSlots: Array<{ slot: string; y: number; yStart: number; yEnd: number }>;
  }
  
  const medicationBlocks: MedicationBlock[] = [];
  let allTimeSlots: string[] = [];

  // =====================================================================
  // TRANSPOSED LAYOUT SUPPORT
  // Some EMAR PDFs (like weekly summaries) render dates as ROW labels on the left,
  // and time slots as COLUMN headers along the top.
  // When we fail to detect date columns, try to detect this transposed grid.
  // =====================================================================
  const transposedPageCells: GridCell[] = [];
  const transposedMedications: Array<{ name: string; row: number; instructions: string; timeSlots: string[] }> = [];

  const normalizeSlot = (value: string) =>
    (value || "")
      .trim()
      .replace(/[–—]/g, "-")
      .replace(/\s*-\s*/g, "-")
      .replace(/\s+/g, " ");

  const normalizeDateLabel = (value: string) =>
    (value || "")
      .trim()
      .replace(/\s+/g, " ");

  const isLikelyDateLabel = (text: string) => {
    if (!text) return false;
    for (const pattern of DATE_PATTERNS) {
      // Avoid stateful global RegExp issues by compiling a fresh non-global regex
      const nonGlobal = new RegExp(pattern.source, pattern.flags.replace(/g/g, ""));
      if (nonGlobal.test(text)) return true;
    }
    return false;
  };

  const extractTimeSlotHeaderClustersForPage = (page: number): Array<{ headerY: number; columns: SlotColumn[] }> => {
    const pageItems = itemsByPage.get(page) || [];
    const debugTransposed = process.env.DEBUG_EMAR_GRID === 'true';
    type SlotCandidate = { slot: string; x: number; y: number; width: number };
    const candidates: SlotCandidate[] = [];

    for (const item of pageItems) {
      const text = item.str;
      if (!text) continue;
      const slotRegex = new RegExp(TIME_SLOT_PATTERN.source, "g");
      const matches = Array.from(text.matchAll(slotRegex));
      for (const m of matches) {
        if (!m[0]) continue;
        candidates.push({ slot: normalizeSlot(m[0]), x: item.x, y: item.y, width: item.width || 0 });
      }
    }

    if (debugTransposed && candidates.length === 0) {
      const timeLike = pageItems
        .filter(i => /\d{1,2}:\d{2}/.test(i.str))
        .slice(0, 12)
        .map(i => ({ str: i.str, x: i.x, y: i.y }));
      console.log(`[EMAR GRID DEBUG] page=${page} timeSlotCandidates=0 sampleTimeLike=`, timeLike);
    }

    if (candidates.length === 0) return [];

    // Cluster by Y to find the header line containing multiple time slots.
    const sorted = [...candidates].sort((a, b) => a.y - b.y);
    const clusters: SlotCandidate[][] = [];
    let current: SlotCandidate[] = [sorted[0]];
    let currentY = sorted[0].y;
    for (let i = 1; i < sorted.length; i++) {
      const c = sorted[i];
      if (Math.abs(c.y - currentY) <= yTolerance) {
        current.push(c);
      } else {
        clusters.push(current);
        current = [c];
        currentY = c.y;
      }
    }
    clusters.push(current);

    const clusterCandidates: Array<{ unique: SlotCandidate[]; spread: number; avgY: number }> = [];

    for (const cluster of clusters) {
      const bySlot = new Map<string, SlotCandidate>();
      for (const c of cluster) {
        const key = `${c.slot}|${Math.round(c.x / 40)}`;
        if (!bySlot.has(key)) bySlot.set(key, c);
      }
      const unique = Array.from(bySlot.values()).sort((a, b) => a.x - b.x);
      if (unique.length < 2) continue;

      const spread = unique[unique.length - 1].x - unique[0].x;
      // Stacked grids sometimes have more compressed slot headers on some pages.
      // Keep a modest spread threshold plus a very light "not hard-left" guard.
      // (Some PDFs report smaller X coordinates even for slot headers.)
      const minX = unique[0].x;
      if (spread < 60) continue;
      if (minX < 50) continue;

      const avgY = unique.reduce((sum, c) => sum + c.y, 0) / unique.length;
      clusterCandidates.push({ unique, spread, avgY });
    }

    if (clusterCandidates.length === 0) {
      if (debugTransposed) {
        const clusterSummaries = clusters.map((cluster) => {
          const bySlot = new Map<string, SlotCandidate>();
          for (const c of cluster) {
            const key = `${c.slot}|${Math.round(c.x / 40)}`;
            if (!bySlot.has(key)) bySlot.set(key, c);
          }
          const unique = Array.from(bySlot.values()).sort((a, b) => a.x - b.x);
          const spread = unique.length >= 2 ? unique[unique.length - 1].x - unique[0].x : 0;
          const avgY = unique.length ? unique.reduce((sum, c) => sum + c.y, 0) / unique.length : 0;
          return {
            uniqueCount: unique.length,
            spread: Number(spread.toFixed(1)),
            avgY: Number(avgY.toFixed(1)),
            minX: unique.length ? Number(unique[0].x.toFixed(1)) : 0,
            slots: unique.map((u) => u.slot).slice(0, 6),
          };
        });
        console.log(`[EMAR GRID DEBUG] page=${page} timeSlotHeadersNotFound clusters=`, clusterSummaries);
      }
      return [];
    }

    // Prefer higher-on-page headers first (larger Y).
    clusterCandidates.sort((a, b) => b.avgY - a.avgY);

    // Deduplicate very-close header lines (keep the richer one).
    const deduped: Array<{ unique: SlotCandidate[]; spread: number; avgY: number }> = [];
    for (const cand of clusterCandidates) {
      const existingIndex = deduped.findIndex((d) => Math.abs(d.avgY - cand.avgY) <= yTolerance);
      if (existingIndex === -1) {
        deduped.push(cand);
        continue;
      }
      const existing = deduped[existingIndex];
      const candBetter =
        cand.unique.length > existing.unique.length ||
        (cand.unique.length === existing.unique.length && cand.spread > existing.spread);
      if (candBetter) deduped[existingIndex] = cand;
    }

    const results: Array<{ headerY: number; columns: SlotColumn[] }> = [];
    for (const cand of deduped) {
      const cols: SlotColumn[] = [];
      for (let i = 0; i < cand.unique.length; i++) {
        const cur = cand.unique[i];
        const next = cand.unique[i + 1];
        cols.push({
          slot: cur.slot,
          xStart: cur.x - 5,
          xEnd: next ? next.x - 1 : cur.x + (cur.width || 0) + 80,
        });
      }
      results.push({ headerY: cand.avgY, columns: cols });
    }

    return results;
  };

  const extractDateRowsForPage = (page: number): DateRow[] => {
    const pageItems = itemsByPage.get(page) || [];
    type DateCandidate = { date: string; x: number; y: number };
    const candidates: DateCandidate[] = [];

    for (const item of pageItems) {
      const text = item.str;
      if (!text || text.length < 4) continue;
      // Only consider likely row-label positions (left area).
      if (item.x > 250) continue;
      for (const pattern of DATE_PATTERNS) {
        const dateRegex = new RegExp(pattern.source, pattern.flags);
        const matches = Array.from(text.matchAll(dateRegex));
        for (const m of matches) {
          if (!m[0]) continue;
          candidates.push({ date: normalizeDateLabel(m[0]), x: item.x, y: item.y });
        }
      }
    }

    if (candidates.length === 0) return [];

    // Consolidate by Y (date labels often appear twice: "Sun, 30 Nov" and "30 Nov" at same Y).
    // Cluster by Y, then choose the best label in that cluster.
    const sortedByY = [...candidates].sort((a, b) => b.y - a.y);
    const clusters: DateCandidate[][] = [];
    let current: DateCandidate[] = [sortedByY[0]];
    let currentY = sortedByY[0].y;
    for (let i = 1; i < sortedByY.length; i++) {
      const c = sortedByY[i];
      if (Math.abs(c.y - currentY) <= yTolerance * 1.25) {
        current.push(c);
      } else {
        clusters.push(current);
        current = [c];
        currentY = c.y;
      }
    }
    clusters.push(current);

    const points = clusters
      .map((cluster) => {
        const bestLabel = cluster
          .map((c) => c.date)
          .sort((a, b) => {
            const aHasDow = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/i.test(a);
            const bHasDow = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/i.test(b);
            if (aHasDow !== bHasDow) return aHasDow ? -1 : 1;
            return b.length - a.length;
          })[0];
        const avgY = cluster.reduce((sum, c) => sum + c.y, 0) / cluster.length;
        return { date: bestLabel, y: avgY };
      })
      .filter((p) => Boolean(p.date));

    // In this PDF family, larger Y appears to be higher on the page.
    points.sort((a, b) => b.y - a.y);

    const rowPadding = 26;
    const rows: DateRow[] = [];
    for (let i = 0; i < points.length; i++) {
      const cur = points[i];
      const prev = points[i - 1];
      const next = points[i + 1];

      const yStart = prev ? (prev.y + cur.y) / 2 : cur.y + rowPadding;
      const yEnd = next ? (cur.y + next.y) / 2 : cur.y - rowPadding;

      rows.push({ date: cur.date, yStart, yEnd });
    }

    return rows;
  };

  const splitRowIntoSegments = (
    rowItems: TextItem[],
    gapThreshold: number
  ): Array<{ items: TextItem[]; xMin: number; xMax: number }> => {
    if (rowItems.length === 0) return [];
    const sorted = [...rowItems].sort((a, b) => a.x - b.x);
    const segments: Array<{ items: TextItem[]; xMin: number; xMax: number }> = [];
    let current: TextItem[] = [sorted[0]];
    let currentMin = sorted[0].x;
    let currentMax = sorted[0].x + (sorted[0].width || 0);

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const gap = cur.x - prev.x;
      if (gap > gapThreshold) {
        segments.push({ items: current, xMin: currentMin, xMax: currentMax });
        current = [cur];
        currentMin = cur.x;
        currentMax = cur.x + (cur.width || 0);
        continue;
      }
      current.push(cur);
      currentMax = Math.max(currentMax, cur.x + (cur.width || 0));
    }
    segments.push({ items: current, xMin: currentMin, xMax: currentMax });
    return segments;
  };

  const extractMedicationCandidatesForPage = (
    page: number,
    headerY: number | null,
    upperBoundY: number | null
  ): Array<{ name: string; x: number; y: number; xMin: number; xMax: number }> => {
    const pageItems = itemsByPage.get(page) || [];
    const rows = groupByY(pageItems, yTolerance);
    const candidates: Array<{ name: string; x: number; y: number; xMin: number; xMax: number }> = [];

    for (const row of rows) {
      const avgY = row.reduce((sum, i) => sum + i.y, 0) / row.length;

      if (headerY !== null) {
        if (upperBoundY !== null && avgY >= upperBoundY) continue;
        if (avgY <= headerY + 5) continue;
        const distanceFromHeader = avgY - headerY;
        if (distanceFromHeader > 220) continue;
      }

      const segments = splitRowIntoSegments(row, 45);
      for (const segment of segments) {
        // Focus on the left content region for medication labels.
        if (segment.xMin > 520) continue;
        const text = segment.items.map(i => i.str).join(" ").replace(/\s+/g, " ").trim();
        if (!text) continue;
        if (isLikelyDateLabel(text)) continue;
        const slotHeaderRegex = new RegExp(TIME_SLOT_PATTERN.source, "i");
        if (slotHeaderRegex.test(text)) continue;

        const routeIndex = text.toLowerCase().indexOf("route");
        const cleaned = (routeIndex > 0 ? text.slice(0, routeIndex) : text).trim();
        if (!cleaned) continue;

        const matchesMed = medicationPattern.test(cleaned) || medicationPatternLoose.test(cleaned);
        let candidateName = cleaned;

        if (!matchesMed && /route/i.test(text)) {
          const routeParts = text
            .split(/route/i)
            .map(part => part.trim())
            .filter(part => part.length > 0);
          if (routeParts.length > 0) {
            candidateName = routeParts[0];
          }
        }

        const validCandidate =
          matchesMed ||
          (candidateName !== cleaned && /[a-zA-Z]/.test(candidateName) && candidateName.length >= 3);
        if (!validCandidate) continue;

        const xCenter = (segment.xMin + segment.xMax) / 2;
        candidates.push({
          name: candidateName.substring(0, 140).trim(),
          x: xCenter,
          y: avgY,
          xMin: segment.xMin,
          xMax: segment.xMax,
        });
      }
    }

    const deduped: Array<{ name: string; x: number; y: number; xMin: number; xMax: number }> = [];
    for (const candidate of candidates.sort((a, b) => a.x - b.x)) {
      const existing = deduped.find((d) => Math.abs(d.x - candidate.x) <= 40);
      if (!existing) {
        deduped.push(candidate);
        continue;
      }
      if (candidate.name.length > existing.name.length) {
        existing.name = candidate.name;
        existing.y = candidate.y;
        existing.x = candidate.x;
        existing.xMin = candidate.xMin;
        existing.xMax = candidate.xMax;
      }
    }
    return deduped;
  };

  const inferMedicationNameForPage = (page: number, headerY: number | null, upperBoundY: number | null): string => {
    const pageItems = itemsByPage.get(page) || [];
    const rows = groupByY(pageItems, yTolerance);

    let best: { text: string; distanceFromHeader: number; score: number } | null = null;
    for (const row of rows) {
      // Focus on the left content region to avoid combining multiple unrelated columns.
      const leftRowItems = row.filter((i) => i.x < 420);
      const rowText = leftRowItems.map(i => i.str).join(" ").replace(/\s+/g, " ").trim();
      if (!rowText) continue;

      // Prefer rows above the time-slot header (where med name & instructions usually are)
      if (headerY !== null) {
        const avgY = row.reduce((sum, i) => sum + i.y, 0) / row.length;
        // In this PDF family, larger Y is higher on the page.
        // Medication text typically sits ABOVE the slot header line.
        if (upperBoundY !== null && avgY >= upperBoundY) continue;
        if (avgY <= headerY + 5) continue;

        // Prefer the row closest above the header (usually the actual medication label for the table).
        const distanceFromHeader = avgY - headerY;
        // Ignore very far-away rows (likely other sections)
        if (distanceFromHeader > 220) continue;

        // Truncate common trailing sections.
        const routeIndex = rowText.toLowerCase().indexOf("route");
        const cleaned = (routeIndex > 0 ? rowText.slice(0, routeIndex) : rowText).trim();
        if (!cleaned) continue;

        const matchesMed = medicationPattern.test(cleaned) || medicationPatternLoose.test(cleaned);
        if (!matchesMed) continue;

        const score = cleaned.length;
        if (!best) {
          best = { text: cleaned, distanceFromHeader, score };
          continue;
        }
        if (distanceFromHeader < best.distanceFromHeader) {
          best = { text: cleaned, distanceFromHeader, score };
          continue;
        }
        if (distanceFromHeader === best.distanceFromHeader && score > best.score) {
          best = { text: cleaned, distanceFromHeader, score };
        }
        continue;
      }

      // If we don't have a headerY, fall back to the previous heuristics.
      if (isLikelyDateLabel(rowText)) continue;
      {
        const slotHeaderRegex = new RegExp(TIME_SLOT_PATTERN.source, "i");
        if (slotHeaderRegex.test(rowText)) continue;
      }
      const matchesMed = medicationPattern.test(rowText) || medicationPatternLoose.test(rowText);
      if (!matchesMed) continue;
      const routeIndex = rowText.toLowerCase().indexOf("route");
      const cleaned = (routeIndex > 0 ? rowText.slice(0, routeIndex) : rowText).trim();
      if (!cleaned) continue;
      const score = cleaned.length;
      if (!best) {
        best = { text: cleaned, distanceFromHeader: Number.POSITIVE_INFINITY, score };
      } else if (score > best.score) {
        best = { text: cleaned, distanceFromHeader: best.distanceFromHeader, score };
      }
    }

    return (best?.text || "").substring(0, 140).trim();
  };

  // Build medication blocks & time slots per page (after detected header)
  const medicationBlocksByPage = new Map<number, MedicationBlock[]>();
  for (const ph of pageHeaders) {
    const rows = rowsByPage.get(ph.page) || [];
    const medsOnPage: MedicationBlock[] = [];

    for (let i = ph.headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const leftItems = row.filter(item => item.x < 250);
      const leftText = leftItems.map(item => item.str).join(" ");

      if (medicationPattern.test(leftText)) {
        const medName = leftText.substring(0, 120).trim();
        const avgY = row.reduce((sum, item) => sum + item.y, 0) / row.length;
        medsOnPage.push({
          name: medName,
          yStart: avgY - 5,
          yEnd: 0,
          timeSlots: []
        });
      }
    }

    for (let i = 0; i < medsOnPage.length; i++) {
      const current = medsOnPage[i];
      const next = medsOnPage[i + 1];
      current.yEnd = next ? next.yStart - 1 : current.yStart + 150;
    }

    medicationBlocksByPage.set(ph.page, medsOnPage);
  }

  // Detect time slots and assign to medication blocks on the same page
  for (const ph of pageHeaders) {
    const rows = rowsByPage.get(ph.page) || [];
    const medsOnPage = medicationBlocksByPage.get(ph.page) || [];

    for (let i = ph.headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const rowText = row.map(item => item.str).join(" ");
      const timeSlotMatches = Array.from(rowText.matchAll(TIME_SLOT_PATTERN));

      for (const match of timeSlotMatches) {
        const normalizedSlot = match[0].replace('–', '-');
        const avgY = row.reduce((sum, item) => sum + item.y, 0) / row.length;

        if (!allTimeSlots.includes(normalizedSlot)) {
          allTimeSlots.push(normalizedSlot);
        }

        for (const med of medsOnPage) {
          if (avgY >= med.yStart && avgY < med.yEnd) {
            const existingSlot = med.timeSlots.find(ts => ts.slot === normalizedSlot);
            if (!existingSlot) {
              med.timeSlots.push({
                slot: normalizedSlot,
                y: avgY,
                yStart: avgY - 20,
                yEnd: avgY + 20
              });
            }
            break;
          }
        }
      }
    }
  }

  // Flatten medication blocks
  for (const [page, meds] of Array.from(medicationBlocksByPage.entries()).sort((a, b) => a[0] - b[0])) {
    for (const m of meds) medicationBlocks.push({ ...m, name: m.name });
  }

  // If no date columns were detected, attempt the transposed layout extraction.
  if (pageHeaders.length === 0) {
    const debugTransposed = process.env.DEBUG_EMAR_GRID === 'true';
    for (const [page] of Array.from(itemsByPage.entries()).sort((a, b) => a[0] - b[0])) {
      const dateRows = extractDateRowsForPage(page);
      const headerClusters = extractTimeSlotHeaderClustersForPage(page);
      if (debugTransposed) {
        console.log(`[EMAR GRID DEBUG] page=${page} headerClusters=${headerClusters.length} dateRows=${dateRows.length}`);
      }

      if (headerClusters.length === 0 || dateRows.length < 2) {
        if (debugTransposed) {
          console.log(
            `[EMAR GRID DEBUG] SKIP page=${page} reason=${headerClusters.length === 0 ? 'no_header_clusters' : 'insufficient_date_rows'}`
          );
        }
        continue;
      }

      const pageItems = itemsByPage.get(page) || [];

      for (let sectionIndex = 0; sectionIndex < headerClusters.length; sectionIndex++) {
        const section = headerClusters[sectionIndex];
        const nextSection = headerClusters[sectionIndex + 1];
        const prevSection = headerClusters[sectionIndex - 1];

        // Limit cells to the vertical band between this header and the next header below (stacked grids).
        const yUpper = section.headerY - 2;
        // Some PDFs yield negative Y coordinates near the bottom of the page.
        // Use -Infinity so we don't drop valid lower rows.
        const yLower = nextSection ? nextSection.headerY + 2 : Number.NEGATIVE_INFINITY;

        const sectionDateRows = dateRows.filter((dr) => {
          const midY = (dr.yStart + dr.yEnd) / 2;
          return midY <= yUpper && midY >= yLower;
        });

        if (debugTransposed) {
          console.log(
            `[EMAR GRID DEBUG] page=${page} section=${sectionIndex} headerY=${section.headerY.toFixed(1)} columns=${section.columns.length} yUpper=${yUpper.toFixed(1)} yLower=${yLower.toFixed(1)} sectionDateRows=${sectionDateRows.length}`
          );
        }

        if (section.columns.length === 0 || sectionDateRows.length < 2) {
          if (debugTransposed) {
            console.log(
              `[EMAR GRID DEBUG] SKIP page=${page} section=${sectionIndex} reason=${section.columns.length === 0 ? 'no_columns' : 'insufficient_section_date_rows'}`
            );
          }
          continue;
        }

        // Capture global slots/dates
        for (const c of section.columns) {
          if (!allTimeSlots.includes(c.slot)) allTimeSlots.push(c.slot);
        }
        for (const r of sectionDateRows) {
          if (!dates.includes(r.date)) dates.push(r.date);
        }

        // Upper bound prevents the medication-name heuristic from selecting the prior stacked section.
        const upperBoundY = prevSection ? prevSection.headerY - 2 : null;
        const medCandidates = extractMedicationCandidatesForPage(page, section.headerY, upperBoundY);

        const assignColumnsToMeds = (
          columns: SlotColumn[],
          meds: Array<{ name: string; x: number; y: number; xMin: number; xMax: number }>
        ): Map<number, SlotColumn[]> => {
          const grouped = new Map<number, SlotColumn[]>();
          for (let i = 0; i < meds.length; i++) grouped.set(i, []);
          for (const col of columns) {
            const center = (col.xStart + col.xEnd) / 2;
            let bestIndex = 0;
            let bestDist = Number.POSITIVE_INFINITY;
            let inBandIndex = -1;
            let inBandDist = Number.POSITIVE_INFINITY;
            for (let i = 0; i < meds.length; i++) {
              const dist = Math.abs(center - meds[i].x);
              const bandMin = Math.max(0, meds[i].xMin - 40);
              const bandMax = meds[i].xMax + 120;
              if (center >= bandMin && center <= bandMax && dist < inBandDist) {
                inBandIndex = i;
                inBandDist = dist;
              }
              if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
              }
            }
            const targetIndex = inBandIndex >= 0 ? inBandIndex : bestIndex;
            grouped.get(targetIndex)!.push(col);
          }

          // Ensure each medication gets at least one column, even if shared.
          for (let i = 0; i < meds.length; i++) {
            if ((grouped.get(i) || []).length > 0) continue;
            let closest: SlotColumn | null = null;
            let closestDist = Number.POSITIVE_INFINITY;
            for (const col of columns) {
              const center = (col.xStart + col.xEnd) / 2;
              const dist = Math.abs(center - meds[i].x);
              if (dist < closestDist) {
                closestDist = dist;
                closest = col;
              }
            }
            if (closest) grouped.get(i)!.push(closest);
          }
          return grouped;
        };

        const medGroups =
          medCandidates.length > 0
            ? assignColumnsToMeds(section.columns, medCandidates)
            : new Map<number, SlotColumn[]>([
                [0, section.columns],
              ]);

        const medsForSection =
          medCandidates.length > 0
            ? medCandidates
            : [
                {
                  name:
                    inferMedicationNameForPage(page, section.headerY, upperBoundY) ||
                    `Medication page ${page} block ${sectionIndex + 1}`,
                  x: section.columns[0]?.xStart || 0,
                  y: section.headerY,
                },
              ];

        const dedupeColumnsBySlot = (columns: SlotColumn[], targetX: number): SlotColumn[] => {
          const bySlot = new Map<string, SlotColumn>();
          for (const col of columns) {
            const slotKey = normalizeSlot(col.slot);
            const center = (col.xStart + col.xEnd) / 2;
            const existing = bySlot.get(slotKey);
            if (!existing) {
              bySlot.set(slotKey, col);
              continue;
            }
            const existingCenter = (existing.xStart + existing.xEnd) / 2;
            if (Math.abs(center - targetX) < Math.abs(existingCenter - targetX)) {
              bySlot.set(slotKey, col);
            }
          }
          return Array.from(bySlot.values());
        };

        for (let i = 0; i < medsForSection.length; i++) {
          const med = medsForSection[i];
          const assignedColumnsRaw = medGroups.get(i) || [];
          const assignedColumns = dedupeColumnsBySlot(assignedColumnsRaw, med.x);
          if (assignedColumns.length === 0) continue;

          transposedMedications.push({
            name: med.name,
            row: transposedMedications.length,
            instructions: "",
            timeSlots: assignedColumns.map(c => c.slot),
          });

          for (const dr of sectionDateRows) {
            for (const col of assignedColumns) {
              const cellItems = pageItems.filter(item =>
                item.x >= col.xStart &&
                item.x < col.xEnd &&
                item.y <= dr.yStart &&
                item.y >= dr.yEnd &&
                item.y <= yUpper &&
                item.y >= yLower
              );

              const content = cellItems.map(i => i.str).join(" ");
              const contentUpper = content.toUpperCase();

              let code = "BLANK";
              const codeMatch = contentUpper.match(CODE_PATTERN_SINGLE);
              if (codeMatch) code = normalizeGridCode(codeMatch[1]);

              let careWorker = "";
              const initialsMatch = content.match(/\b([A-Z]{2,3})\b/);
              if (initialsMatch && !["AD", "AS", "MU", "NH", "SA", "FA", "PRN"].includes(initialsMatch[1])) {
                careWorker = initialsMatch[1];
              }

              let time = "";
              const timeMatch = content.match(/\d{1,2}:\d{2}/);
              // Avoid confusing time slots with an actual administered time
              if (timeMatch && !TIME_SLOT_PATTERN.test(content)) time = timeMatch[0];

              transposedPageCells.push({
                medication: med.name,
                date: dr.date,
                timeSlot: col.slot,
                content,
                code,
                careWorker,
                time,
              });
            }
          }
        }
      }
    }
  }
  
  console.log(`DEBUG: Found ${allTimeSlots.length} time slots:`, allTimeSlots);
  
  const cells: GridCell[] = [];

  // Generate cells per page using that page's header columns and medication blocks
  for (const ph of pageHeaders) {
    const page = ph.page;
    const medsOnPage = medicationBlocksByPage.get(page) || [];
    const dateColsOnPage = ph.dateColumns;

    for (const med of medsOnPage) {
      for (const dateCol of dateColsOnPage) {
        const slotsToUse = med.timeSlots.length > 0 ? med.timeSlots :
          allTimeSlots.map(slot => ({ slot, y: med.yStart + 30, yStart: med.yStart, yEnd: med.yEnd }));

        for (const ts of slotsToUse) {
          const cellItems = allTextItems.filter(item =>
            item.page === page &&
            item.x >= dateCol.xStart &&
            item.x < dateCol.xEnd &&
            item.y >= (med.timeSlots.length > 0 ? ts.yStart : med.yStart) &&
            item.y < (med.timeSlots.length > 0 ? ts.yEnd : med.yEnd)
          );
        
          let code = "BLANK";
          let careWorker = "";
          let time = "";
          let content = cellItems.map(i => i.str).join(" ");
        
          const contentUpper = content.toUpperCase();
          const codeMatch = contentUpper.match(CODE_PATTERN_SINGLE);
          if (codeMatch) {
            code = normalizeGridCode(codeMatch[1]);
          }
        
          const initialsMatch = content.match(/\b([A-Z]{2,3})\b/);
          if (initialsMatch && !["AD", "AS", "MU", "NH", "SA", "FA", "PRN"].includes(initialsMatch[1])) {
            careWorker = initialsMatch[1];
          }
        
          const timeMatch = content.match(/\d{1,2}:\d{2}/);
          if (timeMatch && !content.includes("-")) {
            time = timeMatch[0];
          }
        
          cells.push({
            medication: med.name,
            date: dateCol.date,
            timeSlot: ts.slot,
            content,
            code,
            careWorker,
            time
          });
        }
      }
    }
  }

  // If transposed mode produced cells, prefer them.
  if (cells.length === 0 && transposedPageCells.length > 0) {
    cells.push(...transposedPageCells);
  }
  
  if (cells.length === 0 && medicationBlocks.length > 0 && dateColumns.length === 0) {
    console.log("DEBUG: No cells generated - grid structure not detected. Falling back to simpler approach.");
    
    for (const med of medicationBlocks) {
      for (const slot of allTimeSlots.length > 0 ? allTimeSlots : ["Morning", "Noon", "Evening", "Night"]) {
        cells.push({
          medication: med.name,
          date: "Unknown",
          timeSlot: slot,
          content: "",
          code: "BLANK",
          careWorker: "",
          time: ""
        });
      }
    }
  }
  
  let serviceUserName = "";
  const namePatterns = [/Name:\s*([A-Z][a-z]+\s+[A-Z])/i, /Service User:\s*([A-Z][a-z]+\s+[A-Z])/i];
  for (const pattern of namePatterns) {
    const match = rawText.match(pattern);
    if (match) {
      const fullName = match[1];
      const parts = fullName.split(/\s+/);
      serviceUserName = parts.map(p => p[0]).join(".") + ".";
      break;
    }
  }
  
  let allergies = "No known allergies";
  const allergyMatch = rawText.match(/Allerg(?:y|ies)[:\s]+([^.]+)/i);
  if (allergyMatch) {
    allergies = allergyMatch[1].trim();
  }
  
  const detectedDatesCount = dates.length;
  const detectedMedsCount = medicationBlocks.length > 0 ? medicationBlocks.length : transposedMedications.length;
  const parserMode =
    medicationBlocks.length > 0 ? "grid" : transposedMedications.length > 0 ? "transposed" : "unknown";
  console.log(
    `DEBUG: Parser complete (${parserMode}) - ${detectedDatesCount} dates, ${detectedMedsCount} meds, ${cells.length} cells`
  );
  
  return {
    serviceUserName,
    allergies,
    auditPeriodStart: dates[0] || "",
    auditPeriodEnd: dates[dates.length - 1] || "",
    dates,
    timeSlots: allTimeSlots,
    medications: (medicationBlocks.length > 0
      ? medicationBlocks.map((m, i) => ({
          name: m.name,
          row: i,
          instructions: "",
          timeSlots: m.timeSlots.map(ts => ts.slot)
        }))
      : transposedMedications),
    cells,
    rawText,
    debugInfo: {
      totalTextItems: allTextItems.length,
      dateColumnsFound: dates.length,
      medicationsFound: (medicationBlocks.length > 0 ? medicationBlocks.length : transposedMedications.length),
      timeSlotsFound: allTimeSlots.length,
      cellsGenerated: cells.length
    }
  };
}

function groupByY(items: TextItem[], tolerance: number): TextItem[][] {
  if (items.length === 0) return [];
  
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const rows: TextItem[][] = [];
  let currentRow: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;
  
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= tolerance) {
      currentRow.push(item);
    } else {
      rows.push(currentRow.sort((a, b) => a.x - b.x));
      currentRow = [item];
      currentY = item.y;
    }
  }
  
  if (currentRow.length > 0) {
    rows.push(currentRow.sort((a, b) => a.x - b.x));
  }
  
  return rows;
}

export function extractCodesFromCell(content: string): { code: string; careWorker: string; time: string } {
  const codes = ["AD", "AS", "P", "R", "MU", "NH", "SA", "FA", "PRN", "PRN-R", "PRN-AD", "PRN-AS", "MISSED", "N/A"];
  let foundCode = "BLANK";
  let careWorker = "";
  let time = "";
  
  const upperContent = content.toUpperCase();
  const codeMatch = upperContent.match(CODE_PATTERN_SINGLE);
  if (codeMatch) {
    foundCode = normalizeGridCode(codeMatch[1]);
  } else {
    for (const code of codes) {
      if (upperContent.includes(code)) {
        foundCode = code;
        break;
      }
    }
  }
  
  const initialsMatch = content.match(/\b([A-Z]{2,3})\b/);
  if (initialsMatch && !codes.includes(initialsMatch[1])) {
    careWorker = initialsMatch[1];
  }
  
  const timeMatch = content.match(/(\d{1,2}:\d{2})/);
  if (timeMatch) {
    time = timeMatch[1];
  }
  
  return { code: foundCode, careWorker, time };
}
