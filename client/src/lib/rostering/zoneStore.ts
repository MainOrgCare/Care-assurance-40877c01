import { useSyncExternalStore } from "react";
import type { EcmRecord, ZoneRegionDef } from "./zoneAllocation";
import { SEED_REGIONS } from "./zoneSeed";

/**
 * Volatile, in-memory store for the zone workspace. Holding state at module scope (rather than in
 * localStorage) means a full page refresh resets everything — service-user records are sourced live
 * from the Rostering "Analyse" tab, and section definitions fall back to the seed. This mirrors the
 * pattern used by rosteringRunsStore.ts.
 */

let _regions: ZoneRegionDef[] = structuredClone(SEED_REGIONS);
let _records: EcmRecord[] = [];
let _source: string | null = null;

const listeners = new Set<() => void>();
function notify(): void {
  listeners.forEach((l) => l());
}

export function subscribeZoneStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getZoneRegions(): ZoneRegionDef[] {
  return _regions;
}

export function setZoneRegions(regions: ZoneRegionDef[]): void {
  _regions = regions;
  notify();
}

export function resetZoneRegions(): void {
  _regions = structuredClone(SEED_REGIONS);
  notify();
}

export function getZoneRecords(): EcmRecord[] {
  return _records;
}

export function getZoneSource(): string | null {
  return _source;
}

/** Replace the service-user records the zone workspace operates on (fed by the Analyse tab). */
export function setZoneRecords(records: EcmRecord[], source: string | null): void {
  _records = records;
  _source = source;
  notify();
}

export function clearZoneRecords(): void {
  _records = [];
  _source = null;
  notify();
}

export function useZoneRegions(): ZoneRegionDef[] {
  return useSyncExternalStore(subscribeZoneStore, getZoneRegions, getZoneRegions);
}

export function useZoneRecords(): EcmRecord[] {
  return useSyncExternalStore(subscribeZoneStore, getZoneRecords, getZoneRecords);
}

export function useZoneSource(): string | null {
  return useSyncExternalStore(subscribeZoneStore, getZoneSource, getZoneSource);
}
