import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from "react-leaflet";
import type { TimelineEntry } from "@/lib/rostering/rosterModel";
import { geocodeAddressClient, type GeocodeResult } from "@/lib/rostering/geocodeClient";
import {
  haversineDistance,
  estimateTravelMinutes,
  categorizeTravelTime,
  getTravelCategoryColor,
} from "@/lib/rostering/travelUtils";
import { Car, Clock, MapPin } from "lucide-react";

const DEFAULT_CENTER: [number, number] = [54.5, -2.5];

export interface RouteMapViewProps {
  entries: TimelineEntry[];
  showTravelLegend?: boolean;
}

export const RouteMapView: React.FC<RouteMapViewProps> = ({ entries, showTravelLegend = true }) => {
  const [points, setPoints] = useState<Record<string, GeocodeResult>>({});

  const orderedEntries = useMemo(
    () => [...entries].sort((a, b) => a.startMinutes - b.startMinutes),
    [entries]
  );

  useEffect(() => {
    let isMounted = true;
    const fetchAll = async () => {
      const updates: Record<string, GeocodeResult> = {};
      for (const entry of orderedEntries) {
        if (!entry.address) continue;
        const result = await geocodeAddressClient(entry.address);
        if (result && isMounted) {
          updates[entry.id] = result;
        }
      }
      if (isMounted) {
        setPoints((prev) => ({ ...prev, ...updates }));
      }
    };
    fetchAll();
    return () => {
      isMounted = false;
    };
  }, [orderedEntries]);

  // Build color-coded route segments
  const routeSegments = useMemo(() => {
    const segments: Array<{
      positions: [number, number][];
      color: string;
      travelMinutes: number;
      distanceKm: number;
    }> = [];

    for (let i = 0; i < orderedEntries.length - 1; i++) {
      const fromEntry = orderedEntries[i];
      const toEntry = orderedEntries[i + 1];
      const fromPoint = points[fromEntry.id];
      const toPoint = points[toEntry.id];

      if (!fromPoint || !toPoint) continue;

      const distanceKm = haversineDistance(fromPoint.lat, fromPoint.lon, toPoint.lat, toPoint.lon);
      const travelMinutes = estimateTravelMinutes(distanceKm);
      const category = categorizeTravelTime(travelMinutes);
      const color = getTravelCategoryColor(category);

      segments.push({
        positions: [
          [fromPoint.lat, fromPoint.lon],
          [toPoint.lat, toPoint.lon],
        ],
        color,
        travelMinutes,
        distanceKm: Math.round(distanceKm * 10) / 10,
      });
    }

    return segments;
  }, [orderedEntries, points]);

  const totalTravelMinutes = routeSegments.reduce((sum, s) => sum + s.travelMinutes, 0);
  const totalDistanceKm = routeSegments.reduce((sum, s) => sum + s.distanceKm, 0);

  const polyline = orderedEntries
    .map((entry) => points[entry.id])
    .filter(Boolean)
    .map((result) => [result.lat, result.lon]) as Array<[number, number]>;

  const mapCenter = polyline[0] ?? DEFAULT_CENTER;

  return (
    <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold">Route map</p>
          <p className="text-xs text-muted-foreground">
            {orderedEntries.length} stops · {Math.round(totalDistanceKm)} km · ~{totalTravelMinutes} min travel
          </p>
        </div>
        {showTravelLegend && (
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="h-2 w-4 rounded" style={{ backgroundColor: getTravelCategoryColor("short") }} />
              &lt;10m
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-4 rounded" style={{ backgroundColor: getTravelCategoryColor("medium") }} />
              10-20m
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-4 rounded" style={{ backgroundColor: getTravelCategoryColor("long") }} />
              20-30m
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-4 rounded" style={{ backgroundColor: getTravelCategoryColor("very-long") }} />
              &gt;30m
            </span>
          </div>
        )}
      </div>
      <div className="h-[420px] overflow-hidden rounded-xl border">
        <MapContainer center={mapCenter} zoom={11} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* Color-coded route segments */}
          {routeSegments.map((segment, idx) => (
            <Polyline
              key={`segment-${idx}`}
              positions={segment.positions}
              color={segment.color}
              weight={4}
              opacity={0.85}
            />
          ))}
          {/* Numbered markers */}
          {orderedEntries.map((entry, index) => {
            const result = points[entry.id];
            if (!result) return null;
            return (
              <CircleMarker
                key={entry.id}
                center={[result.lat, result.lon]}
                radius={10}
                pathOptions={{
                  color: entry.isTimeCritical ? "#f59e0b" : "#10b981",
                  fillColor: entry.isTimeCritical ? "#f59e0b" : "#10b981",
                  fillOpacity: 0.9,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="text-xs min-w-[160px]">
                    <div className="font-bold text-slate-900 text-sm">{index + 1}. {entry.title}</div>
                    {entry.serviceUserName && <div className="text-slate-700 mt-1">{entry.serviceUserName}</div>}
                    {entry.address && <div className="text-slate-500">{entry.address}</div>}
                    <div className="mt-2 flex items-center gap-2 text-slate-600">
                      <Clock className="h-3 w-3" />
                      <span>{Math.floor(entry.startMinutes / 60)}:{String(entry.startMinutes % 60).padStart(2, "0")}</span>
                      <span>·</span>
                      <span>{entry.durationMinutes}m</span>
                    </div>
                    {entry.isTimeCritical && (
                      <div className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Time critical
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      {/* Travel segments summary */}
      {routeSegments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {routeSegments.map((segment, idx) => (
            <div
              key={idx}
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px]"
              style={{ borderColor: segment.color, backgroundColor: `${segment.color}15` }}
            >
              <Car className="h-3 w-3" style={{ color: segment.color }} />
              <span style={{ color: segment.color }} className="font-medium">
                {idx + 1}→{idx + 2}: {segment.travelMinutes}m
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
