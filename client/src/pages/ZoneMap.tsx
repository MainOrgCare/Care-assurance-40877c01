import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { MapContainer, TileLayer, CircleMarker, Polygon, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, Layers, MapPin, Search, Shapes, Users, X } from "lucide-react";
import {
  allocateRecords,
  filterByRegion,
  type BulkAllocationResult,
} from "@/lib/rostering/zoneAllocation";
import {
  buildMarkers,
  buildSectionColors,
  buildSectionHulls,
  uniqueAddresses,
  uniquePostcodes,
  UNALLOCATED_COLOR,
  type LatLon,
  type ServiceUserMarker,
} from "@/lib/rostering/zoneMapData";
import { useZoneRecords, useZoneRegions, useZoneSource } from "@/lib/rostering/zoneStore";
import { regionsInRecords } from "@/lib/rostering/zoneRosterAdapter";
import { geocodeAddressClient, geocodePostcodesClient } from "@/lib/rostering/geocodeClient";

const DEFAULT_CENTER: [number, number] = [54.8, -1.6];

/** Available basemap tile layers. */
const BASEMAPS = {
  light: {
    label: "Light",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
  },
} as const;

type BasemapKey = keyof typeof BASEMAPS;
const normalizePostcodeKey = (value: string | null | undefined): string =>
  (value ?? "").toUpperCase().replace(/\s+/g, "");
