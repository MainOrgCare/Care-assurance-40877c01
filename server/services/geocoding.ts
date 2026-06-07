type GeocodeResult = {
  lat: number;
  lon: number;
  displayName: string;
};

const cache = new Map<string, GeocodeResult | null>();
const MAX_GEOCODE_CACHE_SIZE = 5_000;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeAddress = (value: string) => value.trim().toLowerCase();
const FULL_UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

const normalizeUkPostcode = (value: string): string | null => {
  const cleaned = value.toUpperCase().replace(/\s+/g, "").trim();
  if (!FULL_UK_POSTCODE_RE.test(cleaned)) return null;
  return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

// Cache both positive and negative results under a fixed size cap so that a
// flood of failing lookups cannot grow the cache without bound.
const setCacheEntry = (key: string, value: GeocodeResult | null) => {
  if (!cache.has(key) && cache.size >= MAX_GEOCODE_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
};

const geocodeWithPostcodesIo = async (postcode: string): Promise<GeocodeResult | null> => {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(7_000) });
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    status?: number;
    result?: { latitude?: number | null; longitude?: number | null; postcode?: string | null };
  };
  const latitude = payload.result?.latitude;
  const longitude = payload.result?.longitude;
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return null;

  return {
    lat: latitude,
    lon: longitude,
    displayName: payload.result?.postcode?.trim() || postcode,
  };
};

export const geocodeAddress = async (address: string): Promise<GeocodeResult | null> => {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  const postcode = normalizeUkPostcode(address);
  const cacheKey = postcode ?? normalized;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  // Postcode-only lookups are far more precise and much faster through postcodes.io.
  if (postcode) {
    try {
      const postcodeResult = await geocodeWithPostcodesIo(postcode);
      if (postcodeResult) {
        setCacheEntry(cacheKey, postcodeResult);
        return postcodeResult;
      }
    } catch {
      // Fall through to Nominatim.
    }
  }

  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }
  lastRequestTime = Date.now();

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", postcode ?? address);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "CareAssurance/1.0",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });
    if (!response.ok) {
      setCacheEntry(cacheKey, null);
      return null;
    }
    const data = (await response.json()) as Array<{ lat: string; lon: string; display_name?: string }>; 
    const first = data?.[0];
    if (!first) {
      setCacheEntry(cacheKey, null);
      return null;
    }
    const result: GeocodeResult = {
      lat: Number(first.lat),
      lon: Number(first.lon),
      displayName: first.display_name ?? postcode ?? address,
    };
    setCacheEntry(cacheKey, result);
    return result;
  } catch {
    setCacheEntry(cacheKey, null);
    return null;
  }
};
