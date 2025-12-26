import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

interface GridCell {
  medication: string;
  date: string;
  timeSlot: string;
  content: string;
  code: string;
  careWorker: string;
  time: string;
}

interface ParsedEMAR {
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
  /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
  /\d{1,2}\/\d{1,2}/g,
  /\d{1,2}-\d{1,2}-\d{2,4}/g,
];
const TIME_SLOT_PATTERN = /\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}/g;
const CODE_PATTERN = /\b(AD|AS|P|R|MU|NH|SA|PRN|N\/A)\b/gi;
const TIME_PATTERN = /\d{1,2}:\d{2}/g;
const INITIALS_PATTERN = /\b[A-Z]{2,3}\b/g;

export async function parseEMARGrid(pdfBuffer: Buffer): Promise<ParsedEMAR> {
  const uint8Array = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
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
  }
  
  const yTolerance = 12;
  const rows = groupByY(allTextItems, yTolerance);
  
  let headerRowIndex = -1;
  let dates: string[] = [];
  let dateColumns: Array<{ date: string; xStart: number; xEnd: number }> = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowText = row.map(item => item.str).join("");
    
    let foundDates: Array<{ date: string; xStart: number; xEnd: number }> = [];
    
    for (const pattern of DATE_PATTERNS) {
      const matches = Array.from(rowText.matchAll(pattern));
      for (const match of matches) {
        if (match[0]) {
          const dateStr = match[0];
          const matchIndex = match.index || 0;
          
          let charCount = 0;
          let xStart = row[0]?.x || 0;
          let xEnd = xStart + 50;
          
          for (const item of row) {
            const itemEnd = charCount + item.str.length;
            if (charCount <= matchIndex && matchIndex < itemEnd) {
              xStart = item.x - 5;
            }
            if (charCount <= matchIndex + dateStr.length && matchIndex + dateStr.length <= itemEnd) {
              xEnd = item.x + item.width + 5;
            }
            charCount = itemEnd;
          }
          
          foundDates.push({ date: dateStr, xStart, xEnd });
        }
      }
      if (foundDates.length >= 5) break;
    }
    
    if (foundDates.length >= 5) {
      headerRowIndex = i;
      foundDates.sort((a, b) => a.xStart - b.xStart);
      
      for (let j = 0; j < foundDates.length; j++) {
        const current = foundDates[j];
        const next = foundDates[j + 1];
        
        dateColumns.push({
          date: current.date,
          xStart: current.xStart,
          xEnd: next ? next.xStart - 1 : current.xEnd + 80
        });
        dates.push(current.date);
      }
      
      console.log(`DEBUG: Found ${foundDates.length} dates in row ${i}:`, dates);
      break;
    }
  }
  
  if (dateColumns.length === 0) {
    console.log("DEBUG: No dates found. Trying aggregated row search...");
    
    for (let i = 0; i < Math.min(30, rows.length); i++) {
      const row = rows[i];
      const rowText = row.map(item => item.str).join(" ");
      console.log(`Row ${i}: ${rowText.substring(0, 100)}`);
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
  
  interface MedicationBlock {
    name: string;
    yStart: number;
    yEnd: number;
    timeSlots: Array<{ slot: string; y: number; yStart: number; yEnd: number }>;
  }
  
  const medicationBlocks: MedicationBlock[] = [];
  let allTimeSlots: string[] = [];
  
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const rowText = row.map(item => item.str).join(" ");
    const leftItems = row.filter(item => item.x < 250);
    const leftText = leftItems.map(item => item.str).join(" ");
    
    if (medicationPattern.test(leftText)) {
      const medName = leftText.substring(0, 120).trim();
      const avgY = row.reduce((sum, item) => sum + item.y, 0) / row.length;
      
      medicationBlocks.push({
        name: medName,
        yStart: avgY - 5,
        yEnd: 0,
        timeSlots: []
      });
    }
  }
  
  for (let i = 0; i < medicationBlocks.length; i++) {
    const current = medicationBlocks[i];
    const next = medicationBlocks[i + 1];
    current.yEnd = next ? next.yStart - 1 : current.yStart + 150;
  }
  
  console.log(`DEBUG: Found ${medicationBlocks.length} medication blocks`);
  
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const rowText = row.map(item => item.str).join(" ");
    const timeSlotMatches = Array.from(rowText.matchAll(TIME_SLOT_PATTERN));
    
    for (const match of timeSlotMatches) {
      const normalizedSlot = match[0].replace('–', '-');
      const avgY = row.reduce((sum, item) => sum + item.y, 0) / row.length;
      
      if (!allTimeSlots.includes(normalizedSlot)) {
        allTimeSlots.push(normalizedSlot);
      }
      
      for (const med of medicationBlocks) {
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
  
  console.log(`DEBUG: Found ${allTimeSlots.length} time slots:`, allTimeSlots);
  
  const cells: GridCell[] = [];
  
  for (const med of medicationBlocks) {
    for (const dateCol of dateColumns) {
      const slotsToUse = med.timeSlots.length > 0 ? med.timeSlots : 
        allTimeSlots.map(slot => ({ slot, y: med.yStart + 30, yStart: med.yStart, yEnd: med.yEnd }));
      
      for (const ts of slotsToUse) {
        const cellItems = allTextItems.filter(item => 
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
        const codeMatch = contentUpper.match(/\b(AD|AS|P|R|MU|NH|SA|PRN)\b/);
        if (codeMatch) {
          code = codeMatch[1];
        }
        
        const initialsMatch = content.match(/\b([A-Z]{2,3})\b/);
        if (initialsMatch && !["AD", "AS", "MU", "NH", "SA", "PRN"].includes(initialsMatch[1])) {
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
  
  console.log(`DEBUG: Parser complete - ${dateColumns.length} dates, ${medicationBlocks.length} meds, ${cells.length} cells`);
  
  return {
    serviceUserName,
    allergies,
    auditPeriodStart: dates[0] || "",
    auditPeriodEnd: dates[dates.length - 1] || "",
    dates,
    timeSlots: allTimeSlots,
    medications: medicationBlocks.map((m, i) => ({
      name: m.name,
      row: i,
      instructions: ""
    })),
    cells,
    rawText,
    debugInfo: {
      totalTextItems: allTextItems.length,
      dateColumnsFound: dateColumns.length,
      medicationsFound: medicationBlocks.length,
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
  const codes = ["AD", "AS", "P", "R", "MU", "NH", "SA", "PRN", "N/A"];
  let foundCode = "BLANK";
  let careWorker = "";
  let time = "";
  
  const upperContent = content.toUpperCase();
  for (const code of codes) {
    if (upperContent.includes(code)) {
      foundCode = code;
      break;
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
