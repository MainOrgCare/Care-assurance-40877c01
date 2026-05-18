// Shared module-level store for rostering workspace data.
// TestingFeatures writes recommendations here after analysis;
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

let _sharedRecommendations: SharedCareCallRecommendation[] = [];

export function setSharedRecommendations(recs: SharedCareCallRecommendation[]): void {
  _sharedRecommendations = recs;
}

export function getSharedRecommendations(): SharedCareCallRecommendation[] {
  return _sharedRecommendations;
}
