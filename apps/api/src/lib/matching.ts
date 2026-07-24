// Module 6 — Dispatch & matching engine. Scores candidate drivers for a shipment
// on four transparent factors — capability, proximity, economics, trust — and
// returns a ranked list. The scoring runs as an AI MATCHING decision (via runAi
// at the route) so it is logged with confidence and auditable; a real matching
// vendor can replace computeMatches without touching callers.
import { prisma, DriverType, type Prisma } from "@navastar/db";
import { splitRate } from "@navastar/shared";
import { getMapProvider } from "@navastar/providers";

// Weights for the composite score (sum = 1).
const W = { capability: 0.1, proximity: 0.35, economics: 0.25, trust: 0.3 };
const MAX_PROXIMITY_MILES = 600; // beyond this, proximity score ≈ 0
const DEADHEAD_CENTS_PER_MILE = 60; // cost proxy for economics

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Weighted composite of the four dispatch factors (each 0..1) → 0..1. */
export function compositeScore(f: MatchFactor): number {
  return W.capability * f.capability + W.proximity * f.proximity + W.economics * f.economics + W.trust * f.trust;
}

export interface MatchFactor {
  capability: number;
  proximity: number;
  economics: number;
  trust: number;
}
export interface MatchCandidate {
  driverId: string;
  name: string;
  type: DriverType;
  carrier: string | null;
  kind: "fleet" | "contractor";
  proximityMiles: number | null;
  payoutCents: number | null;
  score: number;
  factors: MatchFactor;
  reason: string;
  eligible: boolean;
  assetId: string | null;
}

export interface MatchResult {
  shipmentId: string;
  payoutCents: number | null;
  candidates: MatchCandidate[]; // ranked, eligible first
  confidence: number;
}

/** Score all active drivers for a shipment. Pure-ish: reads DB, no writes. */
export async function computeMatches(shipmentId: string): Promise<MatchResult> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { pickup: true, commodity: true },
  });
  if (!shipment) throw Object.assign(new Error("shipment_not_found"), { statusCode: 404 });

  const payoutCents =
    shipment.quotedPriceCents != null && shipment.marginBps != null
      ? splitRate(shipment.quotedPriceCents, shipment.marginBps).payoutCents
      : null;

  const pickup =
    shipment.pickup?.lat != null && shipment.pickup?.lng != null
      ? { lat: shipment.pickup.lat, lng: shipment.pickup.lng }
      : null;

  const drivers = await prisma.driver.findMany({
    where: { active: true },
    include: { carrier: true, legs: { where: { shipment: { status: { in: ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"] } } }, take: 1 } },
  });

  const map = getMapProvider();

  const candidates: MatchCandidate[] = await Promise.all(
    drivers.map(async (d) => {
      const kind = d.type === DriverType.EMPLOYEE_W2 ? ("fleet" as const) : ("contractor" as const);

      // Capability: employees are always authorized; contractors need active carrier authority.
      // Currently-loaded drivers are ineligible (single active leg for the MVP).
      const authorityOk = kind === "fleet" || (d.carrier?.authorityActive ?? false);
      const notBusy = d.legs.length === 0;
      const eligible = authorityOk && notBusy;
      const capability = eligible ? 1 : 0;

      // Proximity.
      let proximityMiles: number | null = null;
      let proximity = 0.4; // neutral when unknown
      if (pickup && d.lastLat != null && d.lastLng != null) {
        const route = await map.route({ lat: d.lastLat, lng: d.lastLng }, pickup);
        proximityMiles = route.distanceMiles;
        proximity = clamp01(1 - proximityMiles / MAX_PROXIMITY_MILES);
      }

      // Economics: payout minus deadhead cost, as a fraction of payout.
      let economics = 0.5;
      if (payoutCents && proximityMiles != null) {
        const deadhead = proximityMiles * DEADHEAD_CENTS_PER_MILE;
        economics = clamp01((payoutCents - deadhead) / payoutCents);
      }

      // Trust: blend driver + carrier.
      const trust = clamp01(((d.trustScore + (d.carrier?.trustScore ?? d.trustScore)) / 2) / 100);

      const score = compositeScore({ capability, proximity, economics, trust });

      const reason = !eligible
        ? notBusy
          ? "carrier authority inactive"
          : "already on an active load"
        : `${proximityMiles != null ? Math.round(proximityMiles) + " mi" : "location unknown"} · trust ${d.trustScore}`;

      return {
        driverId: d.id,
        name: d.name,
        type: d.type,
        carrier: d.carrier?.legalName ?? null,
        kind,
        proximityMiles,
        payoutCents,
        score: Math.round(score * 1000) / 1000,
        factors: {
          capability: round2(capability),
          proximity: round2(proximity),
          economics: round2(economics),
          trust: round2(trust),
        },
        reason,
        eligible,
        assetId: null,
      };
    })
  );

  // Rank: eligible first, then by score desc.
  candidates.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);

  // Confidence from the gap between the top two eligible candidates.
  const eligibleScores = candidates.filter((c) => c.eligible).map((c) => c.score);
  const gap = eligibleScores.length >= 2 ? eligibleScores[0]! - eligibleScores[1]! : eligibleScores.length ? 0.3 : 0;
  const confidence = eligibleScores.length ? clamp01(0.6 + gap) : 0.2;

  return { shipmentId, payoutCents, candidates, confidence };
}

/** Pick a usable asset for a driver's carrier (first with capacity), else null. */
export async function pickAssetFor(driverId: string): Promise<string | null> {
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver?.carrierId) return null;
  const asset = await prisma.asset.findFirst({
    where: { carrierId: driver.carrierId },
    orderBy: { capacity: "desc" },
  });
  return asset?.id ?? null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Re-export for callers that log the AIDecision input.
export type MatchInputSnapshot = Prisma.JsonObject;
