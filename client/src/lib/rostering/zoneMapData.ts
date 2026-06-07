import type {
  AllocatedServiceUser,
  BulkAllocationResult,
  ZoneRegionDef,
  ZoneSectionDef,
} from "./zoneAllocation";

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Approximate centroids for the postcode outward codes used by the seeded regions. These let the
 * map render section/area groupings offline, without depending on the admin-only geocoder. Precise
 * per-postcode coordinates (when available) are layered on top of these coarse anchors.
 */
export const OUTWARD_CENTROIDS: Record<string, LatLon> = {
  // County Durham
  DL5: { lat: 54.62, lon: -1.57 }, // Newton Aycliffe
  DL17: { lat: 54.69, lon: -1.55 }, // Ferryhill
  DL16: { lat: 54.7, lon: -1.6 }, // Spennymoor
  DL14: { lat: 54.66, lon: -1.68 }, // Bishop Auckland
  DL4: { lat: 54.63, lon: -1.65 }, // Shildon
  DL12: { lat: 54.54, lon: -1.92 }, // Barnard Castle
  DL15: { lat: 54.72, lon: -1.74 }, // Crook / Willington
  DL13: { lat: 54.74, lon: -2.01 }, // Weardale / Stanhope
  DH1: { lat: 54.78, lon: -1.56 }, // Durham city
  DH6: { lat: 54.72, lon: -1.5 }, // Durham SE (Coxhoe)
  DH7: { lat: 54.77, lon: -1.65 }, // Durham W (Brandon)
  DH9: { lat: 54.86, lon: -1.7 }, // Stanley
  // Newcastle / North Tyneside
  NE1: { lat: 54.972, lon: -1.613 }, // City centre
  NE2: { lat: 54.992, lon: -1.6 }, // Jesmond
  NE6: { lat: 54.972, lon: -1.55 }, // Byker / Walker / Heaton
  NE7: { lat: 55.002, lon: -1.575 }, // High Heaton
};

const UK_FALLBACK: LatLon = { lat: 54.8, lon: -1.6 };

const mean = (values: number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

/** Centroid of a section, averaged across the centroids of its known outward codes. */
export function sectionCentroid(section: ZoneSectionDef): LatLon {
  const known = section.outwardCodes
    .map((code) => OUTWARD_CENTROIDS[code.toUpperCase()])
    .filter((c): c is LatLon => Boolean(c));
  if (known.length === 0) return { ...UK_FALLBACK };
  return { lat: mean(known.map((c) => c.lat)), lon: mean(known.map((c) => c.lon)) };
}

/** Deterministic hash → used to jitter co-located markers so they don't perfectly overlap. */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic small offset (roughly ±300m) keyed by a seed string, so multiple service users
 * anchored to the same coarse centroid spread out into a readable cluster instead of stacking.
 */
export function jitter(seed: string): LatLon {
  const h = hashSeed(seed);
  const angle = (h % 360) * (Math.PI / 180);
  const radius = 0.002 + ((h >>> 9) % 1000) / 1000 * 0.004; // ~0.2–0.6 km
  return { lat: radius * Math.cos(angle), lon: radius * Math.sin(angle) * 1.6 };
}

const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#db2777",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#dc2626",
  "#4d7c0f",
  "#9333ea",
  "#0d9488",
  "#c2410c",
  "#4f46e5",
];

export const UNALLOCATED_COLOR = "#64748b";

