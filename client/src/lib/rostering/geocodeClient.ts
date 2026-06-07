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
      return null;
    }
    const payload = (await res.json()) as { result: GeocodeResult | null };
    if (payload.result) cache.set(normalized, payload.result);
    return payload.result ?? null;
  } catch {
    return null;
  }
};
