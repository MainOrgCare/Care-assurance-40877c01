type GeocodeResult = {
  lat: number;
  lon: number;
  displayName: string;
};

const cache = new Map<string, GeocodeResult | null>();
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeAddress = (value: string) => value.trim().toLowerCase();

export const geocodeAddress = async (address: string): Promise<GeocodeResult | null> => {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  if (cache.has(normalized)) {
    return cache.get(normalized) ?? null;
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
  url.searchParams.set("q", address);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "CareAssurance/1.0",
        "Accept-Language": "en",
      },
    });
    if (!response.ok) {
      cache.set(normalized, null);
      return null;
    }
    const data = (await response.json()) as Array<{ lat: string; lon: string; display_name?: string }>; 
    const first = data?.[0];
    if (!first) {
      cache.set(normalized, null);
      return null;
    }
    const result: GeocodeResult = {
      lat: Number(first.lat),
      lon: Number(first.lon),
      displayName: first.display_name ?? address,
    };
    cache.set(normalized, result);
    return result;
  } catch (error) {
    cache.set(normalized, null);
    return null;
  }
};
