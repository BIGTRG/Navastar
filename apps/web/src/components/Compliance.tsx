// Module 11 — Compliance & custody. Look up a shipment, run the commodity rules
// engine, and verify the hash-chained custody log (tamper-evidence + export).
import { useState } from "react";
import { api, ApiError } from "../api.js";

const input = "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy-600";
const primary = "rounded-lg bg-navy-600 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50";

interface CheckResult {
  trackingId: string;
  commodity: string;
  ok: boolean;
  violations: Array<{ rule: string; severity: "error" | "warning" | "info"; message: string }>;
}
interface Integrity {
  trackingId: string;
  ok: boolean;
  length: number;
  brokenAtSequence?: number | null;
}

export function Compliance() {
  const [id, setId] = useState("");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setErr(null);
    setCheck(null);
    setIntegrity(null);
    try {
      const key = encodeURIComponent(id.trim());
      const [c, v] = await Promise.all([
        api.get<CheckResult>(`/api/compliance/shipments/${key}/check`),
        api.get<Integrity>(`/api/custody/shipments/${key}/verify`),
      ]);
      setCheck(c);
      setIntegrity(v);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Check failed");
    } finally {
      setBusy(false);
    }
  }

  const sevColor: Record<string, string> = {
    error: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-slate-100 text-slate-600",
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Compliance & custody</h2>
      <p className="mt-1 text-sm text-slate-500">Commodity rules engine + append-only hash-chained custody verification.</p>
      <div className="mt-4 flex gap-2">
        <input className={`${input} w-56`} placeholder="tracking id" value={id} onChange={(e) => setId(e.target.value)} />
        <button onClick={run} disabled={busy || !id.trim()} className={primary}>
          {busy ? "Checking…" : "Run compliance check"}
        </button>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {check && (
        <div className="mt-5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{check.trackingId}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{check.commodity}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${check.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {check.ok ? "clears to ship" : "blocked"}
            </span>
          </div>
          {check.violations.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No rule findings.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {check.violations.map((v, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sevColor[v.severity]}`}>{v.severity}</span>
                  <span className="text-slate-400">{v.rule}</span>
                  <span className="text-slate-700">{v.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {integrity && (
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <span className="font-medium">Custody chain:</span>{" "}
          {integrity.ok ? (
            <span className="text-green-700">verified ✓ ({integrity.length} events, tamper-free)</span>
          ) : (
            <span className="text-red-700">BROKEN at sequence {integrity.brokenAtSequence}</span>
          )}
          <a
            href={`/api/custody/shipments/${encodeURIComponent(id.trim())}/export`}
            target="_blank"
            rel="noreferrer"
            className="ml-3 text-navy-600 hover:underline"
          >
            export evidence ↗
          </a>
        </div>
      )}
    </section>
  );
}
