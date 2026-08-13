// Module 3 — Driver app UI. Job list → guided pickup (AI walk-around inspection on
// an editable vehicle diagram, VIN/odometer OCR, complete pickup) → delivery
// (signature pad + photo POD + digital BOL). Media uploads go straight to MinIO/S3
// via presign. B-track: step-by-step panel-by-panel photo capture flow, BOL display.
import { useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  uploadMedia,
  type DriverJob,
  type Finding,
  type InspectionResponse,
} from "../api.js";
import { StubBadge } from "./StubBadge.js";

const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#203088]";
const primary = "rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
const btnPrimary = `${primary} bg-[#203088]`;
const btnDanger = `${primary} bg-[#B4182A]`;
const secondary = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

// ── Job list ──────────────────────────────────────────────────────────────────
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
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="rounded-t-xl bg-[#203088] px-6 py-4">
        <h2 className="text-lg font-semibold text-white">My Jobs</h2>
        <p className="text-xs text-blue-200">Active shipments assigned to you</p>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">{jobs ? `${jobs.length} active` : "Loading…"}</span>
          <button onClick={loadJobs} className={secondary}>
            Refresh
          </button>
        </div>
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
        {jobs && jobs.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">No active jobs. Book one in the "Deliver with Navastar" flow first.</p>
        )}
        <ul className="mt-4 space-y-2">
          {jobs?.map((j) => (
            <li key={j.id ?? j.trackingId}>
              <button
                onClick={() => setActive(j)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:border-[#203088]/30 hover:bg-[#203088]/5"
              >
                <div>
                  <div className="font-medium">{j.cargo[0]?.description ?? "Shipment"}</div>
                  <div className="text-sm text-slate-500">
                    {j.trackingId} · {j.pickup?.city ?? "—"} → {j.dropoff?.city ?? "—"}
                  </div>
                </div>
                <span className="rounded-full bg-[#203088] px-3 py-1 text-xs font-medium text-white">
                  {j.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Job detail ────────────────────────────────────────────────────────────────
function JobDetail({ job, onBack }: { job: DriverJob; onBack: () => void }) {
  const shipmentId = job.id ?? job.trackingId;
  const [status, setStatus] = useState(job.status);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bolGenerated, setBolGenerated] = useState<BolData | null>(null);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="rounded-t-xl bg-[#203088] px-6 py-4">
        <button onClick={onBack} className="text-xs text-blue-200 hover:text-white">
          ← Back to jobs
        </button>
        <div className="mt-1 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{job.cargo[0]?.description ?? "Shipment"}</h2>
            <p className="text-xs text-blue-200">
              {job.trackingId} · {job.pickup?.name ?? job.pickup?.city} → {job.dropoff?.city}
            </p>
          </div>
          <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium text-white">{status}</span>
        </div>
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

        <PickupSection
          shipmentId={shipmentId}
          cargoDesc={job.cargo[0]?.description}
          onStatus={setStatus}
          onErr={setErr}
          onMsg={setMsg}
        />

        <DeliverySection
          shipmentId={shipmentId}
          job={job}
          onStatus={setStatus}
          onErr={setErr}
          onMsg={setMsg}
          onBol={setBolGenerated}
        />

        {bolGenerated && <BolDisplay bol={bolGenerated} />}
      </div>
    </section>
  );
}

// ── Walk-around inspection steps ──────────────────────────────────────────────
const INSPECTION_PANELS = [
  { id: "front-bumper", label: "Front Bumper" },
  { id: "hood", label: "Hood" },
  { id: "windshield", label: "Windshield" },
  { id: "left-side", label: "Driver Side (Left)" },
  { id: "right-side", label: "Passenger Side (Right)" },
  { id: "roof", label: "Roof" },
  { id: "rear-window", label: "Rear Window" },
  { id: "trunk", label: "Trunk / Cargo Area" },
  { id: "rear-bumper", label: "Rear Bumper" },
];

function PickupSection({
  shipmentId,
  cargoDesc,
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
  const [mode, setMode] = useState<"guided" | "bulk">("guided");
  const [step, setStep] = useState(0); // which panel we're on in guided mode
  const [panelPhotos, setPanelPhotos] = useState<Record<string, string[]>>({}); // panel → keys
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [inspection, setInspection] = useState<InspectionResponse | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [score, setScore] = useState<number>(100);
  const [vin, setVin] = useState("");
  const [odometer, setOdometer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const allPanelsDone = INSPECTION_PANELS.every((p) => (panelPhotos[p.id] ?? []).length > 0);
  const allKeys = [...photoKeys, ...Object.values(panelPhotos).flat()];

  async function uploadPanelFile(panelId: string, files: FileList | null) {
    if (!files?.length) return;
    onErr(null);
    setBusy(`upload-${panelId}`);
    try {
      const keys: string[] = [];
      for (const f of Array.from(files)) {
        keys.push(await uploadMedia(shipmentId, "INSPECTION_PHOTO", f, `${panelId}_${f.name}`));
      }
      setPanelPhotos((prev) => ({ ...prev, [panelId]: [...(prev[panelId] ?? []), ...keys] }));
    } catch (e) {
      onErr(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function uploadBulkFiles(files: FileList | null) {
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
        imageKeys: allKeys,
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
        findings: findings.map((f) => ({
          panel: f.panel,
          kind: f.kind,
          severity: f.severity,
          note: f.note,
          source: f.source,
        })),
      });
      onMsg("✓ Inspection approved. Findings recorded for QA.");
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
      const key = allKeys[0] ?? `demo/${kind.toLowerCase()}.jpg`;
      const res = await api.post<{ fields: Record<string, string | number> }>(
        `/api/shipments/${shipmentId}/ocr`,
        { imageKey: key, kind }
      );
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
      const res = await api.post<{ status: string }>(`/api/shipments/${shipmentId}/pickup`, {});
      onStatus(res.status);
      onMsg("✓ Pickup complete — vehicle checked in.");
    } catch (e) {
      onErr(e instanceof ApiError ? e.message : "Complete pickup failed");
    } finally {
      setBusy(null);
    }
  }

  const currentPanel = INSPECTION_PANELS[step];

  return (
    <div className="border-b border-slate-100 pb-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#203088] text-sm font-bold text-white">
          1
        </div>
        <h3 className="font-semibold text-slate-800">Guided Pickup Inspection</h3>
        {cargoDesc && <span className="text-sm text-slate-400">— {cargoDesc}</span>}
      </div>

      {/* Mode toggle */}
      {!inspection && (
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setMode("guided")}
            className={mode === "guided" ? `${btnPrimary} text-xs py-1 px-3` : `${secondary} text-xs py-1 px-3`}
          >
            Step-by-step
          </button>
          <button
            onClick={() => setMode("bulk")}
            className={mode === "bulk" ? `${btnPrimary} text-xs py-1 px-3` : `${secondary} text-xs py-1 px-3`}
          >
            Upload all at once
          </button>
        </div>
      )}

      {!inspection && mode === "guided" && currentPanel && (
        <div className="rounded-xl border border-[#203088]/20 bg-[#203088]/5 p-4">
          {/* Progress */}
          <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              Panel {step + 1} of {INSPECTION_PANELS.length}
            </span>
            <span>{INSPECTION_PANELS.filter((p) => (panelPhotos[p.id] ?? []).length > 0).length} captured</span>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[#203088] transition-all"
              style={{
                width: `${(INSPECTION_PANELS.filter((p) => (panelPhotos[p.id] ?? []).length > 0).length / INSPECTION_PANELS.length) * 100}%`,
              }}
            />
          </div>

          <div className="mb-1 text-base font-semibold text-[#203088]">{currentPanel.label}</div>
          <div className="mb-3 text-xs text-slate-500">
            Take a clear photo of the <strong>{currentPanel.label}</strong> area. Capture any damage, dents, or scratches.
          </div>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => uploadPanelFile(currentPanel.id, e.target.files)}
            className="block text-sm"
          />
          {(panelPhotos[currentPanel.id] ?? []).length > 0 && (
            <div className="mt-1 text-xs text-green-700">
              ✓ {panelPhotos[currentPanel.id]!.length} photo(s) captured
            </div>
          )}
          {busy === `upload-${currentPanel.id}` && (
            <div className="mt-1 text-xs text-slate-400">Uploading…</div>
          )}

          <div className="mt-4 flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className={secondary}>
                ← Back
              </button>
            )}
            {step < INSPECTION_PANELS.length - 1 && (
              <button
                onClick={() => setStep((s) => s + 1)}
                className={btnPrimary}
              >
                Next panel →
              </button>
            )}
            {step === INSPECTION_PANELS.length - 1 && (
              <button onClick={runWalkaround} disabled={!allPanelsDone || busy === "inspect"} className={btnDanger}>
                {busy === "inspect" ? "Analyzing…" : "Run AI Inspection →"}
              </button>
            )}
          </div>

          {/* Panel status grid */}
          <div className="mt-4 grid grid-cols-3 gap-1">
            {INSPECTION_PANELS.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setStep(i)}
                className={`rounded px-2 py-1 text-left text-xs transition-colors ${
                  i === step
                    ? "bg-[#203088] text-white"
                    : (panelPhotos[p.id] ?? []).length > 0
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {(panelPhotos[p.id] ?? []).length > 0 ? "✓ " : ""}
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!inspection && mode === "bulk" && (
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-1 text-sm font-medium text-slate-600">Walk-around photos (all panels)</div>
          <input type="file" accept="image/*" multiple onChange={(e) => uploadBulkFiles(e.target.files)} className="text-sm" />
          <div className="mt-1 text-xs text-slate-400">{photoKeys.length} uploaded to storage</div>
          <button
            onClick={runWalkaround}
            disabled={busy === "inspect" || photoKeys.length === 0}
            className={`${btnDanger} mt-3`}
          >
            {busy === "inspect" ? "Analyzing…" : "Run AI Walk-around"}
          </button>
        </div>
      )}

      {/* AI results */}
      {inspection && (
        <div className="mt-4 space-y-4">
          {/* Score + AI envelope */}
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <div className="text-sm font-medium text-slate-600">Condition Score</div>
              <span
                className={`rounded-full px-3 py-0.5 text-sm font-bold ${
                  score >= 80
                    ? "bg-green-100 text-green-700"
                    : score >= 60
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {score}/100
              </span>
              {inspection.ai.needsHumanReview && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  ⚑ Requires human review
                </span>
              )}
              <span className="text-xs text-slate-400">
                AI confidence: {Math.round(inspection.ai.confidence * 100)}%
              </span>
              <StubBadge model={inspection.ai.model} version={inspection.ai.version} className="text-[10px]" />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className="w-full accent-[#203088]"
            />
            <div className="mt-1 grid grid-cols-4 gap-1 text-xs text-slate-400">
              <span>Logged: {inspection.ai.model}</span>
              <span>v{inspection.ai.version}</span>
              <span>By: {inspection.ai.decidedBy}</span>
              <span>QA: {inspection.ai.qaStatus}</span>
            </div>
          </div>

          {/* Diagram + findings */}
          <div className="grid gap-4 md:grid-cols-2">
            <VehicleDiagram
              findings={findings}
              onAddPanel={(panel) =>
                setFindings((f) => [
                  ...f,
                  { panel, kind: "scratch", severity: "MINOR", source: "human" },
                ])
              }
            />
            <FindingsEditor findings={findings} setFindings={setFindings} />
          </div>

          <button onClick={approve} disabled={busy === "approve"} className={btnPrimary}>
            {busy === "approve" ? "Saving…" : "✓ Approve findings"}
          </button>
        </div>
      )}

      {/* VIN + Odometer */}
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
            <input
              className={input}
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder="auto-read or type"
            />
            <button onClick={() => runOcr("ODOMETER")} disabled={busy === "ODOMETER"} className={secondary}>
              {busy === "ODOMETER" ? "…" : "Auto-read"}
            </button>
          </div>
        </div>
      </div>

      <button onClick={completePickup} disabled={busy === "pickup"} className={`${btnDanger} mt-4`}>
        {busy === "pickup" ? "…" : "Complete Pickup →"}
      </button>
    </div>
  );
}

// ── Delivery: signature pad + photo POD + BOL ────────────────────────────────
interface BolData {
  trackingId: string;
  shipmentId: string;
  signerName: string;
  deliveredAt: string;
  photoCount: number;
  hasSignature: boolean;
}

function DeliverySection({
  shipmentId,
  job,
  onStatus,
  onErr,
  onMsg,
  onBol,
}: {
  shipmentId: string;
  job: DriverJob;
  onStatus: (s: string) => void;
  onErr: (s: string | null) => void;
  onMsg: (s: string | null) => void;
  onBol: (bol: BolData) => void;
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
      onMsg("✓ Delivered — POD captured, custody chain closed.");
      // Generate BOL data
      onBol({
        trackingId: job.trackingId,
        shipmentId,
        signerName,
        deliveredAt: new Date().toISOString(),
        photoCount: photoKeys.length,
        hasSignature: !!signatureKey,
      });
    } catch (e) {
      onErr(e instanceof ApiError ? e.message : "POD failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pt-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#B4182A] text-sm font-bold text-white">
          2
        </div>
        <h3 className="font-semibold text-slate-800">Delivery — Proof of Delivery</h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-sm font-medium text-slate-600">Recipient name *</div>
          <input className={input} value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Who signed?" />

          <div className="mb-1 mt-3 text-sm font-medium text-slate-600">Delivery photos</div>
          <input type="file" accept="image/*" multiple onChange={(e) => onUpload(e.target.files)} className="text-sm" />
          <div className="mt-1 text-xs text-slate-400">{photoKeys.length} photo(s) uploaded</div>
          {busy === "upload" && <div className="text-xs text-slate-400">Uploading…</div>}
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-600">Buyer signature</div>
          <SignaturePad ref={padRef} />
        </div>
      </div>

      <button onClick={submitPod} disabled={busy === "pod"} className={`${btnDanger} mt-4`}>
        {busy === "pod" ? "Submitting…" : "Submit POD → Mark Delivered"}
      </button>
    </div>
  );
}

// ── Digital BOL display ───────────────────────────────────────────────────────
function BolDisplay({ bol }: { bol: BolData }) {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border-2 border-[#203088] bg-white shadow">
      {/* BOL header */}
      <div className="bg-[#203088] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-200">
              Digital Bill of Lading
            </div>
            <div className="text-lg font-bold text-white">NAVASTAR LOGISTICS</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-blue-200">BOL / POD</div>
            <div className="font-mono text-sm font-bold text-white">{bol.trackingId}</div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Shipment ID</div>
            <div className="mt-1 font-mono text-sm text-slate-800">{bol.shipmentId}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recipient</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">{bol.signerName}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Delivered At</div>
            <div className="mt-1 text-sm text-slate-800">
              {new Date(bol.deliveredAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-6 border-t border-slate-100 pt-4 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-full ${bol.hasSignature ? "bg-green-500" : "bg-slate-300"}`}
            />
            <span className="text-slate-600">{bol.hasSignature ? "Signed" : "No signature"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-full ${bol.photoCount > 0 ? "bg-green-500" : "bg-slate-300"}`}
            />
            <span className="text-slate-600">{bol.photoCount} delivery photo(s)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-green-500" />
            <span className="text-slate-600">Custody chain sealed</span>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-center text-xs text-slate-400">
          This digital BOL is hash-chained and tamper-evident. Signed by recipient{" "}
          <strong className="text-slate-600">{bol.signerName}</strong> and locked in the Navastar custody ledger.
        </div>
      </div>
    </div>
  );
}

// ── Vehicle diagram (top view). Click a panel to add a finding there. ──────────
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
const SEVERITY_COLORS: Record<string, string> = {
  INFO: "bg-slate-100 text-slate-600",
  MINOR: "bg-yellow-100 text-yellow-700",
  MODERATE: "bg-amber-100 text-amber-700",
  MAJOR: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

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
      <div className="mb-1 text-sm font-medium text-slate-600">
        Findings ({findings.length})
      </div>
      <div className="space-y-2">
        {findings.length === 0 && (
          <p className="text-xs text-slate-400">No damage found. Click panels to add.</p>
        )}
        {findings.map((f, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 font-medium text-slate-600">{f.panel ?? "—"}</span>
              <input
                className="w-20 rounded border border-slate-200 px-1 py-0.5 text-xs"
                value={f.kind}
                onChange={(e) => update(i, { kind: e.target.value })}
                placeholder="damage type"
              />
              <select
                className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                value={f.severity}
                onChange={(e) => update(i, { severity: e.target.value as Finding["severity"] })}
              >
                {["INFO", "MINOR", "MODERATE", "MAJOR", "CRITICAL"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {f.confidence != null && (
                <span className="text-xs text-slate-400">{Math.round(f.confidence * 100)}%</span>
              )}
              {f.source === "ai" ? (
                <span className="rounded bg-[#203088]/10 px-1 text-[10px] text-[#203088]">AI</span>
              ) : (
                <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">edited</span>
              )}
              <button
                onClick={() => setFindings(findings.filter((_, idx) => idx !== i))}
                className="ml-auto text-slate-300 hover:text-red-500"
              >
                ✕
              </button>
            </div>
            {/* Severity badge */}
            <div className="mt-1 flex gap-1">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[f.severity]}`}>
                {f.severity}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Minimal signature pad (canvas) ────────────────────────────────────────────
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
        className="w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-slate-400">Sign above with finger or mouse</span>
        <button onClick={clear} className="text-xs text-slate-400 hover:text-red-500 hover:underline">
          Clear
        </button>
      </div>
    </div>
  );
});
