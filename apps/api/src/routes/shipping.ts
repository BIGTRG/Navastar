// Module 14 — Multi-commodity shipping. Create a draft shipment for ANY enabled
// commodity (boats, equipment, freight, white-glove, high-value, live animals when
// toggled on) with a handling profile — then the existing quote/book flow applies.
// The commodity rules engine gates disabled commodities.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  prisma,
  appendCustodyEvent,
  CommodityType,
  PartyRole,
  ShipmentStatus,
  CustodyEventType,
  Prisma,
} from "@navastar/db";
import { generateTrackingId, Permission } from "@navastar/shared";
import { publishToOutbox } from "../events.js";

const point = z.object({
  name: z.string().optional(),
  city: z.string().optional(),
  line1: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
});

export default async function shippingRoutes(app: FastifyInstance) {
  // Handling-profile catalog (optionally filtered by commodity).
  app.get("/api/handling-profiles", { preHandler: [app.authenticate] }, async (req) => {
    const q = z.object({ commodity: z.nativeEnum(CommodityType).optional() }).parse(req.query);
    const profiles = await prisma.handlingProfile.findMany({
      where: q.commodity ? { commodity: q.commodity } : undefined,
      orderBy: { name: "asc" },
    });
    return { profiles: profiles.map((p) => ({ id: p.id, commodity: p.commodity, name: p.name, requiresEnclosed: p.requiresEnclosed, hazmat: p.hazmat, liveCargo: p.liveCargo })) };
  });

  // Create a multi-commodity draft shipment.
  app.post("/api/shipments", { preHandler: [app.requirePermission(Permission.SHIPMENT_CREATE)] }, async (req, reply) => {
    const body = z
      .object({
        commodityType: z.nativeEnum(CommodityType),
        handlingProfileId: z.string().optional(),
        description: z.string().min(1),
        valueCents: z.number().int().optional(),
        attrs: z.record(z.unknown()).optional(),
        pickup: point,
        dropoff: point,
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
    const d = body.data;

    const commodity = await prisma.commodity.findUnique({ where: { type: d.commodityType } });
    if (!commodity) return reply.code(400).send({ error: "unknown_commodity" });
    if (!commodity.enabled) {
      return reply.code(409).send({ error: "commodity_disabled", message: `${d.commodityType} is currently OFF. An admin can enable it in Revenue admin.` });
    }

    const result = await prisma.$transaction(async (tx) => {
      const pickup = await tx.party.create({
        data: { role: PartyRole.PICKUP_CONTACT, name: d.pickup.name ?? "Pickup", city: d.pickup.city ?? null, line1: d.pickup.line1 ?? null, lat: d.pickup.lat, lng: d.pickup.lng },
      });
      const dropoff = await tx.party.create({
        data: { role: PartyRole.DROPOFF_CONTACT, name: d.dropoff.name ?? "Dropoff", city: d.dropoff.city ?? null, line1: d.dropoff.line1 ?? null, lat: d.dropoff.lat, lng: d.dropoff.lng },
      });
      const shipment = await tx.shipment.create({
        data: {
          trackingId: generateTrackingId(),
          status: ShipmentStatus.DRAFT,
          commodityId: commodity.id,
          ownerUserId: req.principal?.userId ?? null, // object-level authz (P0 #1)
          pickupId: pickup.id,
          dropoffId: dropoff.id,
          cargoItems: {
            create: {
              profileId: d.handlingProfileId ?? null,
              description: d.description,
              valueCents: d.valueCents ?? null,
              attrs: (d.attrs ?? undefined) as Prisma.InputJsonValue | undefined,
            },
          },
        },
      });
      await appendCustodyEvent(tx, {
        shipmentId: shipment.id,
        type: CustodyEventType.CREATED,
        actorType: "user",
        actorId: req.principal?.userId ?? null,
        payload: { source: "multi_commodity", commodity: d.commodityType },
      });
      await publishToOutbox(tx, "shipment.drafted", { shipmentId: shipment.id, trackingId: shipment.trackingId, commodity: d.commodityType });
      return shipment;
    });

    return reply.code(201).send({ shipmentId: result.id, trackingId: result.trackingId, status: result.status });
  });
}
