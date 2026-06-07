import {
  dedupeServiceUsers,
  extractFullPostcode,
  type EcmRecord,
} from "./zoneAllocation";

/** Minimal shape of an analysed rostering row needed to build a zone record. */
export interface RosterRowLike {
  serviceUserName?: string | null;
  /** Preferred locality for zone matching (the zone area name). */
  serviceLocationArea?: string | null;
  serviceUserArea?: string | null;
  serviceUserAddress?: string | null;
  serviceLocationBranch?: string | null;
}

/**
 * Build deduplicated zone EcmRecords from analysed rostering rows. The Customer Branch maps to the
 * region; the Service Location Area (falling back to Customer/Service User Area) drives locality
 * keyword matching; and a full postcode is extracted from the address when present. Rows without a
 * service-user name are skipped; rows for the same service user are merged so a person lands in
 * exactly one section.
 */
export function buildRecordsFromRoster(rows: RosterRowLike[]): EcmRecord[] {
  const records: EcmRecord[] = [];
  rows.forEach((row, index) => {
    const serviceUser = (row.serviceUserName ?? "").trim();
    if (!serviceUser) return;
    const address = (row.serviceUserAddress ?? "").trim() || null;
    const area =
      (row.serviceLocationArea ?? "").trim() || (row.serviceUserArea ?? "").trim() || null;
    records.push({
      serviceUser,
      region: (row.serviceLocationBranch ?? "").trim() || null,
      area,
      postcode: extractFullPostcode(address),
      address,
      rowIndex: index,
    });
  });
  return dedupeServiceUsers(records);
}

/** Distinct, sorted Customer Branch (region) names present in the records. */
export function regionsInRecords(records: EcmRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const region = (r.region ?? "").trim();
    if (region) set.add(region);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