const normalizeAddressKey = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();
const FULL_UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const normalizeUkPostcode = (value: string | null | undefined): string | null => {
  const cleaned = (value ?? "").toUpperCase().replace(/\s+/g, "").trim();
  if (!FULL_UK_POSTCODE_RE.test(cleaned)) return null;
  return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`;
};

/** Imperatively fit the map to the supplied points whenever they change. */
function FitBounds({ points }: { points: LatLon[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 14);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }, [map, points]);
  return null;
}

/** Fly to a single focused marker (e.g. after searching a service user). */
function FlyTo({ point }: { point: LatLon | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lon], 15, { duration: 0.6 });
  }, [map, point]);
  return null;
}

export default function ZoneMap() {
  usePageTitle("Zone Map");

  const regions = useZoneRegions();
  const records = useZoneRecords();
  const source = useZoneSource();
  const recordRegions = useMemo(() => regionsInRecords(records), [records]);
  const [activeRegionName, setActiveRegionName] = useState<string>(
    () => recordRegions[0] ?? regions[0]?.region ?? "",
  );

  // Default the active region to a branch present in the analysed data once it arrives.
  useEffect(() => {
    if (recordRegions.length === 0) return;
    const matched = regions.find((r) =>
      recordRegions.some((rr) => rr.toLowerCase() === r.region.toLowerCase()),
    );
    if (matched && matched.region !== activeRegionName) setActiveRegionName(matched.region);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordRegions]);

  const activeRegion = useMemo(
    () => regions.find((r) => r.region === activeRegionName) ?? regions[0],
    [regions, activeRegionName],
  );

  const result = useMemo<BulkAllocationResult | null>(() => {
    if (!activeRegion || records.length === 0) return null;
    const scoped = filterByRegion(records, activeRegion.region);
    return allocateRecords(scoped, activeRegion);
  }, [activeRegion, records]);

  /* ------------------------------------------------------------------ *
   * Best-effort precise geocoding of postcodes (admin geocoder).
   * Falls back silently to section centroids when unavailable.
   * ------------------------------------------------------------------ */
  const [geocodedPostcodes, setGeocodedPostcodes] = useState<Record<string, LatLon>>({});
  const [geocodedAddresses, setGeocodedAddresses] = useState<Record<string, LatLon>>({});
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    const postcodes = uniquePostcodes(result).slice(0, 400);
    (async () => {
      const missing = postcodes.filter((pc) => !geocodedPostcodes[normalizePostcodeKey(pc)]);
      if (missing.length === 0) return;
      const geocoded = await geocodePostcodesClient(missing);
      if (cancelled) return;
      const updates: Record<string, LatLon> = {};
      for (const [key, point] of Object.entries(geocoded)) {
        updates[key] = { lat: point.lat, lon: point.lon };
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setGeocodedPostcodes((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    const addresses = uniqueAddresses(result).slice(0, 400);
    (async () => {
      const updates: Record<string, LatLon> = {};
      const missing = addresses.filter((address) => {
        const key = normalizeAddressKey(address);
        if (!key || geocodedAddresses[key]) return false;
        const postcode = normalizeUkPostcode(address);
        // If this string itself is a postcode and we already resolved that postcode, skip it.
        if (postcode && geocodedPostcodes[normalizePostcodeKey(postcode)]) return false;
        return true;
      });
      let cursor = 0;
      const workerCount = Math.min(6, missing.length);
      const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = cursor++;
          if (index >= missing.length) return;
          const address = missing[index];
          const key = normalizeAddressKey(address);
          const res = await geocodeAddressClient(address);
          if (cancelled) return;
          if (res) updates[key] = { lat: res.lat, lon: res.lon };
        }
      });
      await Promise.all(workers);
      if (!cancelled && Object.keys(updates).length > 0) {
        setGeocodedAddresses((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const markers = useMemo<ServiceUserMarker[]>(() => {
    if (!result || !activeRegion) return [];
    return buildMarkers(result, activeRegion, geocodedPostcodes, geocodedAddresses);
  }, [result, activeRegion, geocodedPostcodes, geocodedAddresses]);

  const sectionColors = useMemo(
    () => (result ? buildSectionColors(result.sections) : {}),
    [result],
  );

  /* ------------------------------------------------------------------ *
   * Map display options + section boundary polygons
   * ------------------------------------------------------------------ */
  const [basemap, setBasemap] = useState<BasemapKey>("light");
  const [showBoundaries, setShowBoundaries] = useState(true);

  const sectionHulls = useMemo(() => buildSectionHulls(markers), [markers]);

  /* ------------------------------------------------------------------ *
   * Section selection + service-user search
   * ------------------------------------------------------------------ */
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [focusUser, setFocusUser] = useState<string | null>(null);

  const searchLower = search.trim().toLowerCase();

  const visibleHulls = useMemo(() => {
    if (!showBoundaries) return [];
    return sectionHulls.filter((h) => {
      if (h.polygon.length < 3) return false;
      if (
        selectedSectionId &&
        selectedSectionId !== "__unallocated__" &&
        h.sectionId !== selectedSectionId
      )
        return false;
      return true;
    });
  }, [sectionHulls, showBoundaries, selectedSectionId]);

  const visibleMarkers = useMemo(() => {
    return markers.filter((m) => {
      if (selectedSectionId === "__unallocated__" && m.sectionId !== null) return false;
      if (
        selectedSectionId &&
        selectedSectionId !== "__unallocated__" &&
        m.sectionId !== selectedSectionId
      )
        return false;
      if (searchLower && !m.serviceUser.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [markers, selectedSectionId, searchLower]);

  const focusPoint = useMemo<LatLon | null>(() => {
    if (!focusUser) return null;
    const m = markers.find((x) => x.serviceUser === focusUser);
    return m ? { lat: m.lat, lon: m.lon } : null;
  }, [focusUser, markers]);

  const fitPoints = useMemo<LatLon[]>(
    () => visibleMarkers.map((m) => ({ lat: m.lat, lon: m.lon })),
    [visibleMarkers],
  );

  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of markers) counts[m.sectionId ?? "__unallocated__"] = (counts[m.sectionId ?? "__unallocated__"] ?? 0) + 1;
    return counts;
  }, [markers]);

  const usersInSelectedSection = useMemo(() => {
    if (!selectedSectionId) return [];
    return markers
      .filter((m) => (m.sectionId ?? "__unallocated__") === selectedSectionId)
      .sort((a, b) => a.serviceUser.localeCompare(b.serviceUser));
  }, [markers, selectedSectionId]);

  const searchMatches = useMemo(() => {
    if (!searchLower) return [];
    return markers
      .filter((m) => m.serviceUser.toLowerCase().includes(searchLower))
      .sort((a, b) => a.serviceUser.localeCompare(b.serviceUser))
      .slice(0, 12);
  }, [markers, searchLower]);

  const preciseCount = useMemo(() => markers.filter((m) => m.precise).length, [markers]);

  const handleSelectSection = useCallback(
    (id: string | null) => {
      setSelectedSectionId((prev) => (prev === id ? null : id));
      setFocusUser(null);
    },
    [],
  );

  const handleFocusUser = useCallback((name: string) => {
    setFocusUser(name);
  }, []);

  /* ------------------------------------------------------------------ *
   * Empty state
   * ------------------------------------------------------------------ */
  if (records.length === 0 || !result) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <PageHeader />
        <Alert>
          <MapPin className="h-4 w-4" />
          <AlertTitle>No analysed data to map yet</AlertTitle>
          <AlertDescription>
            Upload and analyse an ECM export in the Rostering <span className="font-medium">Analyse</span>{" "}
            tab. Every service user is then plotted here automatically. This data is volatile —
            refreshing the page clears it.
            <div className="mt-3 flex gap-2">
              <Button asChild size="sm">
                <Link href="/rostering/analyse">Open Analyse</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/rostering/zones">Zone Allocator</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-4">
      <PageHeader />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={activeRegion?.region} onValueChange={(v) => { setActiveRegionName(v); setSelectedSectionId(null); setFocusUser(null); }}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent>
            {regions.map((r) => (
              <SelectItem key={r.region} value={r.region}>
                {r.region}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="gap-1">
          <Users className="h-3 w-3" /> {markers.length} service users
        </Badge>
        <Badge variant="outline">{result.sections.length} sections</Badge>
        <Badge variant="outline" title="Markers placed by exact geocoding vs coarse area centroid">
          {preciseCount}/{markers.length} precisely located
        </Badge>
        {source && <Badge variant="secondary">Source: {source}</Badge>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={showBoundaries ? "default" : "outline"}
            onClick={() => setShowBoundaries((v) => !v)}
            className="gap-1"
            title="Toggle section boundary shapes"
          >
            <Shapes className="h-3.5 w-3.5" /> Boundaries
          </Button>
          <Select value={basemap} onValueChange={(v) => setBasemap(v as BasemapKey)}>
            <SelectTrigger className="h-8 w-[130px]">
              <SelectValue placeholder="Basemap" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BASEMAPS) as BasemapKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {BASEMAPS[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[320px_1fr]">
        {/* Sidebar */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="space-y-2 pb-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search a service user…"
                className="pl-8"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setFocusUser(null); }}
                  className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {searchMatches.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-1">
                {searchMatches.map((m) => (
                  <button
                    key={m.serviceUser}
                    type="button"
                    onClick={() => handleFocusUser(m.serviceUser)}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted ${focusUser === m.serviceUser ? "bg-muted" : ""}`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                      <span className="truncate">{m.serviceUser}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{m.sectionName}</span>
                  </button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto pt-0">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Layers className="h-3.5 w-3.5" /> Sections — click to focus
            </div>
            <div className="space-y-1">
              {result.sections.map((s) => {
                const count = sectionCounts[s.sectionId] ?? 0;
                const selected = selectedSectionId === s.sectionId;
                return (
                  <button
                    key={s.sectionId}
                    type="button"
                    onClick={() => handleSelectSection(s.sectionId)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 ${selected ? "border-primary bg-muted/60" : "border-border"}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: sectionColors[s.sectionId] }} />
                      <span className="truncate">{s.sectionName}</span>
                    </span>
                    <Badge variant={selected ? "default" : "secondary"} className="shrink-0">{count}</Badge>
                  </button>
                );
              })}
              {(sectionCounts["__unallocated__"] ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => handleSelectSection("__unallocated__")}
                  className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 ${selectedSectionId === "__unallocated__" ? "border-primary bg-muted/60" : "border-border"}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: UNALLOCATED_COLOR }} />
                    <span className="truncate">Unallocated</span>
                  </span>
                  <Badge variant="secondary" className="shrink-0">{sectionCounts["__unallocated__"]}</Badge>
                </button>
              )}
            </div>

            {selectedSectionId && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {usersInSelectedSection.length} in {usersInSelectedSection[0]?.sectionName ?? "section"}
                  </span>
                  <button type="button" onClick={() => setSelectedSectionId(null)} className="text-xs text-muted-foreground hover:text-foreground">
                    Clear
                  </button>
                </div>
                <div className="space-y-0.5">
                  {usersInSelectedSection.map((m) => (
                    <button
                      key={m.serviceUser}
                      type="button"
                      onClick={() => handleFocusUser(m.serviceUser)}
                      className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted ${focusUser === m.serviceUser ? "bg-muted" : ""}`}
                    >
                      <span className="truncate">{m.serviceUser}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{m.postcode ?? "—"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Map */}
        <Card className="relative min-h-0 overflow-hidden">
          <MapContainer center={DEFAULT_CENTER} zoom={11} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              key={basemap}
              attribution={BASEMAPS[basemap].attribution}
              url={BASEMAPS[basemap].url}
            />
            <FitBounds points={fitPoints} />
            <FlyTo point={focusPoint} />
            {visibleHulls.map((h) => (
              <Polygon
                key={h.sectionId}
                positions={h.polygon}
                pathOptions={{
                  color: h.color,
                  weight: 1.5,
                  fillColor: h.color,
                  fillOpacity: selectedSectionId === h.sectionId ? 0.2 : 0.1,
                  dashArray: "4 4",
                }}
                eventHandlers={{ click: () => handleSelectSection(h.sectionId) }}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="text-sm font-semibold">{h.sectionName}</div>
                    <div className="text-muted-foreground">{h.count} service users</div>
                  </div>
                </Popup>
              </Polygon>
            ))}
            {visibleMarkers.map((m, i) => {
              const isFocus = focusUser === m.serviceUser;
              return (
                <CircleMarker
                  key={`${m.serviceUser}-${i}`}
                  center={[m.lat, m.lon]}
                  radius={isFocus ? 11 : 7}
                  pathOptions={{
                    color: isFocus ? "#111827" : m.color,
                    weight: isFocus ? 3 : 1.5,
                    fillColor: m.color,
                    fillOpacity: m.precise ? 0.9 : 0.55,
                  }}
                  eventHandlers={{ click: () => handleFocusUser(m.serviceUser) }}
                >
                  <Popup>
                    <div className="min-w-[160px] text-xs">
                      <div className="text-sm font-semibold">{m.serviceUser}</div>
                      <div className="mt-0.5 text-muted-foreground">{m.sectionName}</div>
                      {m.area && <div className="text-muted-foreground">Area: {m.area}</div>}
                      {m.postcode && <div className="text-muted-foreground">{m.postcode}</div>}
                      {!m.precise && (
                        <div className="mt-1 text-[10px] italic text-muted-foreground">
                          Approx. location (area centroid)
                        </div>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
          {result.sections.length > 0 && (
            <div className="pointer-events-auto absolute bottom-3 right-3 z-[1000] max-h-[45%] w-52 overflow-y-auto rounded-md border bg-card/95 p-2 text-xs shadow-md backdrop-blur">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground">
                <Layers className="h-3.5 w-3.5" /> Sections
              </div>
              <div className="space-y-0.5">
                {result.sections.map((s) => {
                  const count = sectionCounts[s.sectionId] ?? 0;
                  if (count === 0) return null;
                  const selected = selectedSectionId === s.sectionId;
                  return (
                    <button
                      key={s.sectionId}
                      type="button"
                      onClick={() => handleSelectSection(s.sectionId)}
                      className={`flex w-full items-center justify-between gap-2 rounded px-1.5 py-0.5 text-left hover:bg-muted/60 ${selected ? "bg-muted/60" : ""}`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sectionColors[s.sectionId] }} />
                        <span className="truncate">{s.sectionName}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{count}</span>
                    </button>
                  );
                })}
                {(sectionCounts["__unallocated__"] ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSelectSection("__unallocated__")}
                    className={`flex w-full items-center justify-between gap-2 rounded px-1.5 py-0.5 text-left hover:bg-muted/60 ${selectedSectionId === "__unallocated__" ? "bg-muted/60" : ""}`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: UNALLOCATED_COLOR }} />
                      <span className="truncate">Unallocated</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{sectionCounts["__unallocated__"]}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <MapPin className="h-5 w-5 text-primary" /> Zone Map
        </h1>
        <p className="text-sm text-muted-foreground">
          See where every service user sits across areas and sections. Search a person, or click a
          section to list everyone in it.
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href="/rostering/zones">
          <ArrowLeft className="mr-1 h-4 w-4" /> Allocator
        </Link>
      </Button>
    </div>
  );
}
