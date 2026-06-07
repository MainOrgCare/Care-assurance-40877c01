import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import {
  allocate,
  allocateRecords,
  filterByRegion,
  type AllocationResult,
  type BulkAllocationResult,
  type ZoneRegionDef,
  type ZoneSectionDef,
} from "@/lib/rostering/zoneAllocation";
import {
  useZoneRecords,
  useZoneRegions,
  useZoneSource,
  setZoneRegions,
  resetZoneRegions,
  getZoneRegions,
} from "@/lib/rostering/zoneStore";
import { regionsInRecords } from "@/lib/rostering/zoneRosterAdapter";

function csvCell(value: string | null | undefined): string {
  const v = String(value ?? "");
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const matchedByLabel: Record<AllocationResult["matchedBy"], string> = {
  "postcode+area": "Postcode + area",
  area: "Area name",
  postcode: "Postcode",
  none: "No match",
};

export default function ZoneAllocator() {
  usePageTitle("Zone Allocator");
  const { toast } = useToast();

  const regions = useZoneRegions();
  const records = useZoneRecords();
  const source = useZoneSource();
  const setRegions = useCallback(
    (updater: ZoneRegionDef[] | ((prev: ZoneRegionDef[]) => ZoneRegionDef[])) => {
      const next = typeof updater === "function" ? updater(getZoneRegions()) : updater;
      setZoneRegions(next);
    },
    [],
  );

  const recordRegions = useMemo(() => regionsInRecords(records), [records]);
  const [activeRegionName, setActiveRegionName] = useState<string>(
    () => recordRegions[0] ?? regions[0]?.region ?? "Durham",
  );

  // When records arrive from Analyse, default the active region to a branch present in the data.
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

  /* ------------------------------------------------------------------ *
   * Single postcode lookup
   * ------------------------------------------------------------------ */
  const [lookupPostcode, setLookupPostcode] = useState("");
  const [lookupArea, setLookupArea] = useState("");
  const lookupResult = useMemo<AllocationResult | null>(() => {
    if (!activeRegion) return null;
    if (!lookupPostcode.trim() && !lookupArea.trim()) return null;
    return allocate({ postcode: lookupPostcode, area: lookupArea }, activeRegion);
  }, [activeRegion, lookupPostcode, lookupArea]);

  /* ------------------------------------------------------------------ *
   * Bulk allocation — driven by the records fed from the Analyse tab.
   * ------------------------------------------------------------------ */
  const bulkResult = useMemo<BulkAllocationResult | null>(() => {
    if (!activeRegion || records.length === 0) return null;
    const scoped = filterByRegion(records, activeRegion.region);
    return allocateRecords(scoped, activeRegion);
  }, [activeRegion, records]);

  const exportBulk = useCallback(() => {
    if (!bulkResult) return;
    const rows: string[][] = [["Section", "Service User", "Region", "Area", "Postcode", "Matched by", "Needs review"]];
    for (const section of bulkResult.sections) {
      for (const u of section.serviceUsers) {
        rows.push([
          section.sectionName,
          u.serviceUser,
          u.region ?? "",
          u.area ?? "",
          u.postcode ?? "",
          matchedByLabel[u.allocation.matchedBy],
          u.allocation.ambiguous ? "YES" : "",
        ]);
      }
    }
    for (const u of bulkResult.unallocated) {
      rows.push(["Unallocated", u.serviceUser, u.region ?? "", u.area ?? "", u.postcode ?? "", "No match", "YES"]);
    }
    downloadCsv(`zone-allocation-${bulkResult.region.toLowerCase()}.csv`, rows);
  }, [bulkResult]);

  const allocatedCount = bulkResult
    ? bulkResult.sections.reduce((acc, s) => acc + s.serviceUsers.length, 0)
    : 0;

  /* ------------------------------------------------------------------ *
   * Section editor
   * ------------------------------------------------------------------ */
  const updateSection = useCallback(
    (sectionId: string, patch: Partial<ZoneSectionDef>) => {
      setRegions((prev) =>
        prev.map((r) =>
          r.region !== activeRegionName
            ? r
            : { ...r, sections: r.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)) },
        ),
      );
    },
    [activeRegionName],
  );

  const addSection = useCallback(() => {
    setRegions((prev) =>
      prev.map((r) =>
        r.region !== activeRegionName
          ? r
          : {
              ...r,
              sections: [
                ...r.sections,
                {
                  id: `section-${Date.now()}`,
                  name: `${r.region} - New Section`,
                  outwardCodes: [],
                  keywords: [],
                },
              ],
            },
      ),
    );
  }, [activeRegionName]);

  const removeSection = useCallback(
    (sectionId: string) => {
      setRegions((prev) =>
        prev.map((r) =>
          r.region !== activeRegionName ? r : { ...r, sections: r.sections.filter((s) => s.id !== sectionId) },
        ),
      );
    },
    [activeRegionName],
  );

  const resetToSeed = useCallback(() => {
    resetZoneRegions();
    toast({ title: "Sections reset", description: "Zone definitions restored to defaults." });
  }, [toast]);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary shrink-0" />
            Zone Allocator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Split a region (Customer Branch) into sections and allocate service users to them by postcode.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-48">
            <Select value={activeRegion?.region} onValueChange={setActiveRegionName}>
              <SelectTrigger data-testid="select-region" aria-label="Region (Customer Branch)">
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
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/rostering/data">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Rostering
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="allocate" className="w-full">
        <TabsList>
          <TabsTrigger value="allocate" data-testid="tab-allocate">Allocate</TabsTrigger>
          <TabsTrigger value="sections" data-testid="tab-sections">
            Sections
            <Badge variant="secondary" className="ml-2">{activeRegion?.sections.length ?? 0}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------- */}
        {/* Allocate tab */}
        {/* ---------------------------------------------------------- */}
        <TabsContent value="allocate" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4" />
                Single postcode lookup
              </CardTitle>
              <CardDescription>
                Enter a postcode (and optionally a Customer Area) to see which section it belongs to.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="lookup-postcode">Postcode</Label>
                  <Input
                    id="lookup-postcode"
                    data-testid="input-postcode"
                    placeholder="e.g. DL5 6JQ"
                    value={lookupPostcode}
                    onChange={(e) => setLookupPostcode(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lookup-area">Customer Area (optional)</Label>
                  <Input
                    id="lookup-area"
                    data-testid="input-area"
                    placeholder="e.g. Willington"
                    value={lookupArea}
                    onChange={(e) => setLookupArea(e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLookupPostcode("");
                    setLookupArea("");
                  }}
                  disabled={!lookupPostcode && !lookupArea}
                >
                  Clear
                </Button>
              </div>

              {lookupResult && (
                <div
                  className="rounded-lg border border-border bg-muted/40 p-4"
                  data-testid="lookup-result"
                >
                  {lookupResult.sectionId ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm text-muted-foreground">Allocated to</span>
                      <span className="font-semibold text-foreground">{lookupResult.sectionName}</span>
                      <Badge variant="outline">{matchedByLabel[lookupResult.matchedBy]}</Badge>
                      {lookupResult.outwardCode && (
                        <Badge variant="secondary">{lookupResult.outwardCode}</Badge>
                      )}
                      {lookupResult.ambiguous && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Needs review
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      <span>
                        No section matched this postcode{lookupResult.outwardCode ? ` (${lookupResult.outwardCode})` : ""} in {activeRegion?.region}.
                      </span>
                    </div>
                  )}
                  {lookupResult.ambiguous && lookupResult.candidates.length > 1 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Shared district — candidates:{" "}
                      {lookupResult.candidates
                        .map((id) => activeRegion?.sections.find((s) => s.id === id)?.name ?? id)
                        .join(", ")}
                      . Add the Customer Area to disambiguate.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Service users from Analyse
              </CardTitle>
              <CardDescription>
                Allocation uses the service users from the most recent Rostering <span className="font-medium">Analyse</span> run.
                Upload and analyse an ECM there, then everyone is split into sections automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {records.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>No analysed data yet</AlertTitle>
                  <AlertDescription className="text-xs">
                    Go to the Analyse tab, upload an ECM export and run the analysis. Service users
                    will then appear here and on the map. This data is volatile — refreshing the page
                    clears it.
                    <div className="mt-3">
                      <Button asChild size="sm" variant="outline">
                        <Link href="/rostering/analyse">Open Analyse</Link>
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {records.length} service user(s) from{" "}
                    <span className="font-medium text-foreground">{source ?? "Analyse"}</span>
                    {recordRegions.length > 0 && <> · branches: {recordRegions.join(", ")}</>}
                    {" · allocating for "}
                    <span className="font-medium text-foreground">{activeRegion?.region}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {bulkResult && (
                      <Button variant="outline" onClick={exportBulk} data-testid="button-export">
                        <Download className="mr-1.5 h-4 w-4" />
                        Export CSV
                      </Button>
                    )}
                    <Button asChild variant="outline" data-testid="link-zone-map">
                      <Link href="/rostering/map">
                        <MapPin className="mr-1.5 h-4 w-4" />
                        View on map
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {bulkResult && (
            <Card data-testid="bulk-result">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Allocation result — {bulkResult.region}
                </CardTitle>
                <CardDescription>
                  {allocatedCount} of {bulkResult.totalServiceUsers} service users allocated
                  {bulkResult.unallocated.length > 0 && <> · {bulkResult.unallocated.length} unallocated</>}
                  {bulkResult.ambiguous.length > 0 && <> · {bulkResult.ambiguous.length} need review</>}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {bulkResult.ambiguous.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{bulkResult.ambiguous.length} allocation(s) need review</AlertTitle>
                    <AlertDescription className="text-xs">
                      These fell into a postcode district shared by more than one section. Add the Customer
                      Area for the affected service users, or refine the section keywords.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {bulkResult.sections.map((section) => (
                    <div key={section.sectionId} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-foreground">{section.sectionName}</span>
                        <Badge variant={section.serviceUsers.length ? "secondary" : "outline"}>
                          {section.serviceUsers.length}
                        </Badge>
                      </div>
                      {section.serviceUsers.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {section.serviceUsers.map((u) => (
                            <li
                              key={`${section.sectionId}-${u.serviceUser}`}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="truncate text-foreground">{u.serviceUser}</span>
                              <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
                                {u.postcode && <span className="break-all">{u.postcode}</span>}
                                {u.allocation.ambiguous && (
                                  <AlertTriangle className="h-3 w-3 text-warning" aria-label="Needs review" />
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>

                {bulkResult.unallocated.length > 0 && (
                  <div className="rounded-lg border border-dashed border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm text-foreground">Unallocated</span>
                      <Badge variant="outline">{bulkResult.unallocated.length}</Badge>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {bulkResult.unallocated.map((u) => (
                        <li key={`un-${u.serviceUser}`} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-foreground">{u.serviceUser}</span>
                          <span className="shrink-0 break-all text-muted-foreground">
                            {u.postcode || u.area || "no postcode"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------------------------------------------------------- */}
        {/* Sections tab */}
        {/* ---------------------------------------------------------- */}
        <TabsContent value="sections" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">{activeRegion?.region} sections</CardTitle>
                <CardDescription>
                  Each section is matched by postcode outward code; keywords disambiguate shared districts.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={addSection}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add
                </Button>
                <Button variant="ghost" size="sm" onClick={resetToSeed}>
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeRegion?.sections.map((section, idx) => (
                <div key={section.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`Section ${idx + 1} name`}
                      value={section.name}
                      onChange={(e) => updateSection(section.id, { name: e.target.value })}
                      className="font-medium"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSection(section.id)}
                      aria-label={`Remove ${section.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Postcode outward codes (comma-separated)</Label>
                      <Input
                        value={section.outwardCodes.join(", ")}
                        placeholder="DL5, DL16"
                        onChange={(e) =>
                          updateSection(section.id, {
                            outwardCodes: e.target.value
                              .split(",")
                              .map((c) => c.trim().toUpperCase())
                              .filter(Boolean),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Locality keywords (comma-separated)</Label>
                      <Input
                        value={section.keywords.join(", ")}
                        placeholder="aycliffe, newton aycliffe"
                        onChange={(e) =>
                          updateSection(section.id, {
                            keywords: e.target.value
                              .split(",")
                              .map((k) => k.trim().toLowerCase())
                              .filter(Boolean),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
              {activeRegion && activeRegion.sections.length === 0 && (
                <p className="text-sm text-muted-foreground">No sections yet — add one to get started.</p>
              )}
            </CardContent>
          </Card>
          <Separator />
          <p className="text-xs text-muted-foreground">
            Section definitions are saved in this browser only. Use “Export CSV” after allocating to share results.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
