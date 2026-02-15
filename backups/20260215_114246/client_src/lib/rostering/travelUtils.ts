/**
 * Travel time estimation utilities for care rostering.
 * Uses Haversine formula for crow-flies distance and simple time estimates.
 */

const EARTH_RADIUS_KM = 6371;

/** Converts degrees to radians */
const toRadians = (degrees: number): number => degrees * (Math.PI / 180);

/**
 * Calculate straight-line (crow-flies) distance between two coordinates.
 * Uses the Haversine formula.
 * @returns Distance in kilometers
 */
export const haversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

/**
 * Estimate travel time based on crow-flies distance.
 * Applies a "detour factor" to account for road routing not being straight.
 * @param distanceKm Crow-flies distance in kilometers
 * @param speedKmh Average speed in km/h (default: 30 for urban driving)
 * @param detourFactor Multiplier for actual road distance (default: 1.4)
 * @returns Travel time in minutes
 */
export const estimateTravelMinutes = (
  distanceKm: number,
  speedKmh: number = 30,
  detourFactor: number = 1.4
): number => {
  const actualDistance = distanceKm * detourFactor;
  const hours = actualDistance / speedKmh;
  return Math.ceil(hours * 60);
};

/**
 * Parse UK postcode and extract outward code (first part).
 * Useful for area-based grouping.
 * @param postcode Full or partial UK postcode
 * @returns Outward code (e.g., "SW1A" from "SW1A 2AA") or null
 */
export const parsePostcodeOutcode = (postcode: string | null | undefined): string | null => {
  if (!postcode) return null;
  const normalized = postcode.trim().toUpperCase().replace(/\s+/g, " ");
  // Match UK postcode format: outward code is everything before the space
  const match = normalized.match(/^([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}$/);
  if (match) return match[1];
  // If no inward code, might just be the outward code
  const outcodeOnly = normalized.match(/^([A-Z]{1,2}\d[A-Z\d]?)$/);
  if (outcodeOnly) return outcodeOnly[1];
  return null;
};

/**
 * Categorize travel time for visual styling.
 */
export type TravelCategory = "short" | "medium" | "long" | "very-long";

export const categorizeTravelTime = (minutes: number): TravelCategory => {
  if (minutes <= 10) return "short";
  if (minutes <= 20) return "medium";
  if (minutes <= 30) return "long";
  return "very-long";
};

export const getTravelCategoryColor = (category: TravelCategory): string => {
  switch (category) {
    case "short":
      return "#10b981"; // emerald-500
    case "medium":
      return "#f59e0b"; // amber-500
    case "long":
      return "#ef4444"; // red-500
    case "very-long":
      return "#7c3aed"; // violet-600
    default:
      return "#6b7280"; // gray-500
  }
};

export const getTravelCategoryLabel = (category: TravelCategory): string => {
  switch (category) {
    case "short":
      return "Quick (<10min)";
    case "medium":
      return "Moderate (10-20min)";
    case "long":
      return "Long (20-30min)";
    case "very-long":
      return "Very long (>30min)";
    default:
      return "Unknown";
  }
};

interface VisitWithLocation {
  id: string;
  lat?: number | null;
  lon?: number | null;
  startMinutes: number;
  durationMinutes: number;
}

interface TravelSegment {
  fromId: string;
  toId: string;
  distanceKm: number;
  travelMinutes: number;
  category: TravelCategory;
  gapMinutes: number; // Time between visits (may include waiting)
}

/**
 * Calculate travel segments between ordered visits.
 */
export const calculateTravelSegments = (
  visits: VisitWithLocation[]
): TravelSegment[] => {
  const sorted = [...visits].sort((a, b) => a.startMinutes - b.startMinutes);
  const segments: TravelSegment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];

    const fromEndMinutes = from.startMinutes + from.durationMinutes;
    const gapMinutes = Math.max(0, to.startMinutes - fromEndMinutes);

    let distanceKm = 0;
    let travelMinutes = 0;

    if (
      from.lat != null &&
      from.lon != null &&
      to.lat != null &&
      to.lon != null
    ) {
      distanceKm = haversineDistance(from.lat, from.lon, to.lat, to.lon);
      travelMinutes = estimateTravelMinutes(distanceKm);
    }

    segments.push({
      fromId: from.id,
      toId: to.id,
      distanceKm,
      travelMinutes,
      category: categorizeTravelTime(travelMinutes),
      gapMinutes,
    });
  }

  return segments;
};

/**
 * Simple nearest-neighbor route optimization.
 * Reorders visits to minimize total travel distance.
 * @param visits Array of visits with location data
 * @returns Reordered visit IDs
 */
export const orderByNearestNeighbor = (visits: VisitWithLocation[]): string[] => {
  if (visits.length <= 1) return visits.map((v) => v.id);

  const remaining = [...visits];
  const ordered: VisitWithLocation[] = [];

  // Start with the earliest visit
  remaining.sort((a, b) => a.startMinutes - b.startMinutes);
  const first = remaining.shift()!;
  ordered.push(first);

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];

    if (current.lat == null || current.lon == null) {
      // No location data, just take the next by time
      remaining.sort((a, b) => a.startMinutes - b.startMinutes);
      ordered.push(remaining.shift()!);
      continue;
    }

    // Find nearest neighbor with location data
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      if (candidate.lat != null && candidate.lon != null) {
        const dist = haversineDistance(
          current.lat,
          current.lon,
          candidate.lat,
          candidate.lon
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
    }

    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }

  return ordered.map((v) => v.id);
};

/**
 * Calculate optimization score (0-100) based on:
 * - Total travel time
 * - Gap efficiency (time between visits vs. travel time needed)
 * - Conflict count
 */
export interface OptimizationMetrics {
  totalTravelMinutes: number;
  totalGapMinutes: number;
  conflictCount: number;
  visitCount: number;
  avgTravelMinutes: number;
  efficiency: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
}

export const calculateOptimizationMetrics = (
  segments: TravelSegment[],
  conflictCount: number
): OptimizationMetrics => {
  const totalTravelMinutes = segments.reduce((sum, s) => sum + s.travelMinutes, 0);
  const totalGapMinutes = segments.reduce((sum, s) => sum + s.gapMinutes, 0);
  const visitCount = segments.length + 1;
  const avgTravelMinutes = segments.length > 0 ? totalTravelMinutes / segments.length : 0;

  // Efficiency: penalize for excess gaps and conflicts
  const excessGap = Math.max(0, totalGapMinutes - totalTravelMinutes);
  const gapPenalty = Math.min(30, excessGap * 0.5);
  const conflictPenalty = conflictCount * 15;

  let rawScore = 100 - gapPenalty - conflictPenalty;
  if (avgTravelMinutes > 20) rawScore -= 10;
  if (avgTravelMinutes > 30) rawScore -= 10;

  const efficiency = Math.max(0, Math.min(100, Math.round(rawScore)));

  let grade: "A" | "B" | "C" | "D" | "F";
  if (efficiency >= 90) grade = "A";
  else if (efficiency >= 75) grade = "B";
  else if (efficiency >= 60) grade = "C";
  else if (efficiency >= 40) grade = "D";
  else grade = "F";

  return {
    totalTravelMinutes,
    totalGapMinutes,
    conflictCount,
    visitCount,
    avgTravelMinutes: Math.round(avgTravelMinutes),
    efficiency,
    grade,
  };
};
