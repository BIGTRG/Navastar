// Module 11 — Custody & compliance service. Verifies the append-only hash-chained
// custody log (tamper-evidence + export for audit) and runs the commodity rules
// engine against a shipment.
import type { FastifyInstance } from "fastify";
import { idParams } from "../lib/validation.js";
import { prisma, verifyCustodyChain, AssetType } from "@navastar/db";
import { Permission } from "@navastar/shared";
import { evaluateRules, ruleCatalog } from "../lib/compliance.js";

export default async function complianceRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.requirePermission(Permission.COMPLIANCE_VIEW)] };

  // The rule catalog (what the engine checks).
  app.get("/api/compliance/rules", guard, async () => ({ rules: ruleCatalog() }));

  // Run the commodity rules engine against a shipment.
  app.get("/api/compliance/shipments/:id/check", guard, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const shipment = await prisma.shipment.findFirst({
      where: { OR: [{ id }, { trackingId: id }] },
      include: {
        commodity: true,
        cargoItems: { include: { profile: true } },
        legs: { include: { asset: true } },
      },
    });
    if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });

    const profile = shipment.cargoItems.find((c) => c.profile)?.profile ?? null;
    const hasEnclosedAsset = shipment.legs.some((l) => l.asset?.type === AssetType.ENCLOSED);

    const result = evaluateRules({
      commodity: { type: shipment.commodity.type, enabled: shipment.commodity.enabled },
      profile: profile
        ? { requiresEnclosed: profile.requiresEnclosed, requiresLiftgate: profile.requiresLiftgate, hazmat: profile.hazmat, liveCargo: profile.liveCargo }
        : null,
      cargo: shipment.cargoItems.map((c) => ({ vin: c.vin, valueCents: c.valueCents })),
      hasEnclosedAsset,
      status: shipment.status,
    });
    return { trackingId: shipment.trackingId, commodity: shipment.commodity.type, ...result };
  });

  // Verify the custody chain (tamper-evidence).
  app.get("/api/custody/shipments/:id/verify", guard, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
    if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
    const chain = await verifyCustodyChain(shipment.id);
    return { trackingId: shipment.trackingId, ...chain };
  });

  // Export the full custody chain (evidence: sequence, type, actor, hashes).
  app.get("/api/custody/shipments/:id/export", guard, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
    if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
    const [events, chain] = await Promise.all([
      prisma.custodyEvent.findMany({ where: { shipmentId: shipment.id }, orderBy: { sequence: "asc" } }),
      verifyCustodyChain(shipment.id),
    ]);
    return {
      trackingId: shipment.trackingId,
      integrity: chain,
      chain: events.map((e) => ({
        sequence: e.sequence,
        type: e.type,
        actorType: e.actorType,
        actorId: e.actorId,
        payload: e.payload,
        prevHash: e.prevHash,
        hash: e.hash,
        at: e.createdAt,
      })),
    };
  });
}
