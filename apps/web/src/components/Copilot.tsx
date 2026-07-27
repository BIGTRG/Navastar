// Module 15 — AI copilot. Support chat (every user, with a human-handoff note) and
// a demand/revenue forecast panel for ops.
import { useEffect, useState } from "react";
import { api, ApiError, formatUSD } from "../api.js";
import { StubBadge, isStubModel } from "./StubBadge.js";

const input = "flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm";
const primary = "rounded-lg bg-navy-600 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50";

interface SupportResponse {
  answer: string;
  humanHandoffAvailable: boolean;
  ai: { model: string; confidence: number; needsHumanReview: boolean };
}
interface Forecast {
  history: { bookings: number; avgPerDay: number; avgPriceCents: number };
  forecastNext7d: { projectedVolume: number; projectedGmvCents: number };
  model: string;
  confidence: number;
}

export function Copilot({ canForecast }: { canForecast: boolean }) {
  return (
    <div className="space-y-6">
      <SupportChat />
      {canForecast && <ForecastPanel />}
    </div>
  );
}

function SupportChat() {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<Array<{ role: "you" | "ai"; text: string; meta?: string }>>([]);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (!q.trim()) return;
    const question = q.trim();
    setQ("");
    setLog((l) => [...l, { role: "you", text: question }]);
    setBusy(true);
    try {
      const res = await api.post<SupportResponse>("/api/ai/support", { question });
      setLog((l) => [
        ...l,
        {
          role: "ai",
          text: res.answer,
          meta: `${res.ai.model} · ${Math.round(res.ai.confidence * 100)}%${isStubModel(res.ai.model) ? " · stub estimate" : ""}${res.ai.needsHumanReview ? " · a human agent can take over" : ""}`,
        },
      ]);
    } catch (e) {
      setLog((l) => [...l, { role: "ai", text: e instanceof ApiError ? e.message : "Copilot error" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Support copilot</h2>
      <p className="mt-1 text-sm text-slate-500">AI answers first; a human agent can always take over.</p>
      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
        {log.length === 0 && <p className="text-sm text-slate-400">Ask about a shipment, quote, payout, onboarding…</p>}
        {log.map((m, i) => (
          <div key={i} className={m.role === "you" ? "text-right" : ""}>
            <div className={`inline-block rounded-lg px-3 py-2 text-sm ${m.role === "you" ? "bg-navy-600 text-white" : "bg-slate-100 text-slate-700"}`}>
              {m.text}
            </div>
            {m.meta && <div className="mt-0.5 text-[10px] text-slate-400">{m.meta}</div>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input className={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Type a question…" />
        <button onClick={ask} disabled={busy} className={primary}>
          {busy ? "…" : "Ask"}
        </button>
      </div>
    </section>
  );
}

function ForecastPanel() {
  const [f, setF] = useState<Forecast | null>(null);
  useEffect(() => {
    api.get<Forecast>("/api/ai/forecast").then(setF, () => setF(null));
  }, []);
  if (!f) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Demand forecast</h2>
        <StubBadge model={f.model} />
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Trailing 30d: {f.history.bookings} bookings ({f.history.avgPerDay}/day). Model {f.model} · {Math.round(f.confidence * 100)}% confidence.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Projected volume (7d)</div>
          <div className="mt-1 text-2xl font-bold text-navy-700">{f.forecastNext7d.projectedVolume}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Projected GMV (7d)</div>
          <div className="mt-1 text-2xl font-bold text-navy-700">{formatUSD(f.forecastNext7d.projectedGmvCents)}</div>
        </div>
      </div>
    </section>
  );
}
