/**
 * Zone allocation for rostering.
 *
 * A "Customer Branch" identifies a Region (e.g. Durham). A Region is split into a fixed set of
 * Sections (e.g. "Durham Zone 3 - Aycliffe"). Every service user belongs to exactly one Section,
 * decided from their postcode (primary signal) with their Customer Area / address text used to
 * disambiguate when a postcode district is shared by more than one section.
 *
 * Everything here is pure and framework-free so it can be unit tested under Vitest and reused by
 * any rostering surface.
 */

export interface ZoneSectionDef {
  /** Stable id, unique within a region. */
  id: string;
  /** Display name, e.g. "Durham Zone 3 - Aycliffe". */
  name: string;
  /** Postcode outward codes that map to this section, e.g. ["DL5"]. Stored uppercased. */
  outwardCodes: string[];
  /** Lower-cased town / locality keywords used to disambiguate shared outward codes. */
  keywords: string[];
}

export interface ZoneRegionDef {
  /** Customer Branch value, e.g. "Durham". */
  region: string;
  sections: ZoneSectionDef[];
}

export type MatchBasis = "postcode+area" | "area" | "postcode" | "none";

export interface AllocationResult {
  sectionId: string | null;
  sectionName: string | null;
  matchedBy: MatchBasis;
  /** True when more than one section was a plausible target; `sectionId` is the best guess. */
  ambiguous: boolean;
  /** Section ids considered plausible (length > 1 only when ambiguous). */
  candidates: string[];
  /** Outward code that was extracted from the input, if any. */
  outwardCode: string | null;
}

export interface AllocationInput {
  postcode?: string | null;
  area?: string | null;
  address?: string | null;
}

/**
 * Extract a UK postcode outward code (district), e.g. "SW1A", "DL5", "DH9" from free text.
 * Prefers a full postcode; falls back to a standalone outward-looking token.
 */
export function extractPostcodeOutward(text: string | null | undefined): string | null {
  if (!text) return null;
  const upper = text.toUpperCase();
  const full = upper.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*\d[A-Z]{2}\b/);
  if (full) return full[1];
  const loose = upper.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b(?=[\s,]|$)/);
  return loose ? loose[1] : null;
}

/** Letters-only prefix of an outward code, e.g. "DL5" -> "DL" (the postcode area). */
export function postcodeAreaPrefix(outward: string | null): string | null {
  if (!outward) return null;
  const m = outward.toUpperCase().match(/^[A-Z]+/);
  return m ? m[0] : null;
}

const norm = (value: string | null | undefined): string =>
  String(value ?? "").trim().toLowerCase();

const keywordMatches = (haystack: string, keyword: string): boolean => {
  const k = keyword.trim().toLowerCase();
  if (!k) return false;
  // Word-boundary-ish match so "crook" doesn't match "brook"; allow multi-word keywords.
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
};

/**
 * Allocate a single location to a section within the given region.
 *
 * Precedence:
 *  1. Sections matched by BOTH outward code and a locality keyword -> exact, unambiguous.
 *  2. A single section matched by locality keyword -> "area".
 *  3. A single section matched by outward code -> "postcode".
 *  4. Multiple sections matched (by keyword or postcode) and none disambiguated -> ambiguous,
 *     best guess = first matching section (definition order), all listed in `candidates`.
 *  5. No match -> unallocated.
 */
