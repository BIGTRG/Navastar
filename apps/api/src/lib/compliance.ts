// Module 11 — Commodity rules engine. Evaluates a shipment against its commodity
// + handling-profile rules and returns violations. Pure rule functions so new
// commodities/rules are added here, not scattered through the codebase. Pairs with
// the append-only hash-chained custody log (verifyCustodyChain) for compliance.
import { CommodityType } from "@navastar/db";

export type Severity = "error" | "warning" | "info";

export interface RuleContext {
  commodity: { type: CommodityType; enabled: boolean };
  profile: { requiresEnclosed: boolean; requiresLiftgate: boolean; hazmat: boolean; liveCargo: boolean } | null;
  cargo: Array<{ vin: string | null; valueCents: number | null }>;
  hasEnclosedAsset: boolean; // from an assigned leg's asset, if any
  status: string;
}

export interface Violation {
  rule: string;
  severity: Severity;
  message: string;
}

const HIGH_VALUE_THRESHOLD_CENTS = 5_000_000; // $50k

type Rule = { id: string; evaluate: (ctx: RuleContext) => Violation | null };

const RULES: Rule[] = [
  {
    id: "commodity_enabled",
    evaluate: (ctx) =>
      ctx.commodity.enabled
        ? null
        : { rule: "commodity_enabled", severity: "error", message: `Commodity ${ctx.commodity.type} is currently disabled and cannot ship.` },
  },
  {
    id: "live_animals_gate",
    evaluate: (ctx) =>
      ctx.commodity.type === CommodityType.LIVE_ANIMALS && !ctx.commodity.enabled
        ? { rule: "live_animals_gate", severity: "error", message: "Live Animals is toggled OFF — enable it in Revenue admin before shipping." }
        : null,
  },
  {
    id: "enclosed_required",
    evaluate: (ctx) =>
      ctx.profile?.requiresEnclosed && !ctx.hasEnclosedAsset
        ? { rule: "enclosed_required", severity: "warning", message: "Handling profile requires enclosed transport; assign an enclosed asset." }
        : null,
  },
  {
    id: "hazmat_endorsement",
    evaluate: (ctx) =>
      ctx.profile?.hazmat
        ? { rule: "hazmat_endorsement", severity: "warning", message: "Hazmat load — assign a hazmat-endorsed carrier/driver." }
        : null,
  },
  {
    id: "high_value_handling",
    evaluate: (ctx) =>
      ctx.cargo.some((c) => (c.valueCents ?? 0) > HIGH_VALUE_THRESHOLD_CENTS)
        ? { rule: "high_value_handling", severity: "warning", message: "High-value cargo — enclosed transport + signature POD recommended; extra insurance advised." }
        : null,
  },
  {
    id: "vin_present",
    evaluate: (ctx) =>
      ctx.commodity.type === CommodityType.VEHICLE && ctx.cargo.some((c) => !c.vin)
        ? { rule: "vin_present", severity: "info", message: "One or more vehicles are missing a VIN — capture it at pickup (OCR)." }
        : null,
  },
];

export function evaluateRules(ctx: RuleContext): { ok: boolean; violations: Violation[] } {
  const violations = RULES.map((r) => r.evaluate(ctx)).filter((v): v is Violation => v !== null);
  const ok = !violations.some((v) => v.severity === "error");
  return { ok, violations };
}

export function ruleCatalog(): Array<{ id: string }> {
  return RULES.map((r) => ({ id: r.id }));
}
