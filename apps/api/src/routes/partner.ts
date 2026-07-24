// Module 10 — Public/Partner API. Machine-to-machine, authenticated by partner API
// key. Partners import won lots, track shipments, and register webhooks. Also
// serves the embeddable "Deliver with Navastar" widget script (public). These
// endpoints are the surface documented by OpenAPI at /api/docs.
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
import { getConnector } from "@navastar/connectors";
import { generateTrackingId } from "@navastar/shared";
import { randomBytes } from "node:crypto";
import { publishToOutbox } from "../events.js";

const lotBody = z.object({
  externalLotId: z.string().min(1),
  vin: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
  title: z.string().optional(),
  salePriceCents: z.number().int().optional(),
  buyerName: z.string().optional(),
  buyerEmail: z.string().email().optional(),
  location: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  raw: z.record(z.unknown()).optional(),
});

export default async function partnerRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.requirePartner] };

  // Import a won lot → draft shipment (partner resolved from the API key).
  app.post("/api/partner/lots", { ...auth, schema: { tags: ["partner"], summary: "Import a won lot" } }, async (req, reply) => {
    const parsed = lotBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
    const partner = req.partner!;
    const connector = getConnector(partner.code as never);
    const lot = connector.normalize({ ...parsed.data, raw: parsed.data.raw });

    const commodity = await prisma.commodity.findUnique({ where: { type: CommodityType.VEHICLE } });
    if (!commodity?.enabled) return reply.code(409).send({ error: "commodity_disabled" });

    const result = await prisma.$transaction(async (tx) => {
      const auctionLot = await tx.auctionLot.upsert({
        where: { partnerId_externalLotId: { partnerId: partner.id, externalLotId: lot.externalLotId } },
        update: { vin: lot.vin, make: lot.make, model: lot.model, year: lot.year, title: lot.title, location: lot.location, lat: lot.lat, lng: lot.lng },
        create: {
          partnerId: partner.id,
          externalLotId: lot.externalLotId,
          vin: lot.vin,
          make: lot.make,
          model: lot.model,
          year: lot.year,
          title: lot.title,
          salePriceCents: lot.salePriceCents,
          buyerName: lot.buyerName,
          buyerEmail: lot.buyerEmail,
          location: lot.location,
          lat: lot.lat,
          lng: lot.lng,
          raw: (lot.raw ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      const existing = await tx.shipment.findUnique({ where: { auctionLotId: auctionLot.id } });
      if (existing) return { shipment: existing, created: false };

      const pickup = await tx.party.create({
        data: { role: PartyRole.PICKUP_CONTACT, name: partner.name, city: lot.location ?? null, lat: lot.lat ?? null, lng: lot.lng ?? null },
      });
      const shipment = await tx.shipment.create({
        data: {
          trackingId: generateTrackingId(),
          status: ShipmentStatus.DRAFT,
          commodityId: commodity.id,
          auctionLotId: auctionLot.id,
          pickupId: pickup.id,
          cargoItems: { create: { description: lot.title ?? "Vehicle", vin: lot.vin ?? null, make: lot.make ?? null, model: lot.model ?? null, year: lot.year ?? null } },
        },
      });
      await appendCustodyEvent(tx, {
        shipmentId: shipment.id,
        type: CustodyEventType.CREATED,
        actorType: "system",
        payload: { source: "partner_api", partner: partner.code, externalLotId: lot.externalLotId },
      });
      await publishToOutbox(tx, "shipment.drafted", { shipmentId: shipment.id, trackingId: shipment.trackingId, partner: partner.code });
      return { shipment, created: true };
    });

    return reply.code(result.created ? 201 : 200).send({
      trackingId: result.shipment.trackingId,
      status: result.shipment.status,
      deliverWithNavastar: connector.widget(),
    });
  });

  // Track a shipment (partner-scoped, read-only subset).
  app.get("/api/partner/shipments/:trackingId", { ...auth, schema: { tags: ["partner"], summary: "Track a shipment" } }, async (req, reply) => {
    const { trackingId } = req.params as { trackingId: string };
    const shipment = await prisma.shipment.findFirst({
      where: { trackingId, auctionLot: { partnerId: req.partner!.id } },
      include: { custodyEvents: { orderBy: { sequence: "asc" } } },
    });
    if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
    return {
      trackingId: shipment.trackingId,
      status: shipment.status,
      etaAt: shipment.etaAt,
      timeline: shipment.custodyEvents.map((e) => ({ sequence: e.sequence, type: e.type, at: e.createdAt })),
    };
  });

  // Register a webhook endpoint.
  app.post("/api/partner/webhooks", { ...auth, schema: { tags: ["partner"], summary: "Register a webhook" } }, async (req, reply) => {
    const body = z.object({ url: z.string().url(), events: z.array(z.string()).min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
    const secret = "whsec_" + randomBytes(16).toString("hex");
    const ep = await prisma.webhookEndpoint.create({
      data: { partnerId: req.partner!.id, url: body.data.url, events: body.data.events, secret },
    });
    return reply.code(201).send({
      id: ep.id,
      url: ep.url,
      events: ep.events,
      secret,
      note: "Verify each delivery: x-navastar-signature = 'sha256=' + HMAC_SHA256(secret, `${x-navastar-timestamp}.${rawBody}`). Reject if the timestamp is older than 300s.",
    });
  });

  app.get("/api/partner/webhooks", { ...auth, schema: { tags: ["partner"], summary: "List webhooks" } }, async (req) => {
    const eps = await prisma.webhookEndpoint.findMany({ where: { partnerId: req.partner!.id } });
    return { webhooks: eps.map((e) => ({ id: e.id, url: e.url, events: e.events, active: e.active })) };
  });

  // Embeddable "Deliver with Navastar" widget/SDK (public JS).
  app.get("/api/widget.js", async (_req, reply) => {
    const webBase = process.env.WIDGET_WEB_URL ?? "http://localhost:5173";
    const js = `/* Navastar embeddable widget */
(function(){
  window.Navastar = window.Navastar || {};
  window.Navastar.mount = function(el, opts){
    opts = opts || {};
    var target = typeof el === 'string' ? document.querySelector(el) : el;
    if(!target) return;
    var b = document.createElement('button');
    b.textContent = opts.label || 'Deliver with Navastar';
    b.style.cssText = 'background:#1e40af;color:#fff;border:0;border-radius:8px;padding:10px 16px;font:600 14px system-ui;cursor:pointer';
    b.onclick = function(){
      var url = '${webBase}/deliver?partner='+encodeURIComponent(opts.partner||'')+'&lot='+encodeURIComponent(opts.lot||'');
      window.open(url, '_blank');
    };
    target.appendChild(b);
  };
})();`;
    reply.header("content-type", "application/javascript; charset=utf-8").send(js);
  });
}
