// Module 1 — Auction intake. Partners POST won lots; we create an AuctionLot and
// a DRAFT Shipment (with a tracking id) atomically, plus the genesis custody
// event and an outbox event. The AuctionConnector adapter (selected by
// partnerCode) normalizes the partner payload — core never special-cases a house.
import type { FastifyInstance } from "fastify";
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
import { auctionLotIntake, generateTrackingId, Permission } from "@navastar/shared";
import { publishToOutbox } from "../events.js";

export default async function auctionRoutes(app: FastifyInstance) {
  app.post(
    "/api/auction/lots",
    { preHandler: [app.requirePermission(Permission.AUCTION_LOT_CREATE)] },
    async (req, reply) => {
      const parsed = auctionLotIntake.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      }
      const input = parsed.data;

      const partner = await prisma.auctionPartner.findUnique({ where: { code: input.partnerCode } });
      if (!partner || !partner.enabled) {
        return reply.code(400).send({ error: "unknown_partner", message: `Partner ${input.partnerCode} not enabled.` });
      }

      // Normalize via the partner's adapter.
      const connector = getConnector(input.partnerCode);
      const lot = connector.normalize({ ...input, raw: input.raw });

      // Auctions launch channel = vehicles.
      const commodity = await prisma.commodity.findUnique({ where: { type: CommodityType.VEHICLE } });
      if (!commodity || !commodity.enabled) {
        return reply.code(409).send({ error: "commodity_disabled", message: "Vehicle commodity is disabled." });
      }

      const result = await prisma.$transaction(async (tx) => {
        // Upsert the lot (idempotent on partner + externalLotId).
        const auctionLot = await tx.auctionLot.upsert({
          where: { partnerId_externalLotId: { partnerId: partner.id, externalLotId: lot.externalLotId } },
          update: {
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

        // If a shipment already exists for this lot, return it (idempotent intake).
        const existing = await tx.shipment.findUnique({ where: { auctionLotId: auctionLot.id } });
        if (existing) return { shipment: existing, auctionLot, created: false };

        // Buyer + pickup parties.
        const buyer = lot.buyerName
          ? await tx.party.create({
              data: { role: PartyRole.BUYER, name: lot.buyerName, email: lot.buyerEmail ?? null },
            })
          : null;
        const pickup = await tx.party.create({
          data: {
            role: PartyRole.PICKUP_CONTACT,
            name: partner.name,
            line1: lot.location ?? null,
            city: lot.location ?? null,
            lat: lot.lat ?? null,
            lng: lot.lng ?? null,
          },
        });

        const shipment = await tx.shipment.create({
          data: {
            trackingId: generateTrackingId(),
            status: ShipmentStatus.DRAFT,
            commodityId: commodity.id,
            auctionLotId: auctionLot.id,
            buyerId: buyer?.id ?? null,
            pickupId: pickup.id,
            cargoItems: {
              create: {
                description:
                  lot.title ?? (`${lot.year ?? ""} ${lot.make ?? ""} ${lot.model ?? ""}`.trim() || "Vehicle"),
                vin: lot.vin ?? null,
                make: lot.make ?? null,
                model: lot.model ?? null,
                year: lot.year ?? null,
                valueCents: lot.salePriceCents ?? null,
              },
            },
          },
        });

        await appendCustodyEvent(tx, {
          shipmentId: shipment.id,
          type: CustodyEventType.CREATED,
          actorType: "system",
          payload: {
            source: "auction_intake",
            partner: partner.code,
            externalLotId: lot.externalLotId,
            vin: lot.vin ?? null,
          },
        });

        await publishToOutbox(tx, "shipment.drafted", {
          shipmentId: shipment.id,
          trackingId: shipment.trackingId,
          partner: partner.code,
          externalLotId: lot.externalLotId,
        });

        return { shipment, auctionLot, created: true };
      });

      return reply.code(result.created ? 201 : 200).send({
        shipmentId: result.shipment.id,
        trackingId: result.shipment.trackingId,
        status: result.shipment.status,
        auctionLotId: result.auctionLot.id,
        lot: {
          vin: result.auctionLot.vin,
          make: result.auctionLot.make,
          model: result.auctionLot.model,
          year: result.auctionLot.year,
          title: result.auctionLot.title,
          location: result.auctionLot.location,
        },
        // Everything the embeddable widget needs to render the next step.
        deliverWithNavastar: connector.widget(),
      });
    }
  );
}
