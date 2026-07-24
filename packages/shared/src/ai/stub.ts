// Stub AI provider. Deterministic, dependency-free, and good enough to demo the
// full human-in-the-loop flow. Every method returns an AIProduced with a
// realistic confidence. Real vendors replace this file's class, nothing else.
import { CommodityType } from "@navastar/db";
import type { AIProduced } from "./envelope.js";
import type {
  AIProvider,
  PricingInput,
  PricingResult,
  MatchingInput,
  MatchingResult,
  InspectionInput,
  InspectionResult,
  EtaInput,
  EtaResult,
  OcrInput,
  OcrResult,
  CarrierLookupInput,
  CarrierLookupResult,
  SupportInput,
  SupportResult,
  FraudInput,
  FraudResult,
} from "./interfaces.js";

const MODEL = "navastar-stub";
const VERSION = "0.1.0";

// Base + per-mile rates (cents) per commodity — rough industry-shaped numbers.
const RATE_TABLE: Record<CommodityType, { baseCents: number; perMileCents: number }> = {
  VEHICLE: { baseCents: 9500, perMileCents: 95 },
  BOAT: { baseCents: 18000, perMileCents: 160 },
  EQUIPMENT: { baseCents: 22000, perMileCents: 210 },
  FREIGHT: { baseCents: 12000, perMileCents: 130 },
  WHITE_GLOVE: { baseCents: 26000, perMileCents: 240 },
  HIGH_VALUE: { baseCents: 24000, perMileCents: 220 },
  LIVE_ANIMALS: { baseCents: 30000, perMileCents: 300 },
};

/** Deterministic pseudo-jitter in [-1,1] from a string, so demos are stable. */
function seededUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2000) / 1000 - 1; // -1..1
}

export class StubAIProvider implements AIProvider {
  name = "stub";

  async aiPricing(input: PricingInput): Promise<AIProduced<PricingResult>> {
    const rate = RATE_TABLE[input.commodity] ?? RATE_TABLE.VEHICLE;
    const miles = Math.max(0, input.distanceMiles);
    const perMileCents = Math.round(rate.perMileCents * miles);
    let surchargesCents = 0;
    if (input.enclosed) surchargesCents += Math.round(perMileCents * 0.35 + 5000);
    if (input.valueCents && input.valueCents > 5_000_000) surchargesCents += 7500; // high-value handling
    if (input.itemCount && input.itemCount > 1) surchargesCents += (input.itemCount - 1) * 4000;

    const priceCents = rate.baseCents + perMileCents + surchargesCents;
    const etaHours = Math.max(6, Math.round((miles / 480) * 24) + 12); // ~480 mi/day + slack

    // Confidence: high for common lanes, dips for very long hauls / exotic commodities.
    let confidence = 0.9 - Math.min(0.2, miles / 20000);
    if (input.commodity === CommodityType.LIVE_ANIMALS || input.commodity === CommodityType.WHITE_GLOVE) {
      confidence -= 0.1;
    }
    confidence = clamp01(confidence + seededUnit(input.commodity + miles) * 0.03);

    return {
      result: {
        priceCents,
        currency: "USD",
        breakdown: { baseCents: rate.baseCents, perMileCents, surchargesCents },
        etaHours,
      },
      model: MODEL,
      version: VERSION,
      confidence,
    };
  }

  async aiMatching(input: MatchingInput): Promise<AIProduced<MatchingResult>> {
    const ranked = input.candidateDriverIds
      .map((driverId) => ({
        driverId,
        score: clamp01(0.5 + seededUnit(driverId + input.shipmentId) * 0.5),
        reason: "capability + proximity + trust (stub)",
      }))
      .sort((a, b) => b.score - a.score);
    return {
      result: { ranked },
      model: MODEL,
      version: VERSION,
      confidence: ranked.length ? 0.82 : 0.3,
    };
  }

  async aiInspection(input: InspectionInput): Promise<AIProduced<InspectionResult>> {
    // Fabricate a couple of plausible findings so QA/human-review has something.
    const seed = seededUnit(input.shipmentId + (input.cargoItemId ?? ""));
    const findings: InspectionResult["findings"] = [];
    if (seed > 0.2) {
      findings.push({ panel: "front-bumper", kind: "scratch", severity: "MINOR", confidence: 0.71 });
    }
    if (seed > 0.6) {
      findings.push({ panel: "rear-left-door", kind: "dent", severity: "MODERATE", confidence: 0.64 });
    }
    const conditionScore = Math.round(clamp01(0.85 - findings.length * 0.08) * 100);
    // Deliberately mid confidence so photos/damage tend to route to a human.
    return {
      result: { conditionScore, findings },
      model: MODEL,
      version: VERSION,
      confidence: 0.68,
    };
  }

  async aiEta(input: EtaInput): Promise<AIProduced<EtaResult>> {
    const distanceMiles = haversineMiles(input.originLat, input.originLng, input.destLat, input.destLng);
    const durationHours = Math.max(1, distanceMiles / 52); // avg incl. stops
    const depart = input.departAt ? new Date(input.departAt) : new Date();
    const etaAt = new Date(depart.getTime() + durationHours * 3600_000).toISOString();
    return {
      result: { distanceMiles: round1(distanceMiles), durationHours: round1(durationHours), etaAt },
      model: MODEL,
      version: VERSION,
      confidence: 0.8,
    };
  }

  async documentOcr(input: OcrInput): Promise<AIProduced<OcrResult>> {
    const fields: Record<string, string | number> =
      input.kind === "VIN"
        ? { vin: "1HGCM82633A004352" }
        : input.kind === "ODOMETER"
          ? { odometer: 84213 }
          : input.kind === "BOL"
            ? { bolNumber: "BOL-STUB-0001", shipper: "Auction Yard", consignee: "Buyer" }
            : { titleNumber: "TTL-STUB-0001" };
    return { result: { fields }, model: MODEL, version: VERSION, confidence: 0.73 };
  }

  async carrierLookup(input: CarrierLookupInput): Promise<AIProduced<CarrierLookupResult>> {
    return {
      result: {
        legalName: "Stub Carrier LLC",
        authorityActive: true,
        safetyScore: 85,
        insuranceOnFile: true,
      },
      model: MODEL,
      version: VERSION,
      confidence: input.dotNumber || input.mcNumber ? 0.9 : 0.4,
    };
  }

  async supportCopilot(input: SupportInput): Promise<AIProduced<SupportResult>> {
    return {
      result: {
        answer: `(stub) I can help with: "${input.question}". A human agent can take over anytime.`,
        citations: [],
      },
      model: MODEL,
      version: VERSION,
      confidence: 0.6,
    };
  }

  async fraudRisk(input: FraudInput): Promise<AIProduced<FraudResult>> {
    const risk = Math.round(clamp01(0.15 + seededUnit(input.subjectId) * 0.15) * 100);
    return {
      result: { riskScore: risk, flags: risk > 60 ? ["velocity", "new_account"] : [] },
      model: MODEL,
      version: VERSION,
      confidence: 0.77,
    };
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(d: number): number {
  return (d * Math.PI) / 180;
}
