// AI provider selection. Chosen by AI_PROVIDER env; MVP only has `stub`.
import { loadEnv } from "../env.js";
import type { AIProvider } from "./interfaces.js";
import { StubAIProvider } from "./stub.js";

export * from "./interfaces.js";
export * from "./envelope.js";

let provider: AIProvider | null = null;

export function getAi(): AIProvider {
  if (provider) return provider;
  const which = loadEnv().AI_PROVIDER;
  switch (which) {
    case "stub":
    default:
      provider = new StubAIProvider();
  }
  return provider;
}

/** Test/DI seam: force a provider (e.g. a fake) and reset with getAi() cache. */
export function setAi(p: AIProvider | null): void {
  provider = p;
}
