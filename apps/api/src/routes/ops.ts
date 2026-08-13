// Module 4 — Ops dashboard. KPIs, filterable shipments table, exceptions/review
// queue, and the Global GPS map roster (fleet vs contractor). A WebSocket ops
// channel streams live `driver.location` events; a roam simulator animates it.
import type { FastifyInstance } from "fastify";
import { idParams } from "../lib/validation.js";
import { z } from "zod";
import {
  prisma,
  ShipmentStatus,
  CommodityType,
  DriverType,
  CustodyEventType,
  Prisma,
} from "@navastar/db";
import { advanceStatus } from "../lib/tracking.js";
import { Permission, splitRate, type AuthPrincipal } from "@navastar/shared";
import { serializeShipment } from "../lib/serialize.js";
import { hub, OPS_ROOM } from "../realtime.js";
import { startRoam, stopRoam, roamingIds } from "../lib/driverSim.js";
import { demoEnabled } from "../lib/demo.js";

const ACTIVE: ShipmentStatus[] = [
  ShipmentStatus.BOOKED,
  ShipmentStatus.ASSIGNED,
  ShipmentStatus.PICKED_UP,
  ShipmentStatus.IN_TRANSIT,
];
const DELIVERED_STATES: ShipmentStatus[] = [ShipmentStatus.DELIVERED, ShipmentStatus.COMPLETED];
// Statuses that represent real money in flight (for GMV / revenue).
const BOOKED_PLUS: ShipmentStatus[] = [...ACTIVE, ...DELIVERED_STATES];

