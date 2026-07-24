// Demo movement simulator. With no real drivers in the MVP, this walks a booked
// shipment from pickup → dropoff, emitting tracking pings on a timer and advancing
// status at milestones so the live map + timeline animate. Dispatcher/admin only.
import { prisma, ShipmentStatus, CustodyEventType } from "@navastar/db";
import { recordTrackingPoint, advanceStatus } from "./tracking.js";

const running = new Map<string, NodeJS.Timeout>();

export interface SimOptions {
  steps?: number; // number of pings pickup→dropoff
  intervalMs?: number; // wall-clock between pings
}

export async function startSimulation(shipmentId: string, opts: SimOptions = {}) {
  if (running.has(shipmentId)) return { alreadyRunning: true, steps: 0 };

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { pickup: true, dropoff: true, legs: true },
  });
  if (!shipment) throw Object.assign(new Error("shipment_not_found"), { statusCode: 404 });
  const from = point(shipment.pickup);
  const to = point(shipment.dropoff);
  if (!from || !to) {
    throw Object.assign(new Error("missing_coordinates_for_simulation"), { statusCode: 422 });
  }

  const steps = Math.max(4, opts.steps ?? 20);
  const intervalMs = Math.max(250, opts.intervalMs ?? 1500);

  // Kick off: mark picked up + loaded.
  await advanceStatus(shipmentId, ShipmentStatus.PICKED_UP, CustodyEventType.LOADED, { type: "system" }, {
    note: "simulation started at pickup",
  });

  let i = 0;
  let announcedTransit = false;
  const timer = setInterval(() => {
    void (async () => {
      i += 1;
      const t = i / steps;
      const lat = from.lat + (to.lat - from.lat) * t;
      const lng = from.lng + (to.lng - from.lng) * t;
      const heading = bearing(from, to);
      try {
        if (!announcedTransit && t > 0) {
          announcedTransit = true;
          await advanceStatus(shipmentId, ShipmentStatus.IN_TRANSIT, CustodyEventType.IN_TRANSIT);
        }
        await recordTrackingPoint(shipmentId, { lat, lng, speedMph: 55, heading });

        if (i >= steps) {
          stopSimulation(shipmentId);
          await advanceStatus(shipmentId, ShipmentStatus.DELIVERED, CustodyEventType.DELIVERED, { type: "system" }, {
            note: "simulation reached dropoff",
          });
        }
      } catch (err) {
        stopSimulation(shipmentId);
        // eslint-disable-next-line no-console
        console.error("[simulator] error:", err);
      }
    })();
  }, intervalMs);
  timer.unref?.();
  running.set(shipmentId, timer);
  return { alreadyRunning: false, steps, intervalMs };
}

export function stopSimulation(shipmentId: string): boolean {
  const timer = running.get(shipmentId);
  if (!timer) return false;
  clearInterval(timer);
  running.delete(shipmentId);
  return true;
}

export function isSimulating(shipmentId: string): boolean {
  return running.has(shipmentId);
}

function point(p: { lat: number | null; lng: number | null } | null): { lat: number; lng: number } | null {
  if (p && p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
  return null;
}

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