/** Stable color-per-section mapping in section definition order. */
export function buildSectionColors(sections: { sectionId: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  sections.forEach((s, i) => {
    map[s.sectionId] = PALETTE[i % PALETTE.length];
  });
  return map;
}

export interface ServiceUserMarker {
  serviceUser: string;
  sectionId: string | null;
  sectionName: string;
  area: string | null;
  postcode: string | null;
  address: string | null;
  lat: number;
  lon: number;
  /** true when coordinates came from real geocoding, false when from a coarse outward centroid. */
  precise: boolean;
  color: string;
}

const normalizePostcodeKey = (value: string | null | undefined): string =>
  (value ?? "").toUpperCase().replace(/\s+/g, "");

const normalizeAddressKey = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

/**
 * Resolve a coordinate for a service user. Precise geocoded coordinates (keyed by normalized
 * postcode) win; otherwise we anchor to the section centroid (or the user's own outward centroid
 * when unallocated) plus a deterministic jitter so the cluster is readable.
 */
export function placeServiceUser(
  user: AllocatedServiceUser,
  section: ZoneSectionDef | null,
  geocodedPostcodes: Record<string, LatLon>,
  geocodedAddresses: Record<string, LatLon>,
  color: string,
): ServiceUserMarker {
  const postcodeKey = normalizePostcodeKey(user.postcode);
  const precisePostcodePoint = postcodeKey ? geocodedPostcodes[postcodeKey] : undefined;
  const addressKey = normalizeAddressKey(user.address);
  const preciseAddressPoint = !precisePostcodePoint && addressKey ? geocodedAddresses[addressKey] : undefined;
  const precisePoint = precisePostcodePoint ?? preciseAddressPoint;

  let lat: number;
  let lon: number;
  let precise = false;
  if (precisePoint) {
    lat = precisePoint.lat;
    lon = precisePoint.lon;
    precise = true;
  } else {
    const anchor = section
      ? sectionCentroid(section)
      : outwardAnchor(user.allocation?.outwardCode) ?? { ...UK_FALLBACK };
    const off = jitter(`${user.serviceUser}|${user.postcode ?? ""}`);
    lat = anchor.lat + off.lat;
    lon = anchor.lon + off.lon;
  }

  return {
    serviceUser: user.serviceUser,
    sectionId: section?.id ?? null,
    sectionName: section?.name ?? "Unallocated",
    area: user.area,
    postcode: user.postcode,
    address: user.address,
    lat,
    lon,
    precise,
    color,
  };
}

function outwardAnchor(outwardCode: string | null | undefined): LatLon | null {
  if (!outwardCode) return null;
  return OUTWARD_CENTROIDS[outwardCode.toUpperCase()] ?? null;
}

/**
 * Build every marker for an allocation result, joining each service user to its section definition
 * (for centroid + color). Unallocated users are included with the neutral color.
 */
export function buildMarkers(
  result: BulkAllocationResult,
  region: ZoneRegionDef,
  geocodedPostcodes: Record<string, LatLon>,
  geocodedAddresses: Record<string, LatLon> = {},
): ServiceUserMarker[] {
  const colors = buildSectionColors(result.sections);
  const sectionDefById = new Map(region.sections.map((s) => [s.id, s]));
  const markers: ServiceUserMarker[] = [];

  for (const bucket of result.sections) {
    const def = sectionDefById.get(bucket.sectionId) ?? null;
    const color = colors[bucket.sectionId] ?? UNALLOCATED_COLOR;
    for (const user of bucket.serviceUsers) {
      markers.push(placeServiceUser(user, def, geocodedPostcodes, geocodedAddresses, color));
    }
  }
  for (const user of result.unallocated) {
    markers.push(placeServiceUser(user, null, geocodedPostcodes, geocodedAddresses, UNALLOCATED_COLOR));
  }
  return markers;
}

/** Unique, normalized postcodes across an allocation result (for batch geocoding). */
export function uniquePostcodes(result: BulkAllocationResult): string[] {
  const seen = new Set<string>();
  const add = (u: AllocatedServiceUser) => {
    const pc = (u.postcode ?? "").trim();
    if (pc) seen.add(pc);
  };
  result.sections.forEach((s) => s.serviceUsers.forEach(add));
  result.unallocated.forEach(add);
  return [...seen];
}

/** Unique, normalized non-empty addresses across an allocation result (for fallback geocoding). */
export function uniqueAddresses(result: BulkAllocationResult): string[] {
  const seen = new Set<string>();
  const add = (u: AllocatedServiceUser) => {
    const address = (u.address ?? "").trim();
    if (address) seen.add(address);
  };
  result.sections.forEach((s) => s.serviceUsers.forEach(add));
  result.unallocated.forEach(add);
  return [...seen];
}

/**
 * Convex hull of a set of points (Andrew's monotone chain), returned counter-clockwise. Used to draw
 * a soft boundary around the service users that belong to a section. Returns the input (deduped) when
 * there are fewer than three distinct points, since a polygon needs at least a triangle.
 */
export function convexHull(points: LatLon[]): LatLon[] {
  const pts = dedupePoints(points).sort((a, b) => a.lon - b.lon || a.lat - b.lat);
  if (pts.length < 3) return pts;

  const cross = (o: LatLon, a: LatLon, b: LatLon): number =>
    (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon);

  const lower: LatLon[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: LatLon[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function dedupePoints(points: LatLon[]): LatLon[] {
  const seen = new Set<string>();
  const out: LatLon[] = [];
  for (const p of points) {
    const key = `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export interface SectionHull {
  sectionId: string;
  sectionName: string;
  color: string;
  /** Hull vertices as Leaflet-friendly [lat, lon] tuples. Empty when fewer than 3 distinct points. */
  polygon: [number, number][];
  count: number;
}

/**
 * Build a soft boundary polygon per section from its markers, so the map visually groups everyone in
 * a section together. Sections with fewer than three distinct points yield an empty polygon (the
 * caller should fall back to rendering just the markers). Unallocated markers are skipped.
 */
export function buildSectionHulls(markers: ServiceUserMarker[]): SectionHull[] {
  const groups = new Map<string, ServiceUserMarker[]>();
  for (const m of markers) {
    if (!m.sectionId) continue;
    const list = groups.get(m.sectionId);
    if (list) list.push(m);
    else groups.set(m.sectionId, [m]);
  }

  const hulls: SectionHull[] = [];
  for (const [sectionId, list] of groups) {
    const hull = convexHull(list.map((m) => ({ lat: m.lat, lon: m.lon })));
    hulls.push({
      sectionId,
      sectionName: list[0].sectionName,
      color: list[0].color,
      polygon: hull.length >= 3 ? hull.map((p) => [p.lat, p.lon] as [number, number]) : [],
      count: list.length,
    });
  }
  return hulls;
}