export default async function opsRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.requirePermission(Permission.OPS_DASHBOARD_READ)] };

  // KPIs across the operation.
  app.get("/api/ops/kpis", guard, async () => {
    const [activeShipments, delivered, exceptions, pendingReview, driversActive, confAgg] = await Promise.all([
      prisma.shipment.count({ where: { status: { in: ACTIVE } } }),
      prisma.shipment.count({ where: { status: { in: DELIVERED_STATES } } }),
      prisma.shipment.count({ where: { status: ShipmentStatus.EXCEPTION } }),
      prisma.aIDecision.count({ where: { needsHumanReview: true, approvedByUserId: null } }),
      prisma.driver.count({ where: { active: true } }),
      prisma.aIDecision.aggregate({ _avg: { confidence: true } }),
    ]);

    // GMV + revenue (margin) from money-in-flight shipments.
    const moneyShipments = await prisma.shipment.findMany({
      where: { status: { in: BOOKED_PLUS }, quotedPriceCents: { not: null } },
      select: { quotedPriceCents: true, marginBps: true },
    });
    let gmvCents = 0;
    let revenueCents = 0;
    for (const s of moneyShipments) {
      const price = s.quotedPriceCents ?? 0;
      gmvCents += price;
      if (s.marginBps != null) revenueCents += splitRate(price, s.marginBps).marginCents;
    }

    return {
      activeShipments,
      delivered,
      exceptions,
      pendingReview,
      driversActive,
      gmvCents,
      revenueCents,
      blendedTakeRateBps: gmvCents > 0 ? Math.round((revenueCents / gmvCents) * 10000) : 0,
      avgAiConfidence: confAgg._avg.confidence ?? null,
    };
  });

  // Filterable shipments table. Margin included for margin:view roles.
  app.get("/api/ops/shipments", guard, async (req) => {
    const q = z
      .object({
        status: z.nativeEnum(ShipmentStatus).optional(),
        commodity: z.nativeEnum(CommodityType).optional(),
        search: z.string().optional(),
        take: z.coerce.number().int().min(1).max(200).optional(),
      })
      .parse(req.query);

    const where: Prisma.ShipmentWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.commodity) where.commodity = { type: q.commodity };
    if (q.search) {
      where.OR = [
        { trackingId: { contains: q.search, mode: "insensitive" } },
        { cargoItems: { some: { vin: { contains: q.search, mode: "insensitive" } } } },
      ];
    }

    const shipments = await prisma.shipment.findMany({
      where,
      include: { commodity: true, pickup: true, dropoff: true },
      orderBy: { createdAt: "desc" },
      take: q.take ?? 50,
    });
    const roles = req.principal?.roles ?? [];
    return {
      shipments: shipments.map((s) => ({
        ...serializeShipment(s, roles),
        commodityType: s.commodity.type,
        origin: s.pickup?.city ?? null,
        dest: s.dropoff?.city ?? null,
        createdAt: s.createdAt,
      })),
    };
  });

  // Exceptions + human-review queue.
  app.get("/api/ops/exceptions", guard, async () => {
    const [statusExceptions, reviewQueue] = await Promise.all([
      prisma.shipment.findMany({
        where: { status: ShipmentStatus.EXCEPTION },
        select: { id: true, trackingId: true, status: true, updatedAt: true },
        take: 100,
      }),
      prisma.aIDecision.findMany({
        where: { needsHumanReview: true, approvedByUserId: null },
        include: { shipment: { select: { trackingId: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return {
      exceptions: [
        ...statusExceptions.map((s) => ({
          type: "status_exception" as const,
          shipmentId: s.id,
          trackingId: s.trackingId,
          detail: "Shipment flagged EXCEPTION",
          at: s.updatedAt,
        })),
        ...reviewQueue.map((d) => ({
          type: "needs_human_review" as const,
          shipmentId: d.shipmentId,
          trackingId: d.shipment?.trackingId ?? null,
          detail: `${d.kind} @ ${(d.confidence * 100).toFixed(0)}% confidence`,
          at: d.createdAt,
        })),
      ],
    };
  });

  // Fleet roster for the Global GPS map. fleet = employee (blue), else contractor (red).
  app.get("/api/ops/drivers", guard, async (req) => {
    const q = z.object({ kind: z.enum(["all", "fleet", "contractor"]).optional() }).parse(req.query);
    const drivers = await prisma.driver.findMany({
      where: { active: true },
      include: { carrier: { select: { legalName: true } } },
      orderBy: { name: "asc" },
    });
    const roaming = new Set(roamingIds());
    const rows = drivers
      .map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        kind: d.type === DriverType.EMPLOYEE_W2 ? ("fleet" as const) : ("contractor" as const),
        carrier: d.carrier?.legalName ?? "Navastar Fleet",
        lat: d.lastLat,
        lng: d.lastLng,
        lastSeenAt: d.lastSeenAt,
        roaming: roaming.has(d.id),
      }))
      .filter((d) => (q.kind && q.kind !== "all" ? d.kind === q.kind : true));
    return { drivers: rows };
  });

  // Fleet-map endpoint: driver positions + their current active job (via Leg) + ETA.
  app.get("/api/ops/fleet-map", guard, async () => {
    const drivers = await prisma.driver.findMany({
      where: { active: true },
      include: {
        carrier: { select: { legalName: true } },
        legs: {
          where: { shipment: { status: { in: ACTIVE } } },
          include: { shipment: { include: { pickup: true, dropoff: true } } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });
    const roaming = new Set(roamingIds());
    return {
      drivers: drivers.map((d) => {
        const leg = d.legs[0] ?? null;
        const job = leg?.shipment ?? null;
        return {
          id: d.id,
          name: d.name,
          kind: d.type === DriverType.EMPLOYEE_W2 ? "fleet" : "contractor",
          carrier: d.carrier?.legalName ?? "Navastar Fleet",
          lat: d.lastLat,
          lng: d.lastLng,
          lastSeenAt: d.lastSeenAt,
          roaming: roaming.has(d.id),
          currentJob: job
            ? {
                trackingId: job.trackingId,
                status: job.status,
                origin: job.pickup?.city ?? "—",
                dest: job.dropoff?.city ?? "—",
                etaAt: job.etaAt?.toISOString() ?? null,
              }
            : undefined,
        };
      }),
    };
  });

  // Ops resolve a shipment EXCEPTION: moves it back to IN_TRANSIT + appends event.
  app.post("/api/ops/exceptions/:id/resolve", { preHandler: [app.requirePermission(Permission.DISPATCH_ASSIGN)] }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = z.object({ note: z.string().optional() }).safeParse(req.body);
    const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
    if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
    if (shipment.status !== ShipmentStatus.EXCEPTION)
      return reply.code(409).send({ error: "not_exception", status: shipment.status });
    const updated = await advanceStatus(
      shipment.id,
      ShipmentStatus.IN_TRANSIT,
      CustodyEventType.HANDOFF,
      { type: "user", id: req.principal?.userId },
      { note: body.data?.note ?? "Exception resolved by ops" }
    );
    return { shipmentId: updated.id, status: updated.status, resolvedBy: req.principal?.userId };
  });

  // Demo: animate a driver on the map.
  app.post("/api/ops/drivers/:id/roam", { preHandler: [app.requirePermission(Permission.DISPATCH_ASSIGN)] }, async (req, reply) => {
    if (!demoEnabled()) return reply.code(403).send({ error: "demo_disabled", message: "Fleet roam simulator is disabled in production." });
    const { id } = idParams.parse(req.params);
    const res = await startRoam(id);
    return reply.code(res.alreadyRunning ? 200 : 202).send({ driverId: id, ...res });
  });
  app.post("/api/ops/drivers/:id/roam/stop", { preHandler: [app.requirePermission(Permission.DISPATCH_ASSIGN)] }, async (req) => {
    const { id } = idParams.parse(req.params);
    return { driverId: id, stopped: stopRoam(id) };
  });

  // WebSocket: live fleet positions. /ws/ops?token=JWT
  app.get("/ws/ops", { websocket: true }, (socket, req) => {
    const token = (req.query as { token?: string }).token;
    try {
      app.jwt.verify<AuthPrincipal>(token ?? "");
    } catch {
      socket.close(4401, "unauthorized");
      return;
    }
    const client = { send: (d: string) => socket.send(d) };
    const unsub = hub.subscribe(OPS_ROOM, client);
    socket.send(JSON.stringify({ type: "connected", room: "ops" }));
    socket.on("close", () => unsub());
    socket.on("error", () => unsub());
  });
}
