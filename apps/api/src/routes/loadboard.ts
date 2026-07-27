// Module 7 — Load board. Ops posts overflow (booked, unassigned) shipments;
// vetted carriers with an active subscription browse and bid; ops awards a bid,
// which assigns the shipment to the winning carrier and charges a per-load
// connection fee (a revenue stream). Subscription + connection fee are the two
// monetization levers introduced here — both read from the DB-backed RevenueConfig.
import type { FastifyInstance } from "fastify";
import { idParams } from "../lib/validation.js";
import { z } from "zod";
import {
  prisma,
  appendCustodyEvent,
  ShipmentStatus,
  LegStatus,
  CustodyEventType,
  LoadPostStatus,
  BidStatus,
  SubscriptionStatus,
  SubscriptionTier,
  PaymentDirection,
  PaymentMethod,
  PaymentStatus,
} from "@navastar/db";
import { Permission, canViewMargin } from "@navastar/shared";
import { publishToOutbox, bus } from "../events.js";

/** Ensure the single RevenueConfig row exists and return it. */
async function revenueConfig() {
  return prisma.revenueConfig.upsert({ where: { id: "revenue" }, update: {}, create: { id: "revenue" } });
}

/** Resolve the carrier a user acts for: owned carrier, else their driver's carrier. */
async function carrierForUser(userId: string | undefined) {
  if (!userId) return null;
  const owned = await prisma.carrier.findFirst({ where: { ownerUserId: userId } });
  if (owned) return owned;
  const driver = await prisma.driver.findUnique({ where: { userId } });
  if (driver?.carrierId) return prisma.carrier.findUnique({ where: { id: driver.carrierId } });
  return null;
}

async function activeSubscription(carrierId: string) {
  return prisma.subscription.findFirst({ where: { carrierId, status: SubscriptionStatus.ACTIVE } });
}

