// Module 2 — Customer tracking. REST for ingesting positions + running the demo
// simulator + reading recent track history, plus a WebSocket endpoint that streams
// live `tracking.point` / `shipment.status` events for one shipment.
import type { FastifyInstance } from "fastify";
import { prisma } from "@navastar/db";
import { Permission, type AuthPrincipal } from "@navastar/shared";
import { z } from "zod";
import { recordTrackingPoint } from "../lib/tracking.js";
import { startSimulation, stopSimulation, isSimulating } from "../lib/simulator.js";
import { hub } from "../realtime.js";
import { canAccessShipment } from "../lib/access.js";

const pingBody = z.object({
  lat: z.number(),
  lng: z.number(),
  speedMph: z.number().optional(),
  heading: z.number().optional(),
  driverId: z.string().optional(),
});

const simBody = z.object({ steps: z.number().int().optional(), intervalMs: z.number().int().optional() }).optional();

export default async function trackingRoutes(app: FastifyInstance) {
  // Ingest a live position (driver app or a device). Emits to the realtime hub.
  app.post(
    "/api/shipments/:id/tracking",
    { preHandler: [app.requirePermission(Permission.SHIPMENT_TRACK)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = pingBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      const point = await recordTrackingPoint(id, parsed.data);
      return reply.code(201).send(point);
    }
  );

  // Recent track history + current position (initial map state before WS events).
  app.get("/api/shipments/:id/track", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const shipment = await prisma.shipment.findFirst({
      where: { OR: [{ id }, { trackingId: id }] },
      include: { pickup: true, dropoff: true, legs: { include: { driver: true, carrier: true } } },
    });
    if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
    // Object-level authorization (P0 #1).
    if (
      !canAccessShipment(req.principal, {
        ownerUserId: shipment.ownerUserId,
        driverUserIds: shipment.legs.map((l) => l.driver?.userId).filter((x): x is string => !!x),
        carrierOwnerUserIds: shipment.legs.map((l) => l.carrier?.ownerUserId).filter((x): x is string => !!x),
      })
    ) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const points = await prisma.trackingPoint.findMany({
      where: { shipmentId: shipment.id },
      orderBy: { recordedAt: "asc" },
      take: 500,
    });
    const last = points[points.length - 1];
    return {
      shipmentId: shipment.id,
      trackingId: shipment.trackingId,
      status: shipment.status,
      etaAt: shipment.etaAt,
      simulating: isSimulating(shipment.id),
      pickup: coord(shipment.pickup),
      dropoff: coord(shipment.dropoff),
      current: last ? { lat: last.lat, lng: last.lng, at: last.recordedAt } : null,
      points: points.map((p) => ({ lat: p.lat, lng: p.lng, at: p.recordedAt })),
    };
  });

  // Start the demo simulator (ops-gated). Use dispatch@demo / admin@demo.
  app.post(
    "/api/shipments/:id/simulate",
    { preHandler: [app.requirePermission(Permission.DISPATCH_ASSIGN)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = simBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
      const res = await startSimulation(shipment.id, parsed.data ?? {});
      return reply.code(res.alreadyRunning ? 200 : 202).send({ shipmentId: shipment.id, ...res });
    }
  );

  app.post(
    "/api/shipments/:id/simulate/stop",
    { preHandler: [app.requirePermission(Permission.DISPATCH_ASSIGN)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
      return { shipmentId: shipment.id, stopped: stopSimulation(shipment.id) };
    }
  );

  // WebSocket live stream: /ws/shipments/:id?token=JWT
  app.get("/ws/shipments/:id", { websocket: true }, (socket, req) => {
    const { id } = req.params as { id: string };
    const token = (req.query as { token?: string }).token;
    let principal: AuthPrincipal | null = null;
    try {
      principal = app.jwt.verify<AuthPrincipal>(token ?? "");
    } catch {
      socket.close(4401, "unauthorized");
      return;
    }
    const client = { send: (d: string) => socket.send(d) };
    const unsub = hub.subscribe(id, client);
    socket.send(JSON.stringify({ type: "connected", shipmentId: id, as: principal?.email }));
    socket.on("close", () => unsub());
    socket.on("error", () => unsub());
  });
}

function coord(p: { name: string; lat: number | null; lng: number | null } | null) {
  if (!p || p.lat == null || p.lng == null) return null;
  return { name: p.name, lat: p.lat, lng: p.lng };
}
