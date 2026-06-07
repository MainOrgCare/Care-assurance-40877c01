import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
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
import { ArrowLeft, Layers, MapPin, Search, Users, X } from "lucide-react";
import {
  allocateRecords,
  filterByRegion,
  type BulkAllocationResult,
  type ZoneRegionDef,
} from "@/lib/rostering/zoneAllocation";
import {
  buildMarkers,
  buildSectionColors,
  uniquePostcodes,
  UNALLOCATED_COLOR,
  type LatLon,
  type ServiceUserMarker,
} from "@/lib/rostering/zoneMapData";
import { loadAllocationInput, loadRegions } from "@/lib/rostering/zoneStorage";
import { geocodeAddressClient } from "@/lib/rostering/geocodeClient";

const DEFAULT_CENTER: [number, number] = [54.8, -1.6];

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

  const [regions] = useState<ZoneRegionDef[]>(() => loadRegions());
  const input = useMemo(() => loadAllocationInput(), []);
  const [activeRegionName, setActiveRegionName] = useState<string>(
    () => input?.regionName ?? loadRegions()[0]?.region ?? "",
  );

  const activeRegion = useMemo(
    () => regions.find((r) => r.region === activeRegionName) ?? regions[0],
    [regions, activeRegionName],
  );

  const result = useMemo<BulkAllocationResult | null>(() => {
    if (!activeRegion || !input) return null;
    const scoped = filterByRegion(input.records, activeRegion.region);
    return allocateRecords(scoped, activeRegion);
  }, [activeRegion, input]);

  /* ------------------------------------------------------------------ *
   * Best-effort precise geocoding of postcodes (admin geocoder).
   * Falls back silently to section centroids when unavailable.
   * ------------------------------------------------------------------ */
  const [geocoded, setGeocoded] = useState<Record<string, LatLon>>({});
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    const postcodes = uniquePostcodes(result).slice(0, 400);
    (async () => {
      const updates: Record<string, LatLon> = {};
      for (const pc of postcodes) {
        const key = pc.toUpperCase().replace(/\s+/g, "");
        if (geocoded[key]) continue;
        const res = await geocodeAddressClient(pc);
        if (cancelled) return;
        if (res) updates[key] = { lat: res.lat, lon: res.lon };
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setGeocoded((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const markers = useMemo<ServiceUserMarker[]>(() => {
    if (!result || !activeRegion) return [];
    return buildMarkers(result, activeRegion, geocoded);
  }, [result, activeRegion, geocoded]);

  const sectionColors = useMemo(
    () => (result ? buildSectionColors(result.sections) : {}),
    [result],
  );

  /* ------------------------------------------------------------------ *
   * Section selection + service-user search
   * ------------------------------------------------------------------ */
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [focusUser, setFocusUser] = useState<string | null>(null);

  const searchLower = search.trim().toLowerCase();

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
  if (!input || !result) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <PageHeader />
        <Alert>
          <MapPin className="h-4 w-4" />
          <AlertTitle>No allocation to map yet</AlertTitle>
          <AlertDescription>
            Run an allocation in the Zone Allocator first — paste an ECM export and click
            <span className="font-medium"> Allocate</span>. Then return here to see every service
            user plotted on the map.
            <div className="mt-3">
              <Button asChild size="sm">
                <Link href="/rostering/zones">Open Zone Allocator</Link>
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
        <Card className="min-h-0 overflow-hidden">
          <MapContainer center={DEFAULT_CENTER} zoom={11} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={fitPoints} />
            <FlyTo point={focusPoint} />
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
