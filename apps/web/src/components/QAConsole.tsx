// Module 5 — QA console. Review queue → for each driver-approved inspection, QA
// sees the AI findings (with who logged each), the verified hash-chained custody
// chain, and the POD/photos, then Pass/Fix/Fail. Decisions feed reliability scores.
import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  type QaQueue,
  type QaQueueItem,
  type QaDetail,
  type QaReliabilityRow,
} from "../api.js";
import { StubBadge } from "./StubBadge.js";

const primary = "rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

export function QAConsole() {
  const [view, setView] = useState<"queue" | "reliability">("queue");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setView("queue")} className={view === "queue" ? `${primary} bg-navy-600` : secondary}>
          Review queue
        </button>
        <button onClick={() => setView("reliability")} className={view === "reliability" ? `${primary} bg-navy-600` : secondary}>
          Reliability
        </button>
      </div>
      {view === "queue" ? <QueueView /> : <ReliabilityView />}
    </div>
  );
}

function QueueView() {
  const [data, setData] = useState<QaQueue | null>(null);
  const [selected, setSelected] = useState<QaQueueItem | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      setData(await api.get<QaQueue>("/api/qa/queue"));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load queue");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (selected) {
    return (
      <ReviewDetail
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
        <h2 className="text-lg font-semibold">QA review queue</h2>
        {data && (
          <div className="flex gap-2 text-xs">
            <Pill className="bg-slate-100 text-slate-600">pending {data.counts.pending}</Pill>
            <Pill className="bg-green-100 text-green-700">pass {data.counts.pass}</Pill>
            <Pill className="bg-amber-100 text-amber-700">fix {data.counts.fix}</Pill>
            <Pill className="bg-red-100 text-red-700">fail {data.counts.fail}</Pill>
          </div>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {data && data.queue.length === 0 && <p className="mt-4 text-sm text-slate-400">Queue is clear. Nothing to verify.</p>}
      <ul className="mt-4 space-y-2">
        {data?.queue.map((i) => (
          <li key={i.inspectionId}>
            <button
              onClick={() => setSelected(i)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"
            >
              <div>
                <div className="font-medium">{i.trackingId}</div>
                <div className="text-sm text-slate-500">
                  {i.type} inspection · {i.findingsCount} finding(s) · score {i.conditionScore ?? "—"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {i.needsHumanReview && <Pill className="bg-amber-100 text-amber-800">⚑ low conf</Pill>}
                {i.aiConfidence != null && <span className="text-xs text-slate-400">AI {Math.round(i.aiConfidence * 100)}%</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewDetail({ item, onDone }: { item: QaQueueItem; onDone: () => void }) {
  const [detail, setDetail] = useState<QaDetail | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<QaDetail>(`/api/qa/inspections/${item.inspectionId}`).then(setDetail, (e) =>
      setErr(e instanceof ApiError ? e.message : "Failed to load")
    );
  }, [item.inspectionId]);

  async function decide(status: "pass" | "fix" | "fail") {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/qa/inspections/${item.inspectionId}/decision`, { status, note: note || undefined });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Decision failed");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <button onClick={onDone} className="text-sm text-navy-600 hover:underline">
        ← Back to queue
      </button>
      <h2 className="mt-2 text-lg font-semibold">
        {item.trackingId} · {item.type} inspection
      </h2>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {!detail ? (
        <p className="mt-4 text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="mt-4 space-y-5">
          {/* AI envelope + custody integrity */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {detail.ai && (
              <>
                <Pill className="bg-slate-100 text-slate-600">
                  AI {detail.ai.model}@{detail.ai.version}
                </Pill>
                <StubBadge model={detail.ai.model} version={detail.ai.version} />
                <Pill className={detail.ai.confidence >= 0.75 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
                  {Math.round(detail.ai.confidence * 100)}% confidence
                </Pill>
                <Pill className={detail.ai.approvedByUserId ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}>
                  {detail.ai.approvedByUserId ? "driver-approved" : "unapproved"}
                </Pill>
              </>
            )}
            <Pill className={detail.custody.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
              custody chain {detail.custody.ok ? "verified ✓" : `BROKEN @${detail.custody.brokenAtSequence}`}
            </Pill>
          </div>

          {/* Findings */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Findings ({detail.findings.length}) · score {detail.inspection.conditionScore ?? "—"}
            </div>
            {detail.findings.length === 0 ? (
              <p className="text-sm text-slate-400">No damage recorded.</p>
            ) : (
              <ul className="space-y-1">
                {detail.findings.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-24 text-slate-500">{f.panel ?? "—"}</span>
                    <span className="font-medium">{f.kind}</span>
                    <SeverityPill severity={f.severity} />
                    <Pill className={f.source === "ai" ? "bg-slate-100 text-slate-500" : "bg-navy-50 text-navy-600"}>
                      {f.source === "ai" ? "AI" : "driver"}
                    </Pill>
                    {f.note && <span className="text-slate-400">{f.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* POD / photos */}
          {detail.documents.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">POD & photos</div>
              <div className="flex flex-wrap gap-2">
                {detail.documents.map((d) => (
                  <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className={secondary}>
                    {d.type} ↗
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Custody timeline */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Custody timeline ({detail.custody.length})
            </div>
            <ol className="space-y-1">
              {detail.custody.events.map((e) => (
                <li key={e.sequence} className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-navy-600 text-[10px] text-white">{e.sequence}</span>
                  <span className="font-medium text-slate-700">{e.type}</span>
                  <span className="ml-auto font-mono text-[10px] text-slate-300">{e.hash.slice(0, 12)}…</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Decision */}
          <div className="border-t border-slate-100 pt-4">
            <input
              className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="QA note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => decide("pass")} className={`${primary} bg-green-600 hover:bg-green-700`}>
                ✓ Pass
              </button>
              <button disabled={busy} onClick={() => decide("fix")} className={`${primary} bg-amber-500 hover:bg-amber-600`}>
                ⚠ Fix
              </button>
              <button disabled={busy} onClick={() => decide("fail")} className={`${primary} bg-red-600 hover:bg-red-700`}>
                ✕ Fail
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ReliabilityView() {
  const [rows, setRows] = useState<QaReliabilityRow[]>([]);
  useEffect(() => {
    api.get<{ drivers: QaReliabilityRow[] }>("/api/qa/reliability").then(
      (r) => setRows(r.drivers),
      () => setRows([])
    );
  }, []);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Reliability scores</h2>
      <p className="mt-1 text-sm text-slate-500">Trust scores move with QA outcomes (Pass ↑, Fix ↓, Fail ↓↓).</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="py-2">Driver</th>
              <th>Type</th>
              <th>Carrier</th>
              <th className="text-right">Reviewed</th>
              <th className="text-right">Pass rate</th>
              <th className="text-right">Trust</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">{d.name}</td>
                <td className="text-slate-500">{d.type}</td>
                <td className="text-slate-500">{d.carrier}</td>
                <td className="text-right">{d.reviewed}</td>
                <td className="text-right">{d.passRate != null ? `${d.passRate}%` : "—"}</td>
                <td className="text-right">
                  <TrustBar score={d.trustScore} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No drivers.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TrustBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-green-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
        <span className={`block h-full ${color}`} style={{ width: `${score}%` }} />
      </span>
      <span className="w-7 text-right font-medium">{score}</span>
    </span>
  );
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 font-medium ${className}`}>{children}</span>;
}

function SeverityPill({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    INFO: "bg-slate-100 text-slate-500",
    MINOR: "bg-yellow-100 text-yellow-700",
    MODERATE: "bg-amber-100 text-amber-700",
    MAJOR: "bg-orange-100 text-orange-700",
    CRITICAL: "bg-red-100 text-red-700",
  };
  return <Pill className={map[severity] ?? "bg-slate-100 text-slate-500"}>{severity}</Pill>;
}
