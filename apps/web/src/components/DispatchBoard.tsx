// Module 6 — Dispatch board. Queue of shipments needing a driver → run the
// matching engine → see ranked candidates with their capability/proximity/
// economics/trust factors → auto-assign the best or assign a specific driver.
import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  formatUSD,
  type DispatchQueueItem,
  type MatchResponse,
  type MatchCandidate,
} from "../api.js";

const primary = "rounded-lg bg-navy-600 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

export function DispatchBoard() {
  const [queue, setQueue] = useState<DispatchQueueItem[]>([]);
  const [selected, setSelected] = useState<DispatchQueueItem | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const res = await api.get<{ queue: DispatchQueueItem[] }>("/api/dispatch/queue");
      setQueue(res.queue);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load queue");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (selected) {
    return (
      <MatchView
        item={selected}
        onDone={() => {
          setSelected(null);
          void load();
        }}
      />
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Dispatch queue</h2>
        <button onClick={load} className={secondary}>
          Refresh
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {queue.length === 0 && <p className="mt-4 text-sm text-slate-400">No shipments awaiting assignment. Book one first.</p>}
      <ul className="mt-4 space-y-2">
        {queue.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => setSelected(s)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"
            >
              <div>
                <div className="font-medium">{s.cargo ?? s.commodityType}</div>
                <div className="text-sm text-slate-500">
                  {s.trackingId} · {s.origin ?? "—"} → {s.dest ?? "—"}
                </div>
              </div>
              <span className="text-navy-600">Match →</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MatchView({ item, onDone }: { item: DispatchQueueItem; onDone: () => void }) {
  const [match, setMatch] = useState<MatchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runMatch() {
    setBusy(true);
    setErr(null);
    try {
      setMatch(await api.post<MatchResponse>(`/api/dispatch/shipments/${item.id}/match`));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Match failed");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void runMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function assign(driverId?: string) {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/dispatch/shipments/${item.id}/assign`, driverId ? { driverId, mode: "manual" } : { mode: "auto" });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Assign failed");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <button onClick={onDone} className="text-sm text-navy-600 hover:underline">
        ← Back to queue
      </button>
      <div className="mt-2 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{item.cargo ?? item.commodityType}</h2>
          <p className="text-sm text-slate-500">
            {item.trackingId} · {item.origin} → {item.dest}
          </p>
        </div>
        {match && (
          <div className="text-right text-sm">
            <div className="text-slate-400">Driver payout</div>
            <div className="font-semibold text-navy-700">{match.payoutCents != null ? formatUSD(match.payoutCents) : "—"}</div>
          </div>
        )}
      </div>

      {match && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">engine {match.ai.model}</span>
          <span
            className={`rounded-full px-2 py-0.5 ${match.ai.confidence >= 0.75 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
          >
            {Math.round(match.ai.confidence * 100)}% confidence
          </span>
          {match.ai.needsHumanReview && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">⚑ close call — dispatcher decides</span>
          )}
          <button onClick={() => assign()} disabled={busy} className={`${primary} ml-auto`}>
            ⚡ Auto-assign best
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {busy && !match && <p className="mt-4 text-sm text-slate-400">Matching…</p>}

      <div className="mt-4 space-y-2">
        {match?.candidates.map((c, i) => (
          <CandidateRow key={c.driverId} c={c} rank={i + 1} onAssign={() => assign(c.driverId)} disabled={busy} />
        ))}
      </div>
    </section>
  );
}

function CandidateRow({ c, rank, onAssign, disabled }: { c: MatchCandidate; rank: number; onAssign: () => void; disabled: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${c.eligible ? "border-slate-200" : "border-slate-100 bg-slate-50 opacity-70"}`}>
      <div className="flex items-center gap-3">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{rank}</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.kind === "fleet" ? "#2563eb" : "#dc2626" }} />
        <div className="min-w-0">
          <div className="truncate font-medium">
            {c.name} <span className="text-xs font-normal text-slate-400">· {c.carrier ?? "Navastar Fleet"}</span>
          </div>
          <div className="text-xs text-slate-400">{c.reason}</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm font-semibold text-navy-700">{(c.score * 100).toFixed(0)}</span>
          {c.eligible ? (
            <button onClick={onAssign} disabled={disabled} className="rounded-lg bg-navy-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-50">
              Assign
            </button>
          ) : (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">ineligible</span>
          )}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        <FactorBar label="capability" v={c.factors.capability} />
        <FactorBar label="proximity" v={c.factors.proximity} />
        <FactorBar label="economics" v={c.factors.economics} />
        <FactorBar label="trust" v={c.factors.trust} />
      </div>
    </div>
  );
}

function FactorBar({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[10px] uppercase tracking-wide text-slate-400">
        <span>{label}</span>
        <span>{Math.round(v * 100)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-navy-600" style={{ width: `${Math.round(v * 100)}%` }} />
      </div>
    </div>
  );
}
