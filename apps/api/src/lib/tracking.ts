// Tracking service — record a live position, recompute ETA to the dropoff via the
// MapProvider, persist, and emit a `tracking.point` event to the realtime hub.
// Also a status-advance helper that writes a custody event and emits
// `shipment.status`. Tracking pings are high-frequency + ephemeral, so they go
// straight to the bus (not the durable outbox).
import {
  prisma,
  appendCustodyEvent,
  ShipmentStatus,
  CustodyEventType,
} from "@navastar/db";
import { getMapProvider } from "@navastar/providers";
import { bus } from "../events.js";

export interface Ping {
  lat: number;
  lng: number;
  speedMph?: number;
  heading?: number;
  driverId?: string | null;
}

/** Persist a position, refresh ETA, and broadcast. Returns the new ETA (ISO). */
export async function recordTrackingPoint(shipmentId: string, ping: Ping) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { dropoff: true },
  });
  if (!shipment) throw Object.assign(new Error("shipment_not_found"), { statusCode: 404 });

  // Recompute ETA from the current position to the dropoff (if known).
  let etaAt: Date | null = shipment.etaAt;
  let remainingMiles: number | null = null;
  if (shipment.dropoff?.lat != null && shipment.dropoff?.lng != null) {
    const route = await getMapProvider().route(
      { lat: ping.lat, lng: ping.lng },
      { lat: shipment.dropoff.lat, lng: shipment.dropoff.lng }
    );
    remainingMiles = route.distanceMiles;
    etaAt = new Date(Date.now() + route.durationHours * 3600_000);
  }

  await prisma.$transaction(async (tx) => {
    await tx.trackingPoint.create({
      data: {
        shipmentId,
        driverId: ping.driverId ?? null,
        lat: ping.lat,
        lng: ping.lng,
        speedMph: ping.speedMph ?? null,
        heading: ping.heading ?? null,
      },
    });
    if (etaAt) await tx.shipment.update({ where: { id: shipmentId }, data: { etaAt } });
    if (ping.driverId) {
      await tx.driver.update({
        where: { id: ping.driverId },
        data: { lastLat: ping.lat, lastLng: ping.lng, lastSeenAt: new Date() },
      });
    }
  });

  const payload = {
    shipmentId,
    lat: ping.lat,
    lng: ping.lng,
    speedMph: ping.speedMph ?? null,
    heading: ping.heading ?? null,
    remainingMiles,
    etaAt: etaAt?.toISOString() ?? null,
    status: shipment.status,
    recordedAt: new Date().toISOString(),
  };
  bus.emitEvent({ topic: "tracking.point", payload, id: `${shipmentId}:${Date.now()}`, at: payload.recordedAt });
  return payload;
}

/** Advance shipment status: write a hash-chained custody event + emit an event. */
export async function advanceStatus(
  shipmentId: string,
  status: ShipmentStatus,
  custodyType: CustodyEventType,
  actor: { type: "system" | "driver" | "user"; id?: string | null } = { type: "system" },
  extra: Record<string, unknown> = {}
) {
  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.shipment.update({ where: { id: shipmentId }, data: { status } });
    await appendCustodyEvent(tx, {
      shipmentId,
      type: custodyType,
      actorType: actor.type,
      actorId: actor.id ?? null,
      payload: { status, ...extra },
    });
    return s;
  });
  bus.emitEvent({
    topic: "shipment.status",
    payload: { shipmentId, status, at: new Date().toISOString() },
    id: `${shipmentId}:status:${status}`,
    at: new Date().toISOString(),
  });
  return updated;
}
