// Module 15 — Deeper AI vendor adapters. Each real vendor is a thin adapter that
// implements one capability; the CompositeAIProvider routes each capability to the
// configured backend (env). Adapters currently reuse the stub's deterministic
// scoring so the platform runs with zero keys, but they stamp their own
// model/version and are the exact seam where a real API call (Ravin phone
// walk-around, UVeye/ProovStation drive-through lanes, an OCR vendor, or OUR OWN
// trained inspection model) drops in — no call site changes.
import type { AIProduced } from "./envelope.js";
import type { AIProvider, InspectionInput, InspectionResult, OcrInput, OcrResult } from "./interfaces.js";
import { StubAIProvider } from "./stub.js";

/** Ravin AI — phone-camera walk-around damage detection. */
export class RavinInspectionProvider extends StubAIProvider {
  override name = "ravin";
  constructor(private apiKey: string) {
    super();
  }
  override async aiInspection(input: InspectionInput): Promise<AIProduced<InspectionResult>> {
    // TODO(prod): POST frames to Ravin, map their damage map → InspectionResult.
    const base = await super.aiInspection(input);
    return { ...base, model: "ravin-ai", version: this.apiKey ? "1.0" : "1.0-stub" };
  }
}

/** ProovStation / UVeye — fixed drive-through inspection lanes. */
export class ProovStationInspectionProvider extends StubAIProvider {
  override name = "proovstation";
  constructor(private apiKey: string) {
    super();
  }
  override async aiInspection(input: InspectionInput): Promise<AIProduced<InspectionResult>> {
    const base = await super.aiInspection(input);
    // Drive-through lanes report higher confidence than a phone walk-around.
    return { ...base, model: "proovstation-lane", version: "1.0", confidence: Math.min(0.97, base.confidence + 0.2) };
  }
}

/** Navastar's OWN inspection model (trained later on our accumulated labels). */
export class NavastarInspectionProvider extends StubAIProvider {
  override name = "navastar";
  override async aiInspection(input: InspectionInput): Promise<AIProduced<InspectionResult>> {
    const base = await super.aiInspection(input);
    return { ...base, model: "navastar-vision", version: "0.1-preview" };
  }
}

/** A generic OCR vendor for BOL/VIN/odometer/title. */
export class VendorOcrProvider extends StubAIProvider {
  override name = "vendor-ocr";
  constructor(private apiKey: string) {
    super();
  }
  override async documentOcr(input: OcrInput): Promise<AIProduced<OcrResult>> {
    const base = await super.documentOcr(input);
    return { ...base, model: "navastar-ocr-vendor", version: this.apiKey ? "1.0" : "1.0-stub", confidence: Math.min(0.95, base.confidence + 0.1) };
  }
}

/**
 * Routes each AI capability to a configured backend. Any method not overridden by
 * a specialized provider falls through to the default (stub).
 */
export class CompositeAIProvider implements AIProvider {
  name = "composite";
  constructor(
    private base: AIProvider,
    private overrides: { inspection?: AIProvider; ocr?: AIProvider } = {}
  ) {}

  aiPricing: AIProvider["aiPricing"] = (i) => this.base.aiPricing(i);
  aiMatching: AIProvider["aiMatching"] = (i) => this.base.aiMatching(i);
  aiEta: AIProvider["aiEta"] = (i) => this.base.aiEta(i);
  carrierLookup: AIProvider["carrierLookup"] = (i) => this.base.carrierLookup(i);
  supportCopilot: AIProvider["supportCopilot"] = (i) => this.base.supportCopilot(i);
  fraudRisk: AIProvider["fraudRisk"] = (i) => this.base.fraudRisk(i);
  aiInspection: AIProvider["aiInspection"] = (i) => (this.overrides.inspection ?? this.base).aiInspection(i);
  documentOcr: AIProvider["documentOcr"] = (i) => (this.overrides.ocr ?? this.base).documentOcr(i);
}

export { StubAIProvider };
