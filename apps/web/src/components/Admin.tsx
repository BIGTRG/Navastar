// Module 13 — Revenue & Monetization admin backboard. Live dashboard + control
// panel for all six revenue streams (DB-backed, no redeploy) + commodity toggles.
// B-track: revenue bar chart, monthly & annual totals, improved brand styling.
import { useEffect, useState } from "react";
import { api, ApiError, formatUSD, type RevenueConfigResponse, type RevenueDashboard } from "../api.js";

const input = "w-28 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-[#203088] focus:outline-none";
const primary = "rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
const btnPrimary = `${primary} bg-[#203088]`;
const btnDanger = `${primary} bg-[#B4182A]`;
const badge = "rounded-full px-2 py-0.5 text-xs font-medium";

// ── Root ──────────────────────────────────────────────────────────────────────
export function Admin() {
  return (
    <div className="space-y-6">
      <Dashboard />
      <Levers />
    </div>
  );
}

// ── Revenue dashboard ─────────────────────────────────────────────────────────
function Dashboard() {
  const [d, setD] = useState<RevenueDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setD(await api.get<RevenueDashboard>("/api/admin/revenue/dashboard"));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load");
    }
  }
  useEffect(() => {
    void load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!d) return <p className="text-sm text-slate-400">Loading revenue…</p>;

  const streams: Array<{ label: string; cents: number; color: string }> = [
    { label: "Margin", cents: d.streams.margin, color: "#203088" },
    { label: "Subscriptions (MRR)", cents: d.streams.subscriptionMrr, color: "#2563eb" },
    { label: "Quick-pay fees", cents: d.streams.quickPayFees, color: "#B4182A" },
    { label: "Connection fees", cents: d.streams.loadBoardConnectionFees, color: "#E4181E" },
    { label: "Escrow/assurance", cents: d.streams.escrowAssuranceFees, color: "#B0B0B8" },
    { label: "Value-add", cents: d.streams.valueAdd, color: "#333333" },
  ];

  const maxCents = Math.max(...streams.map((s) => s.cents), 1);

  // Pull monthly/annual from extended response (may be undefined on old API).
  const ext = d as RevenueDashboard & { monthlyRevenueCents?: number; annualRevenueCents?: number };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header bar */}
      <div className="bg-[#203088] px-6 py-4">
        <h2 className="text-lg font-semibold text-white">Revenue Dashboard</h2>
        <p className="text-xs text-blue-200">Live · refreshes every 15 s</p>
      </div>

      <div className="p-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="GMV" value={formatUSD(d.gmvCents)} />
          <KpiCard label="Transactional Rev." value={formatUSD(d.transactionalRevenueCents)} />
          <KpiCard label="MRR" value={formatUSD(d.mrrCents)} accent />
          <KpiCard label="Blended Take Rate" value={`${(d.blendedTakeRateBps / 100).toFixed(1)}%`} accent />
          <KpiCard
            label="Monthly Revenue"
            value={ext.monthlyRevenueCents != null ? formatUSD(ext.monthlyRevenueCents) : "—"}
          />
          <KpiCard
            label="Annual (proj.)"
            value={ext.annualRevenueCents != null ? formatUSD(ext.annualRevenueCents) : "—"}
            accent
          />
        </div>

        {/* Revenue by stream — horizontal bar chart */}
        <div className="mt-6">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Revenue by stream
          </div>
          <div className="space-y-2">
            {streams.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm text-slate-600">{s.label}</span>
                <div className="relative flex-1 overflow-hidden rounded-full bg-slate-100" style={{ height: 18 }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max((s.cents / maxCents) * 100, s.cents > 0 ? 2 : 0)}%`,
                      background: s.color,
                    }}
                  />
                </div>
                <span className="w-24 text-right text-sm font-semibold text-slate-700">
                  {formatUSD(s.cents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? "border-[#203088]/20 bg-[#203088]/5" : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-bold ${accent ? "text-[#203088]" : "text-slate-800"}`}>
        {value}
      </div>
    </div>
  );
}

