// Module 12 — Trust & Risk. Carrier-monitoring (separate from GPS): FMCSA
// authority, insurance validity + lapse alerts, safety/trust/risk scores, with a
// refresh that re-pulls FMCSA + the fraud model. Plus the claims desk.
import { useEffect, useState } from "react";
import { api, ApiError, formatUSD, type MonitoringCarrier, type ClaimRow } from "../api.js";

const primary = "rounded-lg bg-navy-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

export function Monitoring({ canManageClaims }: { canManageClaims: boolean }) {
  return (
    <div className="space-y-6">
      <CarrierMonitoring />
      {canManageClaims && <Claims />}
    </div>
  );
}

function scoreColor(n: number | null, invert = false): string {
  if (n == null) return "text-slate-400";
  const good = invert ? n < 40 : n >= 70;
  const bad = invert ? n >= 60 : n < 50;
  return good ? "text-green-600" : bad ? "text-red-600" : "text-amber-600";
}

function CarrierMonitoring() {
  const [rows, setRows] = useState<MonitoringCarrier[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const res = await api.get<{ carriers: MonitoringCarrier[] }>("/api/monitoring/carriers");
      setRows(res.carriers);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function refresh(id: string) {
    setBusy(id);
    try {
      await api.post(`/api/monitoring/carriers/${id}/refresh`);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Refresh failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Carrier monitoring</h2>
      <p className="mt-1 text-sm text-slate-500">Separate from GPS — authority, insurance, safety, and fraud/double-broker risk.</p>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-4 space-y-3">
        {rows.map((c) => (
          <div key={c.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="font-medium">{c.legalName}</div>
              <span className="text-xs text-slate-400">DOT {c.dotNumber ?? "—"}</span>
              <Badge ok={c.authorityActive} label={c.authorityActive ? "authority active" : "authority inactive"} />
              <Badge ok={c.insuranceValid} label={c.insuranceValid ? "insured" : "no valid insurance"} />
              <span className={`text-xs ${scoreColor(c.safetyScore)}`}>safety {c.safetyScore ?? "—"}</span>
              <span className={`text-xs ${scoreColor(c.trustScore)}`}>trust {c.trustScore}</span>
              <span className={`text-xs ${scoreColor(c.riskScore, true)}`}>risk {c.riskScore ?? "—"}</span>
              <button onClick={() => refresh(c.id)} disabled={busy === c.id} className={`${secondary} ml-auto`}>
                {busy === c.id ? "…" : "Refresh"}
              </button>
            </div>
            {c.alerts.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {c.alerts.map((a, i) => (
                  <li key={i} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                    ⚠ {a}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-400">No active carriers.</p>}
      </div>
    </section>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{label}</span>;
}

const STATUSES = ["OPEN", "INVESTIGATING", "APPROVED", "DENIED", "PAID", "CLOSED"];

function Claims() {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ shipmentId: "", amount: "", description: "" });

  async function load() {
    try {
      const res = await api.get<{ claims: ClaimRow[] }>("/api/claims");
      setClaims(res.claims);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load claims");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function file() {
    setErr(null);
    try {
      await api.post("/api/claims", {
        shipmentId: form.shipmentId,
        amountCents: form.amount ? Math.round(Number(form.amount) * 100) : undefined,
        description: form.description,
      });
      setForm({ shipmentId: "", amount: "", description: "" });
      void load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "File claim failed");
    }
  }
  async function setStatus(id: string, status: string) {
    await api.post(`/api/claims/${id}/status`, { status });
    void load();
  }

  const input = "rounded-md border border-slate-300 px-3 py-2 text-sm";
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Claims</h2>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input className={`${input} w-40`} placeholder="tracking id" value={form.shipmentId} onChange={(e) => setForm({ ...form, shipmentId: e.target.value })} />
        <input className={`${input} w-28`} placeholder="amount $" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input className={`${input} flex-1`} placeholder="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button onClick={file} disabled={!form.shipmentId || !form.description} className={primary}>
          File claim
        </button>
      </div>
      <ul className="mt-4 space-y-2">
        {claims.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
            <span className="font-medium">{c.trackingId ?? "—"}</span>
            <span className="text-slate-500">{c.description}</span>
            {c.amountCents != null && <span className="text-slate-500">{formatUSD(c.amountCents)}</span>}
            <select className="ml-auto rounded-md border border-slate-300 px-2 py-1 text-xs" value={c.status} onChange={(e) => setStatus(c.id, e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </li>
        ))}
        {claims.length === 0 && <li className="text-sm text-slate-400">No claims.</li>}
      </ul>
    </section>
  );
}
