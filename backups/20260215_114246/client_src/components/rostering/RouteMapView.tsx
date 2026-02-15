import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import type { TimelineEntry } from "@/lib/rostering/rosterModel";
import { geocodeAddressClient, type GeocodeResult } from "@/lib/rostering/geocodeClient";
import {
  haversineDistance,
  estimateTravelMinutes,
  categorizeTravelTime,
  getTravelCategoryColor,
} from "@/lib/rostering/travelUtils";
import { Clock, MapPin } from "lucide-react";

// Helper component to auto-fit map bounds to markers
const FitBoundsHelper: React.FC<{ points: Array<{ lat: number; lon: number }> }> = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    if (points.length === 1) {
      // Single point: center with reasonable zoom
      map.setView([points[0].lat, points[0].lon], 14);
    } else {
      // Multiple points: fit bounds with padding
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
  }, [map, points]);

  return null;
};

// Default center: UK midpoint (used only if no data)
const DEFAULT_CENTER: [number, number] = [52.5, -1.5];

export interface RouteMapViewProps {
  entries: TimelineEntry[];
  showTravelLegend?: boolean;
}

export const RouteMapView: React.FC<RouteMapViewProps> = ({ entries, showTravelLegend = true }) => {
  const [geocodedPoints, setGeocodedPoints] = useState<Record<string, GeocodeResult>>({});

  const orderedEntries = useMemo(
    () => [...entries].sort((a, b) => a.startMinutes - b.startMinutes),
    [entries]
  );

  // Build points from pre-fetched coordinates first, then geocode missing ones
  const points = useMemo(() => {
    const result: Record<string, GeocodeResult> = {};
    for (const entry of orderedEntries) {
      // Use pre-fetched latitude/longitude if available
      if (entry.latitude != null && entry.longitude != null) {
        result[entry.id] = {
          lat: entry.latitude,
          lon: entry.longitude,
          displayName: entry.address || entry.serviceUserName || "",
        };
      } else if (geocodedPoints[entry.id]) {
        // Use geocoded result
        result[entry.id] = geocodedPoints[entry.id];
      }
    }
    return result;
  }, [orderedEntries, geocodedPoints]);

  // Geocode entries that don't have coordinates
  useEffect(() => {
    let isMounted = true;
    const fetchMissing = async () => {
      const updates: Record<string, GeocodeResult> = {};
      for (const entry of orderedEntries) {
        // Skip if already have coordinates or no address
        if (entry.latitude != null && entry.longitude != null) continue;
        if (!entry.address) continue;
        if (geocodedPoints[entry.id]) continue;

        const result = await geocodeAddressClient(entry.address);
        if (result && isMounted) {
          updates[entry.id] = result;
        }
      }
      if (isMounted && Object.keys(updates).length > 0) {
        setGeocodedPoints((prev) => ({ ...prev, ...updates }));
      }
    };
    fetchMissing();
    return () => {
      isMounted = false;
    };
  }, [orderedEntries, geocodedPoints]);

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

  // Collect all points for map bounds fitting
  const allMapPoints = useMemo(() => {
    return Object.values(points).filter((p): p is GeocodeResult => p != null);
  }, [points]);

  // Calculate map center from the first point or use default
  const mapCenter = useMemo<[number, number]>(() => {
    if (allMapPoints.length > 0) {
      return [allMapPoints[0].lat, allMapPoints[0].lon];
    }
    return DEFAULT_CENTER;
  }, [allMapPoints]);

  // Show placeholder if no data
  if (orderedEntries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded border bg-muted/20">
        <div className="text-center text-muted-foreground">
          <MapPin className="mx-auto mb-1 h-5 w-5 opacity-50" />
          <p className="text-[10px]">No stops</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded border bg-card/70 overflow-hidden">
      {showTravelLegend && allMapPoints.length > 1 && (
        <div className="flex items-center justify-between bg-muted/20 px-1.5 py-0.5 border-b text-[8px] shrink-0">
          <span className="text-muted-foreground">{orderedEntries.length} stops · {Math.round(totalDistanceKm)}km</span>
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-0.5">
              <span className="h-1 w-2 rounded-sm" style={{ backgroundColor: getTravelCategoryColor("short") }} />
              &lt;10
            </span>
            <span className="flex items-center gap-0.5">
              <span className="h-1 w-2 rounded-sm" style={{ backgroundColor: getTravelCategoryColor("medium") }} />
              10-20
            </span>
            <span className="flex items-center gap-0.5">
              <span className="h-1 w-2 rounded-sm" style={{ backgroundColor: getTravelCategoryColor("long") }} />
              20-30
            </span>
            <span className="flex items-center gap-0.5">
              <span className="h-1 w-2 rounded-sm" style={{ backgroundColor: getTravelCategoryColor("very-long") }} />
              &gt;30m
            </span>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <MapContainer center={mapCenter} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBoundsHelper points={allMapPoints} />
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
                    <div className="font-semibold text-foreground text-sm">{index + 1}. {entry.title}</div>
                    {entry.serviceUserName && <div className="text-foreground/80 mt-1">{entry.serviceUserName}</div>}
                    {entry.address && <div className="text-muted-foreground">{entry.address}</div>}
                    <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{Math.floor(entry.startMinutes / 60)}:{String(entry.startMinutes % 60).padStart(2, "0")}</span>
                      <span>·</span>
                      <span>{entry.durationMinutes}m</span>
                    </div>
                    {entry.isTimeCritical && (
                      <div className="mt-1 inline-block rounded-full bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
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
    </div>
  );
};