// ── Revenue levers + commodity grid ──────────────────────────────────────────
function Levers() {
  const [data, setData] = useState<RevenueConfigResponse | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setData(await api.get<RevenueConfigResponse>("/api/admin/revenue/config"));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load config");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (!data) return null;
  const c = data.config;

  async function saveConfig(patch: Record<string, number>) {
    setMsg(null);
    setSaving(true);
    try {
      await patchJson("/api/admin/revenue/config", patch);
      setMsg("✓ Saved — changes are live immediately.");
      void load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCommodity(type: string, patch: { enabled?: boolean; marginBps?: number }) {
    try {
      await patchJson(`/api/admin/commodities/${type}`, patch);
      void load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Update failed");
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="bg-[#203088] px-6 py-4">
        <h2 className="text-lg font-semibold text-white">Revenue Levers</h2>
        <p className="text-xs text-blue-200">All DB-backed — changes take effect immediately, no redeploy needed.</p>
      </div>

      <div className="p-6">
        {msg && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
            {msg}
          </div>
        )}
        {err && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
            {err}
          </div>
        )}

        {/* Fee levers grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <LeverCard
            label="Quick-pay fee"
            sublabel="% of transaction"
            value={c.quickPayFeeBps / 100}
            unit="%"
            onSave={(v) => saveConfig({ quickPayFeeBps: Math.round(v * 100) })}
            saving={saving}
          />
          <LeverCard
            label="Escrow / Assurance fee"
            sublabel="% on both sides"
            value={c.escrowFeeBps / 100}
            unit="%"
            onSave={(v) => saveConfig({ escrowFeeBps: Math.round(v * 100) })}
            saving={saving}
          />
          <LeverCard
            label="Load-board connection fee"
            sublabel="per load, USD"
            value={c.loadBoardConnectionFeeCents / 100}
            unit="$"
            prefix
            onSave={(v) => saveConfig({ loadBoardConnectionFeeCents: Math.round(v * 100) })}
            saving={saving}
          />
          <LeverCard
            label="Subscription PRO"
            sublabel="per month, USD"
            value={c.subProPriceCents / 100}
            unit="$"
            prefix
            onSave={(v) => saveConfig({ subProPriceCents: Math.round(v * 100) })}
            saving={saving}
          />
          <LeverCard
            label="Subscription FLEET"
            sublabel="per month, USD"
            value={c.subFleetPriceCents / 100}
            unit="$"
            prefix
            onSave={(v) => saveConfig({ subFleetPriceCents: Math.round(v * 100) })}
            saving={saving}
          />
          <LeverCard
            label="Subscription FREE"
            sublabel="per month, USD"
            value={c.subFreePriceCents / 100}
            unit="$"
            prefix
            onSave={(v) => saveConfig({ subFreePriceCents: Math.round(v * 100) })}
            saving={saving}
          />
        </div>

        {/* Commodity toggle grid */}
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-700">Commodity Feature Flags</div>
              <div className="text-xs text-slate-400">
                Toggle commodity types on/off and set per-commodity margin basis points
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.commodities.map((cm) => (
              <CommodityCard
                key={cm.type}
                commodity={cm}
                onToggle={(enabled) => toggleCommodity(cm.type, { enabled })}
                onMarginSave={(bps) => toggleCommodity(cm.type, { marginBps: bps })}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Lever card ────────────────────────────────────────────────────────────────
function LeverCard({
  label,
  sublabel,
  value,
  unit,
  prefix,
  onSave,
  saving,
}: {
  label: string;
  sublabel: string;
  value: number;
  unit: string;
  prefix?: boolean;
  onSave: (v: number) => void;
  saving: boolean;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="text-sm font-semibold text-slate-700">{label}</div>
      <div className="text-xs text-slate-400">{sublabel}</div>
      <div className="mt-3 flex items-center gap-2">
        {prefix && <span className="text-slate-500">{unit}</span>}
        <input
          className={`${input} flex-1`}
          value={v}
          onChange={(e) => setV(e.target.value)}
          type="number"
          step="0.01"
          min="0"
        />
        {!prefix && <span className="text-slate-500">{unit}</span>}
        <button
          onClick={() => onSave(Number(v))}
          disabled={saving}
          className={btnDanger}
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Commodity toggle card ─────────────────────────────────────────────────────
function CommodityCard({
  commodity,
  onToggle,
  onMarginSave,
}: {
  commodity: { type: string; label: string; enabled: boolean; marginBps: number };
  onToggle: (enabled: boolean) => void;
  onMarginSave: (bps: number) => void;
}) {
  const [marginPct, setMarginPct] = useState(String(commodity.marginBps / 100));
  useEffect(() => setMarginPct(String(commodity.marginBps / 100)), [commodity.marginBps]);

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        commodity.enabled ? "border-[#203088]/30 bg-[#203088]/5" : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-700">{commodity.label}</div>
          <div className="text-xs text-slate-400">{commodity.type}</div>
        </div>
        {/* Toggle switch */}
        <button
          onClick={() => onToggle(!commodity.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            commodity.enabled ? "bg-[#203088]" : "bg-slate-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              commodity.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          className={`${input} w-20`}
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={marginPct}
          onChange={(e) => setMarginPct(e.target.value)}
        />
        <span className="text-sm text-slate-500">% margin</span>
        <button
          onClick={() => onMarginSave(Math.round(Number(marginPct) * 100))}
          className={`${btnPrimary} ml-auto py-1 text-xs`}
        >
          Save
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span
          className={`${badge} ${
            commodity.enabled
              ? "bg-green-100 text-green-700"
              : "bg-slate-200 text-slate-500"
          }`}
        >
          {commodity.enabled ? "ON" : "OFF"}
        </span>
        {commodity.type === "LIVE_ANIMALS" && !commodity.enabled && (
          <span className={`${badge} bg-amber-100 text-amber-700`}>Requires ops approval</span>
        )}
      </div>
    </div>
  );
}

// PATCH helper (the shared api client exposes get/post; PATCH inline here).
async function patchJson(path: string, body: unknown): Promise<void> {
  const token = localStorage.getItem("navastar.token");
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new ApiError(res.status, t || res.statusText);
  }
}
