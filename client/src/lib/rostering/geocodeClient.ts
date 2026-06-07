export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}

const cache = new Map<string, GeocodeResult | null>();
const postcodeCache = new Map<string, GeocodeResult>();

const normalizeAddress = (value: string) => value.trim().toLowerCase();
const normalizePostcodeKey = (value: string) => value.toUpperCase().replace(/\s+/g, "").trim();

export const geocodeAddressClient = async (address: string): Promise<GeocodeResult | null> => {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  if (cache.has(normalized)) return cache.get(normalized) ?? null;

  try {
    const res = await fetch(`/api/admin/geocode?address=${encodeURIComponent(address)}`, {
      credentials: "include",
    });
    if (!res.ok) {
      return null;
    }
    const payload = (await res.json()) as { result: GeocodeResult | null };
    if (payload.result) cache.set(normalized, payload.result);
    return payload.result ?? null;
  } catch {
    return null;
  }
};

export const geocodePostcodesClient = async (
  postcodes: string[],
): Promise<Record<string, GeocodeResult>> => {
  const uniqueKeys = [...new Set(postcodes.map(normalizePostcodeKey).filter(Boolean))];
  if (uniqueKeys.length === 0) return {};

  const results: Record<string, GeocodeResult> = {};
  const missing: string[] = [];
  for (const key of uniqueKeys) {
    const cached = postcodeCache.get(key);
    if (cached) results[key] = cached;
    else missing.push(key);
  }
  if (missing.length === 0) return results;

  try {
    const res = await fetch("/api/admin/geocode/postcodes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcodes: missing }),
    });
    if (!res.ok) return results;

    const payload = (await res.json()) as {
      results?: Record<string, GeocodeResult | null | undefined>;
    };
    for (const [key, value] of Object.entries(payload.results ?? {})) {
      if (!value) continue;
      postcodeCache.set(key, value);
      results[key] = value;
    }
  } catch {
    // Ignore and return what we have.
  }
  return results;
};
