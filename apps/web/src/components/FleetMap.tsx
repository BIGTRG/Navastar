// Global GPS map of active drivers — fleet = blue, contractor = red. Driver dots
// update live from the ops WebSocket. Leaflet driven directly (no react-leaflet).
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FleetDriver } from "../api.js";

const COLORS = { fleet: "#2563eb", contractor: "#dc2626" } as const;

export function FleetMap({ drivers }: { drivers: FleetDriver[] }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const fittedRef = useRef(false);

  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current).setView([39.5, -98.35], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    const bounds: L.LatLngExpression[] = [];

    for (const d of drivers) {
      if (d.lat == null || d.lng == null) continue;
      seen.add(d.id);
      bounds.push([d.lat, d.lng]);
      const color = COLORS[d.kind];
      let marker = markersRef.current.get(d.id);
      if (!marker) {
        marker = L.circleMarker([d.lat, d.lng], { radius: 8, color, fillColor: color, fillOpacity: 0.85, weight: 2 })
          .bindTooltip(`${d.name} · ${d.kind}`, { direction: "top" })
          .addTo(map);
        markersRef.current.set(d.id, marker);
      } else {
        marker.setLatLng([d.lat, d.lng]);
        marker.setStyle({ color, fillColor: color });
      }
    }
    // Remove markers for drivers no longer present.
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
    if (!fittedRef.current && bounds.length >= 1) {
      fittedRef.current = true;
      if (bounds.length >= 2) map.fitBounds(L.latLngBounds(bounds).pad(0.3));
      else map.setView(bounds[0]!, 8);
    }
  }, [drivers]);

  return <div ref={elRef} className="h-80 w-full rounded-lg border border-slate-200" />;
}
