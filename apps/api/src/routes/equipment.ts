// Module 14 — Equipment leasing marketplace. Lessors list equipment; carriers/
// operators lease it. Simple availability model: leasing a listing reserves it.
import type { FastifyInstance } from "fastify";
import { idParams } from "../lib/validation.js";
import { z } from "zod";
import { prisma, AssetType, LeaseStatus } from "@navastar/db";
import { Permission } from "@navastar/shared";

export default async function equipmentRoutes(app: FastifyInstance) {
  // Create a listing (lessor).
  app.post("/api/equipment/listings", { preHandler: [app.requirePermission(Permission.EQUIPMENT_MANAGE)] }, async (req, reply) => {
    const body = z
      .object({
        title: z.string().min(1),
        assetType: z.nativeEnum(AssetType),
        description: z.string().optional(),
        dailyRateCents: z.number().int().positive(),
        location: z.string().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
    const listing = await prisma.equipmentListing.create({
      data: { ...body.data, lessorUserId: req.principal!.userId },
    });
    return reply.code(201).send({ listingId: listing.id });
  });

  // Browse available listings (any authed).
  app.get("/api/equipment/listings", { preHandler: [app.authenticate] }, async () => {
    const listings = await prisma.equipmentListing.findMany({ where: { available: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return {
      listings: listings.map((l) => ({ id: l.id, title: l.title, assetType: l.assetType, description: l.description, dailyRateCents: l.dailyRateCents, location: l.location })),
    };
  });

  // Lease a listing.
  app.post("/api/equipment/listings/:id/lease", { preHandler: [app.requirePermission(Permission.EQUIPMENT_LEASE)] }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = z.object({ startAt: z.string().datetime().optional(), endAt: z.string().datetime().optional() }).parse(req.body ?? {});
    const listing = await prisma.equipmentListing.findUnique({ where: { id } });
    if (!listing) return reply.code(404).send({ error: "listing_not_found" });
    if (!listing.available) return reply.code(409).send({ error: "not_available" });

    let lease;
    try {
      lease = await prisma.$transaction(async (tx) => {
        // Atomic reserve: only one lessee can flip available true → false (P1 #10).
        const reserved = await tx.equipmentListing.updateMany({ where: { id, available: true }, data: { available: false } });
        if (reserved.count === 0) throw Object.assign(new Error("not_available"), { statusCode: 409 });
        return tx.lease.create({
          data: {
            listingId: id,
            lesseeUserId: req.principal!.userId,
            status: LeaseStatus.ACTIVE,
            rateCents: listing.dailyRateCents,
            startAt: body.startAt ? new Date(body.startAt) : new Date(),
            endAt: body.endAt ? new Date(body.endAt) : null,
          },
        });
      });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode ?? 500;
      return reply.code(code).send({ error: (e as Error).message });
    }
    return reply.code(201).send({ leaseId: lease.id, status: lease.status, rateCents: lease.rateCents });
  });

  // My listings (lessor) + their leases.
  app.get("/api/equipment/my-listings", { preHandler: [app.requirePermission(Permission.EQUIPMENT_MANAGE)] }, async (req) => {
    const listings = await prisma.equipmentListing.findMany({ where: { lessorUserId: req.principal!.userId }, include: { leases: true }, orderBy: { createdAt: "desc" } });
    return {
      listings: listings.map((l) => ({ id: l.id, title: l.title, assetType: l.assetType, dailyRateCents: l.dailyRateCents, available: l.available, leaseCount: l.leases.length })),
    };
  });

  // My leases (lessee).
  app.get("/api/equipment/my-leases", { preHandler: [app.requirePermission(Permission.EQUIPMENT_LEASE)] }, async (req) => {
    const leases = await prisma.lease.findMany({ where: { lesseeUserId: req.principal!.userId }, include: { listing: true }, orderBy: { createdAt: "desc" } });
    return {
      leases: leases.map((l) => ({ id: l.id, title: l.listing.title, rateCents: l.rateCents, status: l.status, startAt: l.startAt, endAt: l.endAt })),
    };
  });
}