export default async function loadboardRoutes(app: FastifyInstance) {
  // Post an overflow load (ops).
  app.post(
    "/api/loadboard/posts",
    { preHandler: [app.requirePermission(Permission.LOAD_POST)] },
    async (req, reply) => {
      const body = z
        .object({
          shipmentId: z.string(),
          targetPayoutCents: z.number().int().optional(),
          minBidCents: z.number().int().optional(),
          notes: z.string().optional(),
          expiresAt: z.string().datetime().optional(),
        })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });

      const shipment = await prisma.shipment.findFirst({
        where: { OR: [{ id: body.data.shipmentId }, { trackingId: body.data.shipmentId }] },
        include: { loadPost: true },
      });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
      if (shipment.loadPost) return reply.code(200).send({ loadPostId: shipment.loadPost.id, status: shipment.loadPost.status });
      if (shipment.status !== ShipmentStatus.BOOKED) {
        return reply.code(409).send({ error: "not_postable", message: `Only BOOKED shipments can be posted (is ${shipment.status}).` });
      }

      const post = await prisma.$transaction(async (tx) => {
        const created = await tx.loadPost.create({
          data: {
            shipmentId: shipment.id,
            postedByUserId: req.principal?.userId ?? null,
            targetPayoutCents: body.data.targetPayoutCents ?? null,
            minBidCents: body.data.minBidCents ?? null,
            notes: body.data.notes ?? null,
            expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : null,
          },
        });
        await publishToOutbox(tx, "load.posted", { loadPostId: created.id, shipmentId: shipment.id });
        return created;
      });
      return reply.code(201).send({ loadPostId: post.id, status: post.status });
    }
  );

  // Browse open loads. Carriers need an active subscription; ops/admin bypass.
  app.get(
    "/api/loadboard/posts",
    { preHandler: [app.requirePermission(Permission.LOAD_BOARD_VIEW)] },
    async (req) => {
      const roles = req.principal?.roles ?? [];
      const isOps = canViewMargin(roles); // dispatcher/admin
      const carrier = await carrierForUser(req.principal?.userId);
      const sub = carrier ? await activeSubscription(carrier.id) : null;

      if (!isOps && !sub) {
        return { needsSubscription: true, subscription: null, posts: [] };
      }

      const posts = await prisma.loadPost.findMany({
        where: { status: LoadPostStatus.OPEN },
        include: {
          shipment: { include: { cargoItems: true, pickup: true, dropoff: true, commodity: true } },
          bids: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return {
        needsSubscription: false,
        subscription: sub ? { tier: sub.tier, status: sub.status } : null,
        posts: posts.map((p) => ({
          id: p.id,
          trackingId: p.shipment.trackingId,
          commodityType: p.shipment.commodity.type,
          cargo: p.shipment.cargoItems[0]?.description ?? null,
          origin: p.shipment.pickup?.city ?? null,
          dest: p.shipment.dropoff?.city ?? null,
          targetPayoutCents: p.targetPayoutCents,
          minBidCents: p.minBidCents,
          bidCount: p.bids.length,
          myBidCents: carrier ? p.bids.find((b) => b.carrierId === carrier.id)?.amountCents ?? null : null,
          notes: p.notes,
          createdAt: p.createdAt,
        })),
      };
    }
  );

  // Place a bid (carrier; requires active subscription).
  app.post(
    "/api/loadboard/posts/:id/bids",
    { preHandler: [app.requirePermission(Permission.LOAD_BID)] },
    async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const body = z.object({ amountCents: z.number().int().positive(), note: z.string().optional() }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });

      const carrier = await carrierForUser(req.principal?.userId);
      if (!carrier) return reply.code(409).send({ error: "no_carrier", message: "Your user isn't linked to a carrier." });
      const sub = await activeSubscription(carrier.id);
      if (!sub) return reply.code(402).send({ error: "subscription_required", message: "An active load-board subscription is required to bid." });

      const post = await prisma.loadPost.findUnique({ where: { id } });
      if (!post || post.status !== LoadPostStatus.OPEN) return reply.code(409).send({ error: "load_not_open" });
      if (post.expiresAt && post.expiresAt < new Date()) return reply.code(409).send({ error: "load_expired" });
      if (post.minBidCents != null && body.data.amountCents < post.minBidCents) {
        return reply.code(422).send({ error: "below_min_bid", minBidCents: post.minBidCents });
      }

      const bid = await prisma.bid.create({
        data: {
          loadPostId: post.id,
          carrierId: carrier.id,
          bidderUserId: req.principal?.userId ?? null,
          amountCents: body.data.amountCents,
          note: body.data.note ?? null,
        },
      });
      return reply.code(201).send({ bidId: bid.id, amountCents: bid.amountCents, status: bid.status });
    }
  );

  // List bids for a post (ops).
  app.get(
    "/api/loadboard/posts/:id/bids",
    { preHandler: [app.requirePermission(Permission.LOAD_POST)] },
    async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const post = await prisma.loadPost.findUnique({ where: { id } });
      if (!post) return reply.code(404).send({ error: "load_not_found" });
      const bids = await prisma.bid.findMany({
        where: { loadPostId: id },
        include: { carrier: { select: { legalName: true, trustScore: true, safetyScore: true, authorityActive: true } } },
        orderBy: { amountCents: "asc" },
      });
      return {
        bids: bids.map((b) => ({
          id: b.id,
          amountCents: b.amountCents,
          status: b.status,
          note: b.note,
          carrier: b.carrier
            ? { name: b.carrier.legalName, trust: b.carrier.trustScore, safety: b.carrier.safetyScore, authorityActive: b.carrier.authorityActive }
            : null,
        })),
      };
    }
  );

  // Award a bid: assign the shipment to the winner + charge the connection fee (ops).
  app.post(
    "/api/loadboard/bids/:id/award",
    { preHandler: [app.requirePermission(Permission.LOAD_POST)] },
    async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const bid = await prisma.bid.findUnique({ where: { id }, include: { loadPost: true } });
      if (!bid) return reply.code(404).send({ error: "bid_not_found" });
      if (bid.loadPost.status !== LoadPostStatus.OPEN) return reply.code(409).send({ error: "load_not_open" });
      if (!bid.carrierId) return reply.code(409).send({ error: "bid_has_no_carrier" });

      const cfg = await revenueConfig();
      const driver = await prisma.driver.findFirst({ where: { carrierId: bid.carrierId, active: true } });
      const asset = await prisma.asset.findFirst({ where: { carrierId: bid.carrierId }, orderBy: { capacity: "desc" } });
      const shipmentId = bid.loadPost.shipmentId;

      const result = await prisma.$transaction(async (tx) => {
        // Atomic compare-and-set: only ONE award can flip OPEN → AWARDED (P1 #10).
        const claimed = await tx.loadPost.updateMany({
          where: {
            id: bid.loadPostId,
            status: LoadPostStatus.OPEN,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          data: { status: LoadPostStatus.AWARDED },
        });
        if (claimed.count === 0) {
          throw Object.assign(new Error("already_awarded"), { statusCode: 409 });
        }
        await tx.bid.update({ where: { id: bid.id }, data: { status: BidStatus.WON } });
        await tx.bid.updateMany({ where: { loadPostId: bid.loadPostId, id: { not: bid.id } }, data: { status: BidStatus.LOST } });

        const seq = await tx.leg.count({ where: { shipmentId } });
        const leg = await tx.leg.create({
          data: {
            shipmentId,
            sequence: seq,
            status: LegStatus.ASSIGNED,
            carrierId: bid.carrierId,
            driverId: driver?.id ?? null,
            assetId: asset?.id ?? null,
            payoutCents: bid.amountCents, // carrier's agreed pay (never the margin)
          },
        });
        await tx.shipment.update({ where: { id: shipmentId }, data: { status: ShipmentStatus.ASSIGNED } });
        await appendCustodyEvent(tx, {
          shipmentId,
          type: CustodyEventType.ASSIGNED,
          actorType: "user",
          actorId: req.principal?.userId ?? null,
          payload: { via: "load_board", carrierId: bid.carrierId, bidCents: bid.amountCents },
        });

        // Per-load connection fee — inbound revenue from the carrier.
        const fee = await tx.payment.create({
          data: {
            shipmentId,
            direction: PaymentDirection.INBOUND,
            method: PaymentMethod.ACH,
            status: PaymentStatus.CAPTURED,
            amountCents: cfg.loadBoardConnectionFeeCents,
            carrierId: bid.carrierId,
            memo: "load_board_connection_fee",
          },
        });
        await publishToOutbox(tx, "load.awarded", {
          loadPostId: bid.loadPostId,
          bidId: bid.id,
          shipmentId,
          carrierId: bid.carrierId,
          connectionFeeCents: cfg.loadBoardConnectionFeeCents,
        });
        return { leg, fee };
      });

      bus.emitEvent({
        topic: "shipment.status",
        payload: { shipmentId, status: ShipmentStatus.ASSIGNED, at: new Date().toISOString() },
        id: `${shipmentId}:load-awarded`,
        at: new Date().toISOString(),
      });

      return reply.code(200).send({
        shipmentId,
        status: ShipmentStatus.ASSIGNED,
        legId: result.leg.id,
        connectionFeeCents: cfg.loadBoardConnectionFeeCents,
      });
    }
  );

  // Subscribe / change tier (carrier). Price from RevenueConfig.
  app.post(
    "/api/loadboard/subscribe",
    { preHandler: [app.requirePermission(Permission.LOAD_BOARD_VIEW)] },
    async (req, reply) => {
      const body = z.object({ tier: z.nativeEnum(SubscriptionTier) }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
      const carrier = await carrierForUser(req.principal?.userId);
      if (!carrier) return reply.code(409).send({ error: "no_carrier", message: "Your user isn't linked to a carrier." });

      const cfg = await revenueConfig();
      const priceCents =
        body.data.tier === SubscriptionTier.FLEET
          ? cfg.subFleetPriceCents
          : body.data.tier === SubscriptionTier.PRO
            ? cfg.subProPriceCents
            : cfg.subFreePriceCents;

      // Deactivate any existing, then create the new active subscription.
      await prisma.subscription.updateMany({
        where: { carrierId: carrier.id, status: SubscriptionStatus.ACTIVE },
        data: { status: SubscriptionStatus.CANCELLED },
      });
      const sub = await prisma.subscription.create({
        data: { carrierId: carrier.id, tier: body.data.tier, status: SubscriptionStatus.ACTIVE, priceCents },
      });
      return reply.code(201).send({ subscriptionId: sub.id, tier: sub.tier, priceCents });
    }
  );
}
