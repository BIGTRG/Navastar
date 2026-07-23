// MapProvider seam. MVP: OSM/haversine (no key, good enough for demo distances).
// Production: HERE (automotive-grade + truck routing: height/weight/hazmat).
import { loadEnv } from "@navastar/shared";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  distanceMiles: number;
  durationHours: number;
  provider: string;
  /** truck-routing attributes honored (HERE); empty for OSM MVP. */
  truckConstraints?: { heightM?: number; weightKg?: number; hazmat?: boolean };
}

export interface RouteOptions {
  truck?: { heightM?: number; weightKg?: number; hazmat?: boolean };
}

export interface MapProvider {
  name: string;
  route(from: LatLng, to: LatLng, opts?: RouteOptions): Promise<RouteResult>;
}

function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** OSM/haversine MVP provider. Great-circle distance × road factor. */
export class OsmMapProvider implements MapProvider {
  name = "osm";
  async route(from: LatLng, to: LatLng): Promise<RouteResult> {
    const straight = haversineMiles(from, to);
    const distanceMiles = Math.round(straight * 1.2 * 10) / 10; // ~1.2× road factor
    const durationHours = Math.round((distanceMiles / 52) * 10) / 10;
    return { distanceMiles, durationHours, provider: this.name };
  }
}

/** HERE provider placeholder — wire real truck routing in production. */
export class HereMapProvider implements MapProvider {
  name = "here";
  constructor(private apiKey: string) {}
  async route(from: LatLng, to: LatLng, opts?: RouteOptions): Promise<RouteResult> {
    if (!this.apiKey) throw new Error("HERE_API_KEY is required for the HERE map provider");
    // TODO(production): call HERE Routing v8 with truck profile + constraints.
    const fallback = await new OsmMapProvider().route(from, to);
    return { ...fallback, provider: this.name, truckConstraints: opts?.truck };
  }
}

let cached: MapProvider | null = null;
export function getMapProvider(): MapProvider {
  if (cached) return cached;
  const env = loadEnv();
  cached = env.MAP_PROVIDER === "here" ? new HereMapProvider(env.HERE_API_KEY) : new OsmMapProvider();
  return cached;
}
