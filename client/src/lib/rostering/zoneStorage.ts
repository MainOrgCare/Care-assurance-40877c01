import type { EcmRecord, ZoneRegionDef } from "./zoneAllocation";
import { SEED_REGIONS } from "./zoneSeed";

export const ZONE_REGIONS_KEY = "ca-zone-regions-v1";
export const ZONE_ALLOCATION_INPUT_KEY = "ca-zone-allocation-input-v1";

export interface ZoneAllocationInput {
  regionName: string;
  records: EcmRecord[];
  savedAt: string;
}

/** Load persisted region definitions, falling back to the seed when absent/invalid. */
export function loadRegions(): ZoneRegionDef[] {
  try {
    const raw = localStorage.getItem(ZONE_REGIONS_KEY);
    if (!raw) return structuredClone(SEED_REGIONS);
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((r) => r?.region && Array.isArray(r.sections))
    ) {
      return parsed as ZoneRegionDef[];
    }
  } catch {
    /* fall through to seed */
  }
  return structuredClone(SEED_REGIONS);
}

/** Persist the most recent bulk allocation input so the map can reproduce it. */
export function saveAllocationInput(regionName: string, records: EcmRecord[]): void {
  try {
    const payload: ZoneAllocationInput = { regionName, records, savedAt: new Date().toISOString() };
    localStorage.setItem(ZONE_ALLOCATION_INPUT_KEY, JSON.stringify(payload));
  } catch {
    /* storage may be unavailable; non-fatal */
  }
}

export function loadAllocationInput(): ZoneAllocationInput | null {
  try {
    const raw = localStorage.getItem(ZONE_ALLOCATION_INPUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ZoneAllocationInput;
    if (parsed && typeof parsed.regionName === "string" && Array.isArray(parsed.records)) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}