export function allocate(input: AllocationInput, region: ZoneRegionDef): AllocationResult {
  const sections = region?.sections ?? [];
  const areaText = norm(input.area);
  const addressText = norm(input.address);
  const searchText = `${areaText} ${addressText}`.trim();

  const outward =
    extractPostcodeOutward(input.postcode) ??
    extractPostcodeOutward(input.address) ??
    extractPostcodeOutward(input.area);
  const outwardUpper = outward ? outward.toUpperCase() : null;

  const keywordHits: ZoneSectionDef[] = searchText
    ? sections.filter((s) => s.keywords.some((kw) => keywordMatches(searchText, kw)))
    : [];

  const postcodeHits: ZoneSectionDef[] = outwardUpper
    ? sections.filter((s) => s.outwardCodes.map((c) => c.toUpperCase()).includes(outwardUpper))
    : [];

  const none = (): AllocationResult => ({
    sectionId: null,
    sectionName: null,
    matchedBy: "none",
    ambiguous: false,
    candidates: [],
    outwardCode: outwardUpper,
  });

  const pick = (
    section: ZoneSectionDef,
    matchedBy: MatchBasis,
    ambiguous: boolean,
    candidates: ZoneSectionDef[],
  ): AllocationResult => ({
    sectionId: section.id,
    sectionName: section.name,
    matchedBy,
    ambiguous,
    candidates: candidates.map((c) => c.id),
    outwardCode: outwardUpper,
  });

  // 1. Intersection of postcode + keyword is the strongest, unambiguous signal.
  if (keywordHits.length && postcodeHits.length) {
    const intersection = keywordHits.filter((k) => postcodeHits.includes(k));
    if (intersection.length === 1) return pick(intersection[0], "postcode+area", false, intersection);
    if (intersection.length > 1) return pick(intersection[0], "postcode+area", true, intersection);
  }

  // 2. A single keyword match wins outright (locality names are highly specific).
  if (keywordHits.length === 1) return pick(keywordHits[0], "area", false, keywordHits);

  // 3. A single postcode match.
  if (postcodeHits.length === 1) return pick(postcodeHits[0], "postcode", false, postcodeHits);

  // 4. Ambiguous: multiple keyword hits, or multiple postcode hits.
  if (keywordHits.length > 1) return pick(keywordHits[0], "area", true, keywordHits);
  if (postcodeHits.length > 1) return pick(postcodeHits[0], "postcode", true, postcodeHits);

  return none();
}

/* ------------------------------------------------------------------ *
 * Bulk ECM allocation
 * ------------------------------------------------------------------ */

export interface EcmRecord {
  serviceUser: string;
  region: string | null;
  area: string | null;
  postcode: string | null;
  address: string | null;
  /** Original row index for traceability. */
  rowIndex: number;
}

export interface AllocatedServiceUser {
  serviceUser: string;
  region: string | null;
  area: string | null;
  postcode: string | null;
  address: string | null;
  allocation: AllocationResult;
}

export interface SectionBucket {
  sectionId: string;
  sectionName: string;
  serviceUsers: AllocatedServiceUser[];
}

export interface BulkAllocationResult {
  region: string;
  sections: SectionBucket[];
  unallocated: AllocatedServiceUser[];
  ambiguous: AllocatedServiceUser[];
  totalServiceUsers: number;
}

/**
 * Merge multiple ECM rows belonging to the same service user into a single record, preferring the
 * first non-empty value for each field. This keeps a service user together in one section.
 */
export function dedupeServiceUsers(records: EcmRecord[]): EcmRecord[] {
  const byUser = new Map<string, EcmRecord>();
  for (const rec of records) {
    const key = norm(rec.serviceUser);
    if (!key) continue;
    const existing = byUser.get(key);
    if (!existing) {
      byUser.set(key, { ...rec });
      continue;
    }
    existing.region = existing.region || rec.region;
    existing.area = existing.area || rec.area;
    existing.postcode = existing.postcode || rec.postcode;
    existing.address = existing.address || rec.address;
  }
  return [...byUser.values()];
}

/**
 * Allocate every service user in `records` to a section of `region`. Rows belonging to the same
 * service user are merged first so each person lands in exactly one section.
 */
export function allocateRecords(records: EcmRecord[], region: ZoneRegionDef): BulkAllocationResult {
  const users = dedupeServiceUsers(records);
  const buckets = new Map<string, SectionBucket>();
  for (const section of region.sections) {
    buckets.set(section.id, { sectionId: section.id, sectionName: section.name, serviceUsers: [] });
  }
  const unallocated: AllocatedServiceUser[] = [];
  const ambiguous: AllocatedServiceUser[] = [];

  for (const user of users) {
    const allocation = allocate(
      { postcode: user.postcode, area: user.area, address: user.address },
      region,
    );
    const allocated: AllocatedServiceUser = {
      serviceUser: user.serviceUser,
      region: user.region,
      area: user.area,
      postcode: user.postcode,
      address: user.address,
      allocation,
    };
    if (allocation.sectionId && buckets.has(allocation.sectionId)) {
      buckets.get(allocation.sectionId)!.serviceUsers.push(allocated);
    } else {
      unallocated.push(allocated);
    }
    if (allocation.ambiguous) ambiguous.push(allocated);
  }

  const sortByName = (a: AllocatedServiceUser, b: AllocatedServiceUser) =>
    a.serviceUser.localeCompare(b.serviceUser);
  for (const bucket of buckets.values()) bucket.serviceUsers.sort(sortByName);
  unallocated.sort(sortByName);

  return {
    region: region.region,
    sections: region.sections.map((s) => buckets.get(s.id)!),
    unallocated,
    ambiguous,
    totalServiceUsers: users.length,
  };
}

