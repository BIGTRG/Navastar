// AI provider selection. A CompositeAIProvider routes each capability to the
// configured backend so a real vendor (Ravin, ProovStation/UVeye, an OCR vendor,
// or Navastar's own model) can be swapped in per capability via env — no call
// site changes. Everything defaults to the self-contained stub.
import { loadEnv } from "../env.js";
import type { AIProvider } from "./interfaces.js";
import { StubAIProvider } from "./stub.js";
import {
  CompositeAIProvider,
  RavinInspectionProvider,
  ProovStationInspectionProvider,
  NavastarInspectionProvider,
  VendorOcrProvider,
} from "./vendors.js";

export * from "./interfaces.js";
export * from "./envelope.js";
export { StubAIProvider } from "./stub.js";
export {
  CompositeAIProvider,
  RavinInspectionProvider,
  ProovStationInspectionProvider,
  NavastarInspectionProvider,
  VendorOcrProvider,
} from "./vendors.js";

let provider: AIProvider | null = null;

function inspectionProvider(base: AIProvider): AIProvider | undefined {
  const env = loadEnv();
  switch (env.AI_INSPECTION_PROVIDER) {
    case "ravin":
      return new RavinInspectionProvider(env.RAVIN_API_KEY);
    case "proovstation":
      return new ProovStationInspectionProvider(env.PROOVSTATION_API_KEY);
    case "navastar":
      return new NavastarInspectionProvider();
    default:
      return undefined; // use base (stub)
  }
}

function ocrProvider(): AIProvider | undefined {
  const env = loadEnv();
  return env.AI_OCR_PROVIDER === "vendor" ? new VendorOcrProvider(env.OCR_API_KEY) : undefined;
}

export function getAi(): AIProvider {
  if (provider) return provider;
  const base = new StubAIProvider();
  provider = new CompositeAIProvider(base, { inspection: inspectionProvider(base), ocr: ocrProvider() });
  return provider;
}

/** Test/DI seam: force a provider (e.g. a fake) and reset with getAi() cache. */
export function setAi(p: AIProvider | null): void {
  provider = p;
}
