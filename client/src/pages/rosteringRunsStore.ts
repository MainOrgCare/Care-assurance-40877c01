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

export type RecommendationDecision = "implemented" | "rejected";

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
  /** Current average planned call length (minutes) across analysed calls in this slot. */
  averagePlannedDurationMinutes: number | null;
  /** Current average actual call length (minutes) across analysed calls in this slot. */
  averageActualDurationMinutes: number | null;
  suggestedPlannedTimeLabel: string | null;
  suggestedPlannedDurationMinutes: number | null;
  advice: string[];
  offsetConsistency: number | null;
  hasRecommendation: boolean;
}

let _sharedRecommendations: SharedCareCallRecommendation[] = [];
let _sharedAllSlots: SharedCallSlot[] = [];
let _sharedRecommendationDecisions: Record<string, RecommendationDecision> = {};
const _decisionListeners = new Set<() => void>();

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

export function setSharedRecommendationDecisions(
  decisions: Record<string, RecommendationDecision>,
): void {
  _sharedRecommendationDecisions = { ...decisions };
  _decisionListeners.forEach((listener) => listener());
}

export function updateSharedRecommendationDecision(
  key: string,
  decision: RecommendationDecision | null,
): Record<string, RecommendationDecision> {
  const next = { ..._sharedRecommendationDecisions };
  if (decision) {
    next[key] = decision;
  } else {
    delete next[key];
  }
  setSharedRecommendationDecisions(next);
  return next;
}

export function getSharedRecommendationDecisions(): Record<string, RecommendationDecision> {
  return _sharedRecommendationDecisions;
}

export function subscribeSharedRecommendationDecisions(listener: () => void): () => void {
  _decisionListeners.add(listener);
  return () => {
    _decisionListeners.delete(listener);
  };
}
