// Leaflet + OSM live map (behind the MapProvider seam server-side; the client
// just renders). No react-leaflet — we drive Leaflet directly to keep deps lean.
// circleMarkers avoid Leaflet's bundler icon-asset pitfalls.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface LatLng {
  lat: number;
  lng: number;
}

export function LiveMap({
  pickup,
  dropoff,
  points,
  current,
}: {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  points: LatLng[];
  current: LatLng | null;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Init once.
  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true }).setView([39.5, -98.35], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Redraw on data change.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const bounds: L.LatLngExpression[] = [];
    if (pickup) {
      L.circleMarker([pickup.lat, pickup.lng], { radius: 7, color: "#16a34a", fillColor: "#16a34a", fillOpacity: 0.9 })
        .bindTooltip("Pickup")
        .addTo(layer);
      bounds.push([pickup.lat, pickup.lng]);
    }
    if (dropoff) {
      L.circleMarker([dropoff.lat, dropoff.lng], { radius: 7, color: "#dc2626", fillColor: "#dc2626", fillOpacity: 0.9 })
        .bindTooltip("Dropoff")
        .addTo(layer);
      bounds.push([dropoff.lat, dropoff.lng]);
    }
    // Planned lane.
    if (pickup && dropoff) {
      L.polyline(
        [
          [pickup.lat, pickup.lng],
          [dropoff.lat, dropoff.lng],
        ],
        { color: "#94a3b8", weight: 2, dashArray: "6 6" }
      ).addTo(layer);
    }
    // Traveled path.
    if (points.length > 1) {
      L.polyline(points.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], { color: "#1e40af", weight: 4 }).addTo(layer);
    }
    // Current position.
    if (current) {
      L.circleMarker([current.lat, current.lng], {
        radius: 9,
        color: "#1e40af",
        fillColor: "#3b82f6",
        fillOpacity: 1,
        weight: 3,
      })
        .bindTooltip("Driver", { permanent: false })
        .addTo(layer);
      bounds.push([current.lat, current.lng]);
    }
    if (bounds.length >= 2) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.25));
    } else if (bounds.length === 1) {
      map.setView(bounds[0]!, 9);
    }
  }, [pickup, dropoff, points, current]);

  return <div ref={elRef} className="h-72 w-full rounded-lg border border-slate-200" />;
}
