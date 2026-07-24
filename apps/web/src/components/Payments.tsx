// Module 9 — Payments UI. Drivers/carriers see ONLY their own payouts (net of any
// quick-pay fee) and can opt a pending payout into instant pay. Admin runs the
// free weekly settlement.
import { useEffect, useState } from "react";
import { api, ApiError, formatUSD, type PayoutRow } from "../api.js";

const primary = "rounded-lg bg-navy-600 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

export function Payments({ canViewOwn, canSettle }: { canViewOwn: boolean; canSettle: boolean }) {
  return (
    <div className="space-y-6">
      {canSettle && <SettlementPanel />}
      {canViewOwn && <MyPayouts />}
    </div>
  );
}

function SettlementPanel() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function settle() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ settled: number }>("/api/payments/settle-weekly");
      setMsg(`Weekly settlement complete — ${res.settled} payout(s) settled (free).`);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Settlement failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Weekly settlement</h2>
      <p className="mt-1 text-sm text-slate-500">Standard payouts settle weekly at no cost. Quick-pay is the paid, instant alternative.</p>
      <button onClick={settle} disabled={busy} className={`${primary} mt-3`}>
        {busy ? "Settling…" : "Run free weekly settlement"}
      </button>
      {msg && <p className="mt-3 text-sm text-green-700">{msg}</p>}
    </section>
  );
}

function MyPayouts() {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const res = await api.get<{ payouts: PayoutRow[] }>("/api/payments/my-payouts");
      setRows(res.payouts);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load payouts");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function quickpay(id: string) {
    setBusy(id);
    setErr(null);
    try {
      await api.post(`/api/payments/${id}/quickpay`);
      void load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Quick-pay failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">My payouts</h2>
        <button onClick={load} className={secondary}>
          Refresh
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-500">You only ever see your own pay — never Navastar's margin.</p>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="py-2">Shipment</th>
              <th className="text-right">Gross</th>
              <th className="text-right">Fee</th>
              <th className="text-right">Net</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">{p.trackingId ?? "—"}</td>
                <td className="text-right">{formatUSD(p.grossCents)}</td>
                <td className="text-right text-red-600">{p.feeCents ? `−${formatUSD(p.feeCents)}` : "—"}</td>
                <td className="text-right font-semibold">{formatUSD(p.netCents)}</td>
                <td>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {p.status}
                    {p.quickPay ? " · quick-pay" : ""}
                  </span>
                </td>
                <td className="text-right">
                  {p.status === "PENDING" && (
                    <button onClick={() => quickpay(p.id)} disabled={busy === p.id} className={primary}>
                      {busy === p.id ? "…" : "⚡ Quick-pay"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No payouts yet. Deliver a load to earn one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
