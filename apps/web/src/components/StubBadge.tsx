// P2-17 — AI honesty in the UI. Pricing/matching/inspection/forecast are
// deterministic stubs today, not trained models. This labels any stub output so
// nobody mistakes stub "confidence" for a real model's confidence.
//
// Real vendors are intentionally NOT flagged: ravin-ai@1.0, proovstation-lane@1.0,
// and navastar-ocr-vendor@1.0 (only when a real API key is configured) report a
// clean version and read as production. Navastar-native models and any *-stub or
// *-preview version are flagged.
export function isStubModel(model: string, version = ""): boolean {
  return (
    /stub|preview/i.test(version) ||
    model === "navastar-stub" ||
    model === "navastar-matcher" ||
    model === "navastar-forecast" ||
    model === "navastar-vision"
  );
}

export function StubBadge({
  model,
  version = "",
  className = "",
}: {
  model: string;
  version?: string;
  className?: string;
}) {
  if (!isStubModel(model, version)) return null;
  return (
    <span
      title="Deterministic stub — not a trained model. Values are estimates until a real AI vendor is wired in."
      className={`rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500 ${className}`}
    >
      estimate · stub model
    </span>
  );
}
