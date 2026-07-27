// Module 1 — Book + read shipment. Booking accepts an active quote, snapshots the
// commodity margin (server-side only), moves the shipment to BOOKED, and returns
// the tracking id. Reads strip margin for anyone without margin:view.
import type { FastifyInstance } from "fastify";
import {
  prisma,
  appendCustodyEvent,
  ShipmentStatus,
  QuoteStatus,
  CustodyEventType,
} from "@navastar/db";
import { Permission } from "@navastar/shared";
import { publishToOutbox } from "../events.js";
import { serializeShipment } from "../lib/serialize.js";
import { canAccessShipment } from "../lib/access.js";

export default async function shipmentRoutes(app: FastifyInstance) {
  // POST /api/shipments/:id/book  { quoteId }
  app.post(
    "/api/shipments/:id/book",
    { preHandler: [app.requirePermission(Permission.SHIPMENT_BOOK)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as { quoteId?: string };
      if (!body.quoteId) return reply.code(400).send({ error: "bad_request", message: "quoteId is required." });

      const shipment = await prisma.shipment.findUnique({
        where: { id },
        include: { commodity: true, legs: { include: { driver: true, carrier: true } } },
      });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });

      // Only the owning customer (or ops) may book this shipment (P0 #1).
      const canBook = canAccessShipment(req.principal, {
        ownerUserId: shipment.ownerUserId,
        driverUserIds: shipment.legs.map((l) => l.driver?.userId).filter((x): x is string => !!x),
        carrierOwnerUserIds: shipment.legs.map((l) => l.carrier?.ownerUserId).filter((x): x is string => !!x),
      });
      if (!canBook) return reply.code(403).send({ error: "forbidden" });

      const quote = await prisma.quote.findUnique({ where: { id: body.quoteId } });
      if (!quote || quote.shipmentId !== shipment.id) {
        return reply.code(400).send({ error: "invalid_quote" });
      }
      if (quote.status !== QuoteStatus.ACTIVE) {
        return reply.code(409).send({ error: "quote_not_active", message: `Quote is ${quote.status}.` });
      }
      if (shipment.status !== ShipmentStatus.QUOTED && shipment.status !== ShipmentStatus.DRAFT) {
        return reply.code(409).send({ error: "already_booked", message: `Shipment is ${shipment.status}.` });
      }

      const booked = await prisma.$transaction(async (tx) => {
        const updated = await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            status: ShipmentStatus.BOOKED,
            quotedPriceCents: quote.priceCents,
            marginBps: shipment.commodity.marginBps, // margin snapshot (server-only)
            etaAt: quote.etaAt,
            distanceMiles: quote.distanceMiles,
          },
        });
        await tx.quote.update({ where: { id: quote.id }, data: { status: QuoteStatus.ACCEPTED } });

        await appendCustodyEvent(tx, {
          shipmentId: shipment.id,
          type: CustodyEventType.BOOKED,
          actorType: "user",
          actorId: req.principal?.userId ?? null,
          payload: { quoteId: quote.id, priceCents: quote.priceCents },
        });
        await publishToOutbox(tx, "shipment.booked", {
          shipmentId: shipment.id,
          trackingId: shipment.trackingId,
          priceCents: quote.priceCents,
        });
        return updated;
      });

      return reply.code(200).send({
        shipmentId: booked.id,
        trackingId: booked.trackingId, // the tracking id, as promised on booking
        status: booked.status,
        etaAt: booked.etaAt,
      });
    }
  );

  // GET /api/shipments/:id  (id or trackingId). Any authenticated role may read;
  // margin is stripped unless the caller has margin:view.
  app.get(
    "/api/shipments/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const shipment = await prisma.shipment.findFirst({
        where: { OR: [{ id }, { trackingId: id }] },
        include: {
          commodity: true,
          cargoItems: true,
          pickup: true,
          dropoff: true,
          auctionLot: { include: { partner: true } },
          quotes: { orderBy: { createdAt: "desc" }, take: 5 },
          custodyEvents: { orderBy: { sequence: "asc" } },
          legs: { include: { driver: true, carrier: true } },
        },
      });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });

      // Object-level authorization (P0 #1): owner / assigned driver / carrier / ops.
      const ok = canAccessShipment(req.principal, {
        ownerUserId: shipment.ownerUserId,
        driverUserIds: shipment.legs.map((l) => l.driver?.userId).filter((x): x is string => !!x),
        carrierOwnerUserIds: shipment.legs.map((l) => l.carrier?.ownerUserId).filter((x): x is string => !!x),
      });
      if (!ok) return reply.code(403).send({ error: "forbidden" });

      const roles = req.principal?.roles ?? [];
      return {
        shipment: serializeShipment(shipment, roles),
        cargo: shipment.cargoItems.map((c) => ({
          description: c.description,
          vin: c.vin,
          make: c.make,
          model: c.model,
          year: c.year,
        })),
        pickup: pointOf(shipment.pickup),
        dropoff: pointOf(shipment.dropoff),
        auction: shipment.auctionLot
          ? { partner: shipment.auctionLot.partner.code, externalLotId: shipment.auctionLot.externalLotId }
          : null,
        // Status timeline from the hash-chained custody log.
        timeline: shipment.custodyEvents.map((e) => ({
          sequence: e.sequence,
          type: e.type,
          at: e.createdAt,
          hash: e.hash,
        })),
        latestQuote: shipment.quotes[0]
          ? { id: shipment.quotes[0].id, priceCents: shipment.quotes[0].priceCents, status: shipment.quotes[0].status }
          : null,
      };
    }
  );
}

function pointOf(
  p: { name: string; city: string | null; lat: number | null; lng: number | null } | null
) {
  if (!p) return null;
  return { name: p.name, city: p.city, lat: p.lat, lng: p.lng };
}
