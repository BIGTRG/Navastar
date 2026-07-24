// Module 3 — Driver app UI. Job list → guided pickup (AI walk-around inspection on
// an editable vehicle diagram, VIN/odometer OCR, complete pickup) → delivery
// (signature pad + photo POD). Media uploads go straight to MinIO/S3 via presign.
import { useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  uploadMedia,
  type DriverJob,
  type Finding,
  type InspectionResponse,
} from "../api.js";

const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy-600";
const primary = "rounded-lg bg-navy-600 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

export function DriverApp() {
  const [jobs, setJobs] = useState<DriverJob[] | null>(null);
  const [active, setActive] = useState<DriverJob | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadJobs() {
    setErr(null);
    try {
      const res = await api.get<{ jobs: DriverJob[] }>("/api/driver/jobs");
      setJobs(res.jobs);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load jobs");
    }
  }
  useEffect(() => {
    void loadJobs();
  }, []);

  if (active) {
    return (
      <JobDetail
        job={active}
        onBack={() => {
          setActive(null);
          void loadJobs();
        }}
      />
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">My jobs</h2>
        <button onClick={loadJobs} className={secondary}>
          Refresh
        </button>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {jobs && jobs.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No active jobs. Book one in the “Deliver with Navastar” flow first.</p>
      )}
      <ul className="mt-4 space-y-2">
        {jobs?.map((j) => (
          <li key={j.id ?? j.trackingId}>
            <button
              onClick={() => setActive(j)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"
            >
              <div>
                <div className="font-medium">{j.cargo[0]?.description ?? "Shipment"}</div>
                <div className="text-sm text-slate-500">
                  {j.trackingId} · {j.pickup?.city ?? "—"} → {j.dropoff?.city ?? "—"}
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{j.status}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function JobDetail({ job, onBack }: { job: DriverJob; onBack: () => void }) {
  const shipmentId = job.id ?? job.trackingId;
  const [status, setStatus] = useState(job.status);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <button onClick={onBack} className="text-sm text-navy-600 hover:underline">
        ← Back to jobs
      </button>
      <div className="mt-2 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{job.cargo[0]?.description ?? "Shipment"}</h2>
          <p className="text-sm text-slate-500">
            {job.trackingId} · {job.pickup?.name ?? job.pickup?.city} → {job.dropoff?.city}
          </p>
        </div>
        <span className="rounded-full bg-navy-600 px-3 py-1 text-sm font-medium text-white">{status}</span>
      </div>

      {msg && <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p>}
      {err && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

      <PickupSection shipmentId={shipmentId} cargoDesc={job.cargo[0]?.description} onStatus={setStatus} onErr={setErr} onMsg={setMsg} />
      <DeliverySection shipmentId={shipmentId} onStatus={setStatus} onErr={setErr} onMsg={setMsg} />
    </section>
  );
}

// ── Guided pickup: AI walk-around + VIN/odometer + complete ──
function PickupSection({
  shipmentId,
  onStatus,
  onErr,
  onMsg,
}: {
  shipmentId: string;
  cargoDesc?: string;
  onStatus: (s: string) => void;
  onErr: (s: string | null) => void;
  onMsg: (s: string | null) => void;
}) {
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [inspection, setInspection] = useState<InspectionResponse | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [score, setScore] = useState<number>(100);
  const [vin, setVin] = useState("");
  const [odometer, setOdometer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    onErr(null);
    setBusy("upload");
    try {
      const keys: string[] = [];
      for (const f of Array.from(files)) {
        keys.push(await uploadMedia(shipmentId, "INSPECTION_PHOTO", f, f.name));
      }
      setPhotoKeys((prev) => [...prev, ...keys]);
    } catch (e) {
      onErr(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function runWalkaround() {
    onErr(null);
    setBusy("inspect");
    try {
      const res = await api.post<InspectionResponse>(`/api/shipments/${shipmentId}/inspections`, {
        type: "PICKUP",
        imageKeys: photoKeys,
      });
      setInspection(res);
      setFindings(res.findings.map((f) => ({ ...f })));
      setScore(res.conditionScore ?? 100);
    } catch (e) {
      onErr(e instanceof ApiError ? e.message : "Inspection failed");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!inspection) return;
    setBusy("approve");
    onErr(null);
    try {
      await api.post(`/api/inspections/${inspection.inspectionId}/approve`, {
        conditionScore: score,
        findings: findings.map((f) => ({ panel: f.panel, kind: f.kind, severity: f.severity, note: f.note, source: f.source })),
      });
      onMsg("Inspection approved. Findings recorded for QA.");
    } catch (e) {
      onErr(e instanceof ApiError ? e.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  }

  async function runOcr(kind: "VIN" | "ODOMETER") {
    setBusy(kind);
    onErr(null);
    try {
      const key = photoKeys[0] ?? `demo/${kind.toLowerCase()}.jpg`;
      const res = await api.post<{ fields: Record<string, string | number> }>(`/api/shipments/${shipmentId}/ocr`, { imageKey: key, kind });
      if (kind === "VIN" && res.fields.vin != null) setVin(String(res.fields.vin));
      if (kind === "ODOMETER" && res.fields.odometer != null) setOdometer(String(res.fields.odometer));
    } catch (e) {
      onErr(e instanceof ApiError ? e.message : "OCR failed");
    } finally {
      setBusy(null);
    }
  }

  async function completePickup() {
    setBusy("pickup");
    onErr(null);
    try {
      // Save VIN/odometer confirmation onto the first cargo item, if available.
      const view = await api.get<{ cargo: unknown[] }>(`/api/shipments/${shipmentId}`);
      void view;
      const res = await api.post<{ status: string }>(`/api/shipments/${shipmentId}/pickup`, {});
      onStatus(res.status);
      onMsg("Pickup complete — vehicle picked up.");
    } catch (e) {
      onErr(e instanceof ApiError ? e.message : "Complete pickup failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <h3 className="font-semibold">1 · Guided pickup</h3>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-sm font-medium text-slate-600">Walk-around photos</div>
          <input type="file" accept="image/*" multiple onChange={(e) => onUpload(e.target.files)} className="text-sm" />
          <div className="mt-1 text-xs text-slate-400">{photoKeys.length} uploaded to storage</div>
          <button onClick={runWalkaround} disabled={busy === "inspect"} className={`${primary} mt-2`}>
            {busy === "inspect" ? "Analyzing…" : "Run AI walk-around"}
          </button>
        </div>

        {inspection && (
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-600">
              Condition score
              <span className="rounded bg-slate-100 px-2 py-0.5">{score}/100</span>
              {inspection.ai.needsHumanReview && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">⚑ human review</span>
              )}
              <span className="text-xs text-slate-400">AI {Math.round(inspection.ai.confidence * 100)}%</span>
            </div>
            <input type="range" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} className="w-full" />
          </div>
        )}
      </div>

      {inspection && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <VehicleDiagram findings={findings} onAddPanel={(panel) => setFindings((f) => [...f, { panel, kind: "scratch", severity: "MINOR", source: "human" }])} />
          <FindingsEditor findings={findings} setFindings={setFindings} />
        </div>
      )}
      {inspection && (
        <button onClick={approve} disabled={busy === "approve"} className={`${primary} mt-3`}>
          {busy === "approve" ? "Saving…" : "Approve findings"}
        </button>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-sm font-medium text-slate-600">VIN</div>
          <div className="flex gap-2">
            <input className={input} value={vin} onChange={(e) => setVin(e.target.value)} placeholder="auto-read or type" />
            <button onClick={() => runOcr("VIN")} disabled={busy === "VIN"} className={secondary}>
              {busy === "VIN" ? "…" : "Auto-read"}
            </button>
          </div>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-600">Odometer</div>
          <div className="flex gap-2">
            <input className={input} value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="auto-read or type" />
            <button onClick={() => runOcr("ODOMETER")} disabled={busy === "ODOMETER"} className={secondary}>
              {busy === "ODOMETER" ? "…" : "Auto-read"}
            </button>
          </div>
        </div>
      </div>

      <button onClick={completePickup} disabled={busy === "pickup"} className={`${primary} mt-4`}>
        {busy === "pickup" ? "…" : "Complete pickup →"}
      </button>
    </div>
  );
}

// ── Delivery: signature pad + photo POD ──
function DeliverySection({
  shipmentId,
  onStatus,
  onErr,
  onMsg,
}: {
  shipmentId: string;
  onStatus: (s: string) => void;
  onErr: (s: string | null) => void;
  onMsg: (s: string | null) => void;
}) {
  const [signerName, setSignerName] = useState("");
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload");
    onErr(null);
    try {
      const keys: string[] = [];
      for (const f of Array.from(files)) keys.push(await uploadMedia(shipmentId, "POD", f, f.name));
      setPhotoKeys((p) => [...p, ...keys]);
    } catch (e) {
      onErr(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function submitPod() {
    if (!signerName.trim()) {
      onErr("Signer name is required.");
      return;
    }
    setBusy("pod");
    onErr(null);
    try {
      let signatureKey: string | undefined;
      const blob = await padRef.current?.toBlob();
      if (blob) signatureKey = await uploadMedia(shipmentId, "SIGNATURE", blob, "signature.png");
      const res = await api.post<{ status: string }>(`/api/shipments/${shipmentId}/pod`, {
        signerName,
        signatureKey,
        photoKeys,
      });
      onStatus(res.status);
      onMsg("Delivered ✓ — POD captured, custody chain closed.");
    } catch (e) {
      onErr(e instanceof ApiError ? e.message : "POD failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <h3 className="font-semibold">2 · Delivery — proof of delivery</h3>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-sm font-medium text-slate-600">Recipient name</div>
          <input className={input} value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Who signed?" />
          <div className="mb-1 mt-3 text-sm font-medium text-slate-600">Delivery photos</div>
          <input type="file" accept="image/*" multiple onChange={(e) => onUpload(e.target.files)} className="text-sm" />
          <div className="mt-1 text-xs text-slate-400">{photoKeys.length} uploaded</div>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-600">Signature</div>
          <SignaturePad ref={padRef} />
        </div>
      </div>
      <button onClick={submitPod} disabled={busy === "pod"} className={`${primary} mt-4`}>
        {busy === "pod" ? "Submitting…" : "Submit POD → Delivered"}
      </button>
    </div>
  );
}

// ── Vehicle diagram (top view). Click a panel to add a finding there. ──
const PANELS: Array<{ id: string; label: string; x: number; y: number; w: number; h: number }> = [
  { id: "front-bumper", label: "Front", x: 40, y: 10, w: 120, h: 22 },
  { id: "hood", label: "Hood", x: 40, y: 36, w: 120, h: 48 },
  { id: "windshield", label: "Wind.", x: 52, y: 88, w: 96, h: 26 },
  { id: "roof", label: "Roof", x: 52, y: 118, w: 96, h: 66 },
  { id: "rear-window", label: "Rear W.", x: 52, y: 188, w: 96, h: 26 },
  { id: "trunk", label: "Trunk", x: 40, y: 218, w: 120, h: 48 },
  { id: "rear-bumper", label: "Rear", x: 40, y: 270, w: 120, h: 22 },
  { id: "left-side", label: "L", x: 18, y: 88, w: 18, h: 178 },
  { id: "right-side", label: "R", x: 164, y: 88, w: 18, h: 178 },
];

const SEVERITY_RANK = { INFO: 0, MINOR: 1, MODERATE: 2, MAJOR: 3, CRITICAL: 4 } as const;
const SEVERITY_FILL = ["#e2e8f0", "#fde68a", "#fbbf24", "#fb923c", "#ef4444"];

function VehicleDiagram({ findings, onAddPanel }: { findings: Finding[]; onAddPanel: (panel: string) => void }) {
  const byPanel = new Map<string, number>();
  for (const f of findings) {
    if (!f.panel) continue;
    const rank = SEVERITY_RANK[f.severity];
    byPanel.set(f.panel, Math.max(byPanel.get(f.panel) ?? -1, rank));
  }
  return (
    <div>
      <div className="mb-1 text-sm font-medium text-slate-600">Vehicle diagram — click a panel to log damage</div>
      <svg viewBox="0 0 200 302" className="h-72 w-full rounded-lg border border-slate-200 bg-slate-50">
        {PANELS.map((p) => {
          const rank = byPanel.get(p.id);
          const fill = rank != null ? SEVERITY_FILL[rank] : "#ffffff";
          return (
            <g key={p.id} onClick={() => onAddPanel(p.id)} className="cursor-pointer">
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={4} fill={fill} stroke="#94a3b8" strokeWidth={1} />
              <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 3} textAnchor="middle" fontSize="9" fill="#475569">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FindingsEditor({ findings, setFindings }: { findings: Finding[]; setFindings: (f: Finding[]) => void }) {
  function update(i: number, patch: Partial<Finding>) {
    setFindings(findings.map((f, idx) => (idx === i ? { ...f, ...patch, source: "human" } : f)));
  }
  return (
    <div>
      <div className="mb-1 text-sm font-medium text-slate-600">Findings ({findings.length})</div>
      <div className="space-y-2">
        {findings.length === 0 && <p className="text-xs text-slate-400">No damage found. Click panels to add.</p>}
        {findings.map((f, i) => (
          <div key={i} className="flex items-center gap-2 rounded border border-slate-200 p-2 text-xs">
            <span className="w-20 shrink-0 text-slate-500">{f.panel ?? "—"}</span>
            <input
              className="w-20 rounded border border-slate-200 px-1 py-0.5"
              value={f.kind}
              onChange={(e) => update(i, { kind: e.target.value })}
            />
            <select
              className="rounded border border-slate-200 px-1 py-0.5"
              value={f.severity}
              onChange={(e) => update(i, { severity: e.target.value as Finding["severity"] })}
            >
              {["INFO", "MINOR", "MODERATE", "MAJOR", "CRITICAL"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {f.source === "ai" ? (
              <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">AI</span>
            ) : (
              <span className="rounded bg-navy-50 px-1 text-[10px] text-navy-600">edited</span>
            )}
            <button onClick={() => setFindings(findings.filter((_, idx) => idx !== i))} className="ml-auto text-slate-400 hover:text-red-500">
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Minimal signature pad (canvas) ──
import { forwardRef, useImperativeHandle } from "react";
interface SignaturePadHandle {
  toBlob: () => Promise<Blob | null>;
}
const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useImperativeHandle(ref, () => ({
    toBlob: () =>
      new Promise<Blob | null>((resolve) => {
        const c = canvasRef.current;
        if (!c) return resolve(null);
        c.toBlob((b) => resolve(b), "image/png");
      }),
  }));

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function start(e: React.PointerEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  function end() {
    drawing.current = false;
  }
  function clear() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
  }
  return (
    <div>
      <canvas
        ref={canvasRef}
        width={320}
        height={120}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none rounded-lg border border-slate-300 bg-white"
      />
      <button onClick={clear} className="mt-1 text-xs text-slate-400 hover:underline">
        Clear
      </button>
    </div>
  );
});
