// The 8 AI capability interfaces from the brief. Implementations return an
// AIProduced<T> (result + model/version/confidence); callers wrap with runAi().
// Real vendors (Ravin, UVeye, OCR, FMCSA, etc.) implement these later — swapping
// providers never touches call sites.
import type { AIProduced } from "./envelope.js";
import type { CommodityType } from "@navastar/db";

// ── 1. Pricing ────────────────────────────────────────────────
export interface PricingInput {
  commodity: CommodityType;
  distanceMiles: number;
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
  enclosed?: boolean;
  valueCents?: number;
  itemCount?: number;
}
export interface PricingResult {
  priceCents: number;
  currency: "USD";
  breakdown: { baseCents: number; perMileCents: number; surchargesCents: number };
  etaHours: number;
}

// ── 2. Matching ───────────────────────────────────────────────
export interface MatchingInput {
  shipmentId: string;
  commodity: CommodityType;
  originLat?: number;
  originLng?: number;
  candidateDriverIds: string[];
}
export interface MatchingResult {
  ranked: Array<{ driverId: string; score: number; reason: string }>;
}

// ── 3. Inspection (AI walk-around) ────────────────────────────
export interface InspectionInput {
  shipmentId: string;
  cargoItemId?: string;
  imageKeys: string[]; // storage keys of walk-around photos/video frames
}
export interface InspectionFinding {
  panel: string;
  kind: string;
  severity: "INFO" | "MINOR" | "MODERATE" | "MAJOR" | "CRITICAL";
  confidence: number;
}
export interface InspectionResult {
  conditionScore: number; // 0..100
  findings: InspectionFinding[];
}

// ── 4. ETA ────────────────────────────────────────────────────
export interface EtaInput {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  departAt?: string;
}
export interface EtaResult {
  distanceMiles: number;
  durationHours: number;
  etaAt: string; // ISO
}

// ── 5. Document OCR (BOL / VIN / odometer) ────────────────────
export interface OcrInput {
  imageKey: string;
  kind: "BOL" | "VIN" | "ODOMETER" | "TITLE";
}
export interface OcrResult {
  fields: Record<string, string | number>;
}

// ── 6. Carrier lookup (FMCSA) ─────────────────────────────────
export interface CarrierLookupInput {
  dotNumber?: string;
  mcNumber?: string;
}
export interface CarrierLookupResult {
  legalName: string;
  dba?: string;
  authorityActive: boolean;
  safetyScore?: number;
  insuranceOnFile: boolean;
}

// ── 7. Support copilot ────────────────────────────────────────
export interface SupportInput {
  question: string;
  shipmentId?: string;
}
export interface SupportResult {
  answer: string;
  citations: string[];
}

// ── 8. Fraud / risk ───────────────────────────────────────────
export interface FraudInput {
  context: "booking" | "carrier_onboarding" | "payout";
  subjectId: string;
  signals?: Record<string, unknown>;
}
export interface FraudResult {
  riskScore: number; // 0..100 (higher = riskier)
  flags: string[];
}

/** The full AI provider surface. `stub` implements all of it; real vendors slot in. */
export interface AIProvider {
  name: string;
  aiPricing(input: PricingInput): Promise<AIProduced<PricingResult>>;
  aiMatching(input: MatchingInput): Promise<AIProduced<MatchingResult>>;
  aiInspection(input: InspectionInput): Promise<AIProduced<InspectionResult>>;
  aiEta(input: EtaInput): Promise<AIProduced<EtaResult>>;
  documentOcr(input: OcrInput): Promise<AIProduced<OcrResult>>;
  carrierLookup(input: CarrierLookupInput): Promise<AIProduced<CarrierLookupResult>>;
  supportCopilot(input: SupportInput): Promise<AIProduced<SupportResult>>;
  fraudRisk(input: FraudInput): Promise<AIProduced<FraudResult>>;
}
