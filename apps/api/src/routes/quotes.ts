// Module 1 — AI pricing quote. Computes lane distance via the MapProvider, runs
// aiPricing through runAi() (which logs an AIDecision + flags low-confidence for
// human review), persists a Quote, and moves the shipment to QUOTED. The customer
// sees the price + AI provenance; margin is never included here.
import type { FastifyInstance } from "fastify";
import {
  prisma,
  ShipmentStatus,
  QuoteStatus,
  PartyRole,
  AIDecisionKind,
} from "@navastar/db";
import { quoteRequest, Permission, getAi, runAi } from "@navastar/shared";
import { getMapProvider } from "@navastar/providers";

export default async function quoteRoutes(app: FastifyInstance) {
  app.post(
    "/api/quotes",
    { preHandler: [app.requirePermission(Permission.QUOTE_CREATE)] },
    async (req, reply) => {
      const parsed = quoteRequest.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      }
      const { shipmentId, dropoff, enclosed } = parsed.data;

      const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
        include: { pickup: true, dropoff: true, commodity: true, cargoItems: true },
      });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
      const quotable: ShipmentStatus[] = [ShipmentStatus.DRAFT, ShipmentStatus.QUOTED];
      if (!quotable.includes(shipment.status)) {
        return reply.code(409).send({ error: "not_quotable", message: `Shipment is ${shipment.status}.` });
      }

      // Resolve pickup + dropoff coordinates.
      const origin = coordsOf(shipment.pickup);
      const dest = dropoff
        ? { lat: dropoff.lat, lng: dropoff.lng }
        : coordsOf(shipment.dropoff);
      if (!origin || !dest) {
        return reply.code(422).send({
          error: "missing_coordinates",
          message: "Both pickup and dropoff coordinates are required to price this lane.",
        });
      }

      // Persist a dropoff party if the caller supplied one and none exists.
      let dropoffPartyId = shipment.dropoffId;
      if (dropoff && !shipment.dropoffId) {
        const party = await prisma.party.create({
          data: {
            role: PartyRole.DROPOFF_CONTACT,
            name: dropoff.name ?? "Delivery",
            line1: dropoff.line1 ?? null,
            city: dropoff.city ?? null,
            region: dropoff.region ?? null,
            postal: dropoff.postal ?? null,
            lat: dropoff.lat,
            lng: dropoff.lng,
          },
        });
        dropoffPartyId = party.id;
      }

      // Lane distance via the pluggable MapProvider (OSM MVP → HERE later).
      const route = await getMapProvider().route(origin, dest);

      // AI pricing wrapped in the envelope + AIDecision log.
      const ai = getAi();
      const envelope = await runAi(
        AIDecisionKind.PRICING,
        { commodity: shipment.commodity.type, distanceMiles: route.distanceMiles, enclosed: !!enclosed },
        () =>
          ai.aiPricing({
            commodity: shipment.commodity.type,
            distanceMiles: route.distanceMiles,
            enclosed: !!enclosed,
            valueCents: shipment.cargoItems[0]?.valueCents ?? undefined,
            itemCount: shipment.cargoItems.length || 1,
          }),
        { shipmentId: shipment.id }
      );

      const etaAt = new Date(Date.now() + envelope.result.etaHours * 3600_000);

      const quote = await prisma.$transaction(async (tx) => {
        // Only one ACTIVE quote at a time per shipment.
        await tx.quote.updateMany({
          where: { shipmentId: shipment.id, status: QuoteStatus.ACTIVE },
          data: { status: QuoteStatus.EXPIRED },
        });
        const created = await tx.quote.create({
          data: {
            shipmentId: shipment.id,
            priceCents: envelope.result.priceCents,
            distanceMiles: route.distanceMiles,
            etaAt,
            status: QuoteStatus.ACTIVE,
            expiresAt: new Date(Date.now() + 24 * 3600_000),
            aiDecisionId: envelope.aiDecisionId,
            model: envelope.model,
            confidence: envelope.confidence,
          },
        });
        await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            status: ShipmentStatus.QUOTED,
            distanceMiles: route.distanceMiles,
            quotedPriceCents: envelope.result.priceCents,
            etaAt,
            dropoffId: dropoffPartyId,
          },
        });
        return created;
      });

      return reply.code(201).send({
        quoteId: quote.id,
        shipmentId: shipment.id,
        priceCents: quote.priceCents,
        currency: "USD",
        distanceMiles: route.distanceMiles,
        etaAt: etaAt.toISOString(),
        breakdown: envelope.result.breakdown,
        // AI provenance surfaced to the client — pillars 1 & 2 made visible.
        ai: {
          model: envelope.model,
          version: envelope.version,
          confidence: envelope.confidence,
          needsHumanReview: envelope.needsHumanReview,
          decidedBy: envelope.decidedBy,
          qaStatus: envelope.qaStatus,
        },
      });
    }
  );
}

function coordsOf(p: { lat: number | null; lng: number | null } | null): { lat: number; lng: number } | null {
  if (p && p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
  return null;
}