/* ------------------------------------------------------------------ *
 * ECM table parsing (CSV / TSV / pasted spreadsheet)
 * ------------------------------------------------------------------ */

/** Parse a single delimited line, honouring double-quoted fields. */
function parseDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

const HEADER_PATTERNS: Record<keyof Omit<EcmRecord, "rowIndex">, RegExp[]> = {
  serviceUser: [/service\s*user/i, /\bclient\b/i, /\bservice\s*user\s*name\b/i, /\bname\b/i, /\bsu\b/i],
  region: [/customer\s*branch/i, /\bbranch\b/i, /\bregion\b/i],
  area: [/customer\s*area/i, /\bsub.?region\b/i, /\barea\b/i, /\blocality\b/i],
  postcode: [/post\s*code/i, /\bpostcode\b/i, /\bzip\b/i],
  address: [/\baddress\b/i, /\bline\s*1\b/i],
};

/** Choose a delimiter by sampling the header row. */
function detectDelimiter(headerLine: string): string {
  const candidates: Array<[string, number]> = [
    ["\t", (headerLine.match(/\t/g) || []).length],
    [",", (headerLine.match(/,/g) || []).length],
    [";", (headerLine.match(/;/g) || []).length],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][1] > 0 ? candidates[0][0] : ",";
}

export interface EcmColumnMap {
  serviceUser: number;
  region: number;
  area: number;
  postcode: number;
  address: number;
}

export interface EcmParseResult {
  records: EcmRecord[];
  headers: string[];
  columnMap: EcmColumnMap;
  /** Regions discovered in the data (distinct, non-empty). */
  regions: string[];
}

/** Map detected headers to record fields. Returns -1 for any field that could not be located. */
export function mapEcmColumns(headers: string[]): EcmColumnMap {
  const findCol = (patterns: RegExp[]): number => {
    for (const pattern of patterns) {
      const idx = headers.findIndex((h) => pattern.test(h));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    serviceUser: findCol(HEADER_PATTERNS.serviceUser),
    region: findCol(HEADER_PATTERNS.region),
    area: findCol(HEADER_PATTERNS.area),
    postcode: findCol(HEADER_PATTERNS.postcode),
    address: findCol(HEADER_PATTERNS.address),
  };
}

/**
 * Parse pasted/uploaded ECM text (CSV, TSV, or copied spreadsheet) into typed records using
 * header auto-detection. The first non-empty line is treated as the header row.
 */
export function parseEcmText(text: string): EcmParseResult {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return {
      records: [],
      headers: [],
      columnMap: { serviceUser: -1, region: -1, area: -1, postcode: -1, address: -1 },
      regions: [],
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter);
  const columnMap = mapEcmColumns(headers);

  const at = (cells: string[], idx: number): string | null => {
    if (idx < 0 || idx >= cells.length) return null;
    const value = cells[idx].trim();
    return value.length ? value : null;
  };

  const records: EcmRecord[] = [];
  const regions = new Set<string>();
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseDelimitedLine(lines[i], delimiter);
    const serviceUser = at(cells, columnMap.serviceUser);
    if (!serviceUser) continue;
    const region = at(cells, columnMap.region);
    if (region) regions.add(region);
    records.push({
      serviceUser,
      region,
      area: at(cells, columnMap.area),
      postcode: at(cells, columnMap.postcode),
      address: at(cells, columnMap.address),
      rowIndex: i,
    });
  }

  return { records, headers, columnMap, regions: [...regions].sort((a, b) => a.localeCompare(b)) };
}

const REGION_STOP_TOKENS = new Set([
  "north",
  "south",
  "east",
  "west",
  "county",
  "and",
  "the",
  "upon",
  "of",
]);

const regionTokens = (value: string): string[] =>
  norm(value)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !REGION_STOP_TOKENS.has(t));

/**
 * Loose region match so a seed region ("Newcastle/North Tyneside") still captures ECM branches
 * that label it differently ("Newcastle", "North Tyneside", "Newcastle upon Tyne"). Matches when
 * the strings are equal, one contains the other, or they share a meaningful token.
 */
export function regionMatches(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(regionTokens(a));
  return regionTokens(b).some((t) => ta.has(t));
}

/** Filter records to a single region (loose, case-insensitive). Pass null to keep all. */
export function filterByRegion(records: EcmRecord[], region: string | null): EcmRecord[] {
  if (!region) return records;
  return records.filter((r) => !r.region || regionMatches(r.region, region));
}
