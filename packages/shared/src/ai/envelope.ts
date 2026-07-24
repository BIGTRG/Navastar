// The AI envelope + runAi() logger. NOTHING calls an AI capability directly —
// everything goes through runAi so that (a) every output is wrapped with
// provenance and (b) an AIDecision row is written for the human-in-the-loop + QA.
import { prisma, type AIDecisionKind, DecidedBy, QAStatus, Prisma } from "@navastar/db";
import { loadEnv } from "../env.js";

export interface AIEnvelope<T> {
  result: T;
  model: string;
  version: string;
  confidence: number; // 0..1
  decidedBy: "ai" | "human";
  approvedBy?: string | null;
  qaStatus: "pending" | "pass" | "fix" | "fail";
  needsHumanReview: boolean; // confidence < AI_CONFIDENCE_THRESHOLD
  timestamp: string; // ISO
  aiDecisionId: string;
}

/** What a capability implementation returns (envelope is assembled by runAi). */
export interface AIProduced<T> {
  result: T;
  model: string;
  version: string;
  confidence: number;
}

export interface RunAiOptions {
  shipmentId?: string | null;
  /** Override the global threshold for this call (0..1). */
  confidenceThreshold?: number;
}

/**
 * Execute an AI capability, persist an AIDecision, and return an envelope.
 * `input` is stored for audit; keep it JSON-serializable and free of secrets.
 */
export async function runAi<T>(
  kind: AIDecisionKind,
  input: unknown,
  produce: () => Promise<AIProduced<T>> | AIProduced<T>,
  opts: RunAiOptions = {}
): Promise<AIEnvelope<T>> {
  const threshold = opts.confidenceThreshold ?? loadEnv().AI_CONFIDENCE_THRESHOLD;
  const produced = await produce();
  const needsHumanReview = produced.confidence < threshold;

  const decision = await prisma.aIDecision.create({
    data: {
      kind,
      shipmentId: opts.shipmentId ?? null,
      model: produced.model,
      version: produced.version,
      confidence: produced.confidence,
      decidedBy: DecidedBy.ai,
      qaStatus: QAStatus.pending,
      needsHumanReview,
      input: toJson(input),
      output: toJson(produced.result),
    },
  });

  return {
    result: produced.result,
    model: produced.model,
    version: produced.version,
    confidence: produced.confidence,
    decidedBy: "ai",
    approvedBy: null,
    qaStatus: "pending",
    needsHumanReview,
    timestamp: decision.createdAt.toISOString(),
    aiDecisionId: decision.id,
  };
}

function toJson(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
}
