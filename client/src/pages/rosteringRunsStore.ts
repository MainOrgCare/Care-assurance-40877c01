// Shared module-level store for rostering workspace data.
// TestingFeatures writes recommendations and all slot trends here after analysis;
// RosteringRuns reads them for optimal ordering.

export interface SharedCareCallRecommendation {
  key: string;
  serviceUserKey: string;
  serviceUserName: string;
  serviceUserArea: string | null;
  serviceUserAddress: string | null;
  timeBandLabel: string;
  callTypeLabel: string;
  totalCalls: number;
  callsWithTimes: number;
  callsWithDurations: number;
  averageStartOffsetMinutes: number | null;
  averageActualStartMinutes: number | null;
  averagePlannedStartMinutes: number | null;
  averageDurationPercent: number | null;
  suggestedPlannedTimeLabel: string;
  suggestedPlannedDurationMinutes: number | null;
  advice: string[];
  offsetConsistency: number | null;
}

/** All analysed call slots (including those without recommendations). */
export interface SharedCallSlot {
  key: string;
  serviceUserKey: string;
  serviceUserName: string;
  serviceUserArea: string | null;
  serviceUserAddress: string | null;
  timeBandLabel: string;
  callTypeLabel: string;
  totalCalls: number;
  callsWithTimes: number;
  callsWithDurations: number;
  averageStartOffsetMinutes: number | null;
  averageActualStartMinutes: number | null;
  averagePlannedStartMinutes: number | null;
  averageDurationPercent: number | null;
  suggestedPlannedTimeLabel: string | null;
  suggestedPlannedDurationMinutes: number | null;
  advice: string[];
  offsetConsistency: number | null;
  hasRecommendation: boolean;
}

let _sharedRecommendations: SharedCareCallRecommendation[] = [];
let _sharedAllSlots: SharedCallSlot[] = [];

export function setSharedRecommendations(recs: SharedCareCallRecommendation[]): void {
  _sharedRecommendations = recs;
}

export function getSharedRecommendations(): SharedCareCallRecommendation[] {
  return _sharedRecommendations;
}

export function setSharedAllSlots(slots: SharedCallSlot[]): void {
  _sharedAllSlots = slots;
}

export function getSharedAllSlots(): SharedCallSlot[] {
  return _sharedAllSlots;
}
