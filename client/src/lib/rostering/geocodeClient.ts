export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}

const cache = new Map<string, GeocodeResult | null>();

const normalizeAddress = (value: string) => value.trim().toLowerCase();

export const geocodeAddressClient = async (address: string): Promise<GeocodeResult | null> => {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  if (cache.has(normalized)) return cache.get(normalized) ?? null;

  try {
    const res = await fetch(`/api/admin/geocode?address=${encodeURIComponent(address)}`, {
      credentials: "include",
    });
    if (!res.ok) {
      cache.set(normalized, null);
      return null;
    }
    const payload = (await res.json()) as { result: GeocodeResult | null };
    cache.set(normalized, payload.result ?? null);
    return payload.result ?? null;
  } catch {
    cache.set(normalized, null);
    return null;
  }
};
