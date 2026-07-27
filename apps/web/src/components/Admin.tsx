// Module 13 — Revenue & Monetization admin backboard. Live dashboard + control
// panel for all six revenue streams (DB-backed, no redeploy) + commodity toggles.
import { useEffect, useState } from "react";
import { api, ApiError, formatUSD, type RevenueConfigResponse, type RevenueDashboard } from "../api.js";

const input = "w-28 rounded-md border border-slate-300 px-2 py-1 text-sm";
const primary = "rounded-lg bg-navy-600 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50";

export function Admin() {
  return (
    <div className="space-y-6">
      <Dashboard />
      <Levers />
    </div>
  );
}

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
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!d) return <p className="text-sm text-slate-400">Loading revenue…</p>;

  const streams: Array<[string, number]> = [
    ["Margin", d.streams.margin],
    ["Subscriptions (MRR)", d.streams.subscriptionMrr],
    ["Quick-pay fees", d.streams.quickPayFees],
    ["Connection fees", d.streams.loadBoardConnectionFees],
    ["Escrow/assurance", d.streams.escrowAssuranceFees],
    ["Value-add", d.streams.valueAdd],
  ];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Revenue dashboard</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="GMV" value={formatUSD(d.gmvCents)} />
        <Kpi label="Transactional revenue" value={formatUSD(d.transactionalRevenueCents)} />
        <Kpi label="MRR" value={formatUSD(d.mrrCents)} />
        <Kpi label="Blended take rate" value={`${(d.blendedTakeRateBps / 100).toFixed(1)}%`} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        {streams.map(([label, cents]) => (
          <div key={label} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-semibold text-navy-700">{formatUSD(cents)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-navy-700">{value}</div>
    </div>
  );
}

function Levers() {
  const [data, setData] = useState<RevenueConfigResponse | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
    try {
      await patchJson("/api/admin/revenue/config", patch);
      setMsg("Saved.");
      void load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Save failed");
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
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Revenue levers</h2>
      <p className="mt-1 text-sm text-slate-500">All DB-backed — changes take effect immediately, no redeploy.</p>
      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      {/* Fees */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <LeverField label="Quick-pay fee (%)" value={c.quickPayFeeBps / 100} onSave={(v) => saveConfig({ quickPayFeeBps: Math.round(v * 100) })} />
        <LeverField label="Escrow/assurance fee (%)" value={c.escrowFeeBps / 100} onSave={(v) => saveConfig({ escrowFeeBps: Math.round(v * 100) })} />
        <LeverField label="Load-board connection fee ($)" value={c.loadBoardConnectionFeeCents / 100} onSave={(v) => saveConfig({ loadBoardConnectionFeeCents: Math.round(v * 100) })} />
        <LeverField label="Subscription PRO ($/mo)" value={c.subProPriceCents / 100} onSave={(v) => saveConfig({ subProPriceCents: Math.round(v * 100) })} />
        <LeverField label="Subscription FLEET ($/mo)" value={c.subFleetPriceCents / 100} onSave={(v) => saveConfig({ subFleetPriceCents: Math.round(v * 100) })} />
      </div>

      {/* Commodities */}
      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Commodities — margin % + on/off</div>
        <div className="space-y-2">
          {data.commodities.map((cm) => (
            <div key={cm.type} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 text-sm">
              <span className="w-40 font-medium">{cm.label}</span>
              <LeverField
                small
                label="margin %"
                value={cm.marginBps / 100}
                onSave={(v) => toggleCommodity(cm.type, { marginBps: Math.round(v * 100) })}
              />
              <label className="ml-auto flex items-center gap-2">
                <input type="checkbox" checked={cm.enabled} onChange={(e) => toggleCommodity(cm.type, { enabled: e.target.checked })} />
                <span className={cm.enabled ? "text-green-700" : "text-slate-400"}>{cm.enabled ? "ON" : "OFF"}</span>
              </label>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LeverField({ label, value, onSave, small }: { label: string; value: number; onSave: (v: number) => void; small?: boolean }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <div className={small ? "flex items-center gap-2" : "flex items-center justify-between gap-2"}>
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <input className={input} value={v} onChange={(e) => setV(e.target.value)} />
        <button onClick={() => onSave(Number(v))} className={primary}>
          Save
        </button>
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
