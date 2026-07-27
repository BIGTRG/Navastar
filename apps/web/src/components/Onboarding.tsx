// Module 8 — Onboarding. Self-service carrier + driver applications (dual track,
// FMCSA auto-fill) and an ops verification queue.
import { useEffect, useState } from "react";
import { api, ApiError, type FmcsaPrefill, type PendingOnboarding } from "../api.js";

const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy-600";
const primary = "rounded-lg bg-navy-600 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

export function Onboarding({ canSubmit, canManage }: { canSubmit: boolean; canManage: boolean }) {
  return (
    <div className="space-y-6">
      {canManage && <VerificationQueue />}
      {canSubmit && <CarrierForm />}
      {canSubmit && <DriverForm />}
    </div>
  );
}

function CarrierForm() {
  const [form, setForm] = useState({ legalName: "", dotNumber: "", mcNumber: "", provider: "", coverage: "", policyNo: "" });
  const [prefill, setPrefill] = useState<FmcsaPrefill | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function lookup() {
    setBusy("lookup");
    setErr(null);
    try {
      const res = await api.post<{ prefill: FmcsaPrefill }>("/api/onboarding/carrier/lookup", {
        dotNumber: form.dotNumber || undefined,
        mcNumber: form.mcNumber || undefined,
      });
      setPrefill(res.prefill);
      setForm((f) => ({ ...f, legalName: res.prefill.legalName }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Lookup failed");
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy("submit");
    setErr(null);
    setMsg(null);
    try {
      await api.post("/api/onboarding/carrier", {
        legalName: form.legalName,
        dotNumber: form.dotNumber || undefined,
        mcNumber: form.mcNumber || undefined,
        insurance: form.provider
          ? { type: "CARGO", provider: form.provider, policyNo: form.policyNo || undefined, coverageCents: form.coverage ? Math.round(Number(form.coverage) * 100) : undefined }
          : undefined,
      });
      setMsg("Carrier application submitted for review.");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Submit failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Carrier onboarding</h2>
      <p className="mt-1 text-sm text-slate-500">Independent / lease-on carriers. Auto-fill from FMCSA by DOT or MC.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">USDOT #</span>
          <input className={input} value={form.dotNumber} onChange={(e) => setForm({ ...form, dotNumber: e.target.value })} placeholder="1234567" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">MC #</span>
          <input className={input} value={form.mcNumber} onChange={(e) => setForm({ ...form, mcNumber: e.target.value })} placeholder="MC-987654" />
        </label>
      </div>
      <button onClick={lookup} disabled={busy === "lookup"} className={`${secondary} mt-2`}>
        {busy === "lookup" ? "Looking up…" : "Auto-fill from FMCSA"}
      </button>
      {prefill && (
        <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
          FMCSA: <b>{prefill.legalName}</b> · authority {prefill.authorityActive ? "active" : "inactive"} · safety {prefill.safetyScore ?? "—"} · insurance{" "}
          {prefill.insuranceOnFile ? "on file" : "missing"}
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Legal name</span>
          <input className={input} value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Insurance provider</span>
          <input className={input} value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="e.g. Progressive Commercial" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Policy #</span>
          <input className={input} value={form.policyNo} onChange={(e) => setForm({ ...form, policyNo: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Cargo coverage ($)</span>
          <input className={input} value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value })} placeholder="100000" />
        </label>
      </div>
      {msg && <p className="mt-3 text-sm text-green-700">{msg}</p>}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <button onClick={submit} disabled={busy === "submit" || !form.legalName} className={`${primary} mt-4`}>
        Submit application
      </button>
    </section>
  );
}

function DriverForm() {
  const [form, setForm] = useState({ name: "", type: "INDEPENDENT", licenseNo: "", licenseState: "", linkSelf: true });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isEmployee = form.type === "EMPLOYEE_W2";

  async function submit() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await api.post<{ backgroundCheckStatus: string | null }>("/api/onboarding/driver", {
        name: form.name,
        type: form.type,
        licenseNo: form.licenseNo || undefined,
        licenseState: form.licenseState || undefined,
        linkSelf: form.linkSelf,
      });
      setMsg(isEmployee ? `Driver submitted. Background check: ${res.backgroundCheckStatus}.` : "Driver submitted for review.");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Driver onboarding</h2>
      <p className="mt-1 text-sm text-slate-500">Dual track — W-2 employee (license scan + background) or independent / lease-on.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Name</span>
          <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Track</span>
          <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="EMPLOYEE_W2">Employee (W-2)</option>
            <option value="INDEPENDENT">Independent</option>
            <option value="LEASE_ON">Lease-on operator</option>
          </select>
        </label>
        {isEmployee && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">License #</span>
              <input className={input} value={form.licenseNo} onChange={(e) => setForm({ ...form, licenseNo: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">License state</span>
              <input className={input} value={form.licenseState} onChange={(e) => setForm({ ...form, licenseState: e.target.value })} placeholder="TX" />
            </label>
          </>
        )}
      </div>
      {msg && <p className="mt-3 text-sm text-green-700">{msg}</p>}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <button onClick={submit} disabled={busy || !form.name} className={`${primary} mt-4`}>
        Submit
      </button>
    </section>
  );
}

function VerificationQueue() {
  const [data, setData] = useState<PendingOnboarding | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setData(await api.get<PendingOnboarding>("/api/onboarding/pending"));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function verifyCarrier(id: string, approve: boolean) {
    await api.post(`/api/onboarding/carrier/${id}/verify`, { approve });
    void load();
  }
  async function verifyDriver(id: string, approve: boolean) {
    await api.post(`/api/onboarding/driver/${id}/verify`, { approve });
    void load();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Onboarding — verification queue</h2>
        <button onClick={load} className={secondary}>
          Refresh
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Carriers</div>
          {data?.carriers.length === 0 && <p className="text-sm text-slate-400">None pending.</p>}
          <ul className="space-y-2">
            {data?.carriers.map((c) => (
              <li key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="font-medium">{c.legalName}</div>
                <div className="text-xs text-slate-400">
                  DOT {c.dotNumber ?? "—"} · MC {c.mcNumber ?? "—"} · {c.insuranceCount} insurance · {c.onboardingStatus}
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => verifyCarrier(c.id, true)} className={primary}>
                    Verify
                  </button>
                  <button onClick={() => verifyCarrier(c.id, false)} className={secondary}>
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Drivers</div>
          {data?.drivers.length === 0 && <p className="text-sm text-slate-400">None pending.</p>}
          <ul className="space-y-2">
            {data?.drivers.map((d) => (
              <li key={d.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="font-medium">{d.name}</div>
                <div className="text-xs text-slate-400">
                  {d.type} · bg: {d.backgroundCheckStatus ?? "n/a"} · {d.onboardingStatus}
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => verifyDriver(d.id, true)} className={primary}>
                    Verify
                  </button>
                  <button onClick={() => verifyDriver(d.id, false)} className={secondary}>
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
