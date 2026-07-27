// Module 8 — Carrier & driver onboarding. Dual track: Employee (W-2) and
// Independent/lease-on. FMCSA QCMobile auto-fill by DOT/MC (carrierLookup stub,
// logged as an AI CARRIER_LOOKUP decision), carrier insurance/authority capture,
// and license-scan + background stubs for employees. Ops verifies.
import type { FastifyInstance } from "fastify";
import { idParams } from "../lib/validation.js";
import { z } from "zod";
import {
  prisma,
  CarrierKind,
  DriverType,
  OnboardingStatus,
  InsuranceType,
  AIDecisionKind,
} from "@navastar/db";
import { Permission, getAi, runAi } from "@navastar/shared";

export default async function onboardingRoutes(app: FastifyInstance) {
  const submit = { preHandler: [app.requirePermission(Permission.ONBOARD_SUBMIT)] };
  const manage = { preHandler: [app.requirePermission(Permission.ONBOARD_MANAGE)] };

  // FMCSA auto-fill by DOT/MC (stub). Logs an AI CARRIER_LOOKUP decision.
  app.post("/api/onboarding/carrier/lookup", submit, async (req, reply) => {
    const body = z.object({ dotNumber: z.string().optional(), mcNumber: z.string().optional() }).safeParse(req.body);
    if (!body.success || (!body.data.dotNumber && !body.data.mcNumber)) {
      return reply.code(400).send({ error: "bad_request", message: "dotNumber or mcNumber required." });
    }
    const ai = getAi();
    const envelope = await runAi(
      AIDecisionKind.CARRIER_LOOKUP,
      body.data,
      () => ai.carrierLookup(body.data)
    );
    return {
      prefill: envelope.result,
      ai: { model: envelope.model, confidence: envelope.confidence, needsHumanReview: envelope.needsHumanReview },
    };
  });

  // Submit a carrier application. Upserts by DOT and links the caller as owner.
  app.post("/api/onboarding/carrier", submit, async (req, reply) => {
    const body = z
      .object({
        legalName: z.string().min(1),
        dba: z.string().optional(),
        dotNumber: z.string().optional(),
        mcNumber: z.string().optional(),
        kind: z.nativeEnum(CarrierKind).optional(),
        insurance: z
          .object({
            type: z.nativeEnum(InsuranceType).default(InsuranceType.CARGO),
            provider: z.string(),
            policyNo: z.string().optional(),
            coverageCents: z.number().int().optional(),
            expiresAt: z.string().datetime().optional(),
          })
          .optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
    const d = body.data;

    const carrier = await prisma.carrier.upsert({
      where: { dotNumber: d.dotNumber ?? `pending-${req.principal?.userId}` },
      update: {
        legalName: d.legalName,
        dba: d.dba,
        mcNumber: d.mcNumber,
        kind: d.kind ?? CarrierKind.INDEPENDENT,
        ownerUserId: req.principal?.userId ?? null,
        onboardingStatus: OnboardingStatus.DOCS_SUBMITTED,
      },
      create: {
        legalName: d.legalName,
        dba: d.dba,
        dotNumber: d.dotNumber ?? `pending-${req.principal?.userId}`,
        mcNumber: d.mcNumber,
        kind: d.kind ?? CarrierKind.INDEPENDENT,
        ownerUserId: req.principal?.userId ?? null,
        onboardingStatus: OnboardingStatus.DOCS_SUBMITTED,
      },
    });

    if (d.insurance) {
      await prisma.insurance.create({
        data: {
          carrierId: carrier.id,
          type: d.insurance.type,
          provider: d.insurance.provider,
          policyNo: d.insurance.policyNo,
          coverageCents: d.insurance.coverageCents,
          expiresAt: d.insurance.expiresAt ? new Date(d.insurance.expiresAt) : null,
        },
      });
    }
    return reply.code(201).send({ carrierId: carrier.id, onboardingStatus: carrier.onboardingStatus });
  });

  // Submit a driver application (dual track).
  app.post("/api/onboarding/driver", submit, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        type: z.nativeEnum(DriverType),
        phone: z.string().optional(),
        licenseNo: z.string().optional(),
        licenseState: z.string().optional(),
        carrierId: z.string().optional(),
        linkSelf: z.boolean().optional(), // link to the caller's user (self-onboarding)
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
    const d = body.data;

    // Employees (W-2) require a license + kick off a background check (stub).
    const isEmployee = d.type === DriverType.EMPLOYEE_W2;
    const driver = await prisma.driver.create({
      data: {
        name: d.name,
        type: d.type,
        phone: d.phone,
        licenseNo: d.licenseNo,
        licenseState: d.licenseState,
        carrierId: d.carrierId ?? null,
        userId: d.linkSelf ? req.principal?.userId ?? null : null,
        onboardingStatus: OnboardingStatus.DOCS_SUBMITTED,
        licenseVerified: false,
        backgroundCheckStatus: isEmployee ? "pending" : null,
      },
    });
    return reply.code(201).send({
      driverId: driver.id,
      onboardingStatus: driver.onboardingStatus,
      backgroundCheckStatus: driver.backgroundCheckStatus,
    });
  });

  // Caller's onboarding status (carrier they own + drivers they're linked to).
  app.get("/api/onboarding/status", submit, async (req) => {
    const userId = req.principal?.userId;
    const [carrier, driver] = await Promise.all([
      prisma.carrier.findFirst({ where: { ownerUserId: userId }, include: { insurances: true } }),
      prisma.driver.findFirst({ where: { userId } }),
    ]);
    return {
      carrier: carrier
        ? {
            id: carrier.id,
            legalName: carrier.legalName,
            onboardingStatus: carrier.onboardingStatus,
            authorityActive: carrier.authorityActive,
            insurances: carrier.insurances.map((i) => ({ type: i.type, provider: i.provider, expiresAt: i.expiresAt, active: i.active })),
          }
        : null,
      driver: driver
        ? { id: driver.id, type: driver.type, onboardingStatus: driver.onboardingStatus, licenseVerified: driver.licenseVerified, backgroundCheckStatus: driver.backgroundCheckStatus }
        : null,
    };
  });

  // ── Ops verification ──
  app.get("/api/onboarding/pending", manage, async () => {
    const [carriers, drivers] = await Promise.all([
      prisma.carrier.findMany({
        where: { onboardingStatus: { in: [OnboardingStatus.PENDING, OnboardingStatus.DOCS_SUBMITTED] } },
        include: { insurances: true },
        take: 100,
      }),
      prisma.driver.findMany({
        where: { onboardingStatus: { in: [OnboardingStatus.PENDING, OnboardingStatus.DOCS_SUBMITTED] } },
        take: 100,
      }),
    ]);
    return {
      carriers: carriers.map((c) => ({
        id: c.id,
        legalName: c.legalName,
        dotNumber: c.dotNumber,
        mcNumber: c.mcNumber,
        onboardingStatus: c.onboardingStatus,
        insuranceCount: c.insurances.length,
      })),
      drivers: drivers.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        onboardingStatus: d.onboardingStatus,
        backgroundCheckStatus: d.backgroundCheckStatus,
      })),
    };
  });

  app.post("/api/onboarding/carrier/:id/verify", manage, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = z.object({ approve: z.boolean().default(true) }).parse(req.body ?? {});
    const carrier = await prisma.carrier.update({
      where: { id },
      data: body.approve
        ? { onboardingStatus: OnboardingStatus.VERIFIED, authorityActive: true, fmcsaVerifiedAt: new Date() }
        : { onboardingStatus: OnboardingStatus.REJECTED },
    });
    return { carrierId: carrier.id, onboardingStatus: carrier.onboardingStatus };
  });

  app.post("/api/onboarding/driver/:id/verify", manage, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = z.object({ approve: z.boolean().default(true) }).parse(req.body ?? {});
    const driver = await prisma.driver.update({
      where: { id },
      data: body.approve
        ? { onboardingStatus: OnboardingStatus.VERIFIED, licenseVerified: true, backgroundCheckStatus: "clear", active: true }
        : { onboardingStatus: OnboardingStatus.REJECTED },
    });
    return { driverId: driver.id, onboardingStatus: driver.onboardingStatus };
  });
}
