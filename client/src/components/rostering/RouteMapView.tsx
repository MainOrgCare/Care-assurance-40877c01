import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from "react-leaflet";
import type { TimelineEntry } from "@/lib/rostering/rosterModel";
import { geocodeAddressClient, type GeocodeResult } from "@/lib/rostering/geocodeClient";

const DEFAULT_CENTER: [number, number] = [54.5, -2.5];

export interface RouteMapViewProps {
  entries: TimelineEntry[];
}

export const RouteMapView: React.FC<RouteMapViewProps> = ({ entries }) => {
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

  const polyline = orderedEntries
    .map((entry) => points[entry.id])
    .filter(Boolean)
    .map((result) => [result.lat, result.lon]) as Array<[number, number]>;

  const mapCenter = polyline[0] ?? DEFAULT_CENTER;

  return (
    <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-sm font-semibold">Route map</p>
        <p className="text-xs text-muted-foreground">Geocoded from service user addresses.</p>
      </div>
      <div className="h-[420px] overflow-hidden rounded-xl border">
        <MapContainer center={mapCenter} zoom={11} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {polyline.length > 1 && <Polyline positions={polyline} color="#2563eb" weight={3} />}
          {orderedEntries.map((entry, index) => {
            const result = points[entry.id];
            if (!result) return null;
            return (
              <CircleMarker
                key={entry.id}
                center={[result.lat, result.lon]}
                radius={7}
                pathOptions={{ color: "#10b981", fillColor: "#10b981", fillOpacity: 0.9 }}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold text-slate-900">{index + 1}. {entry.title}</div>
                    {entry.serviceUserName && <div>{entry.serviceUserName}</div>}
                    {entry.address && <div>{entry.address}</div>}
                    <div className="mt-1 text-slate-600">{result.displayName}</div>
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
