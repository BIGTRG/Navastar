import { useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  setToken,
  getToken,
  formatUSD,
  liveSocketUrl,
  type LoginResponse,
  type IntakeResponse,
  type QuoteResponse,
  type BookResponse,
  type ShipmentView,
  type TrackData,
  type LiveMessage,
  type TrackPoint,
} from "./api.js";
import { LiveMap } from "./components/LiveMap.js";
import { DriverApp } from "./components/DriverApp.js";
import { OpsDashboard } from "./components/OpsDashboard.js";
import { QAConsole } from "./components/QAConsole.js";
import { DispatchBoard } from "./components/DispatchBoard.js";
import { LoadBoard } from "./components/LoadBoard.js";
import { Onboarding } from "./components/Onboarding.js";
import { Payments } from "./components/Payments.js";
import { Compliance } from "./components/Compliance.js";
import { Monitoring } from "./components/Monitoring.js";
import { Admin } from "./components/Admin.js";
import { Equipment } from "./components/Equipment.js";
import { ShipAnything } from "./components/ShipAnything.js";

// ─────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────
export function App() {
  const [user, setUser] = useState<LoginResponse["user"] | null>(null);
  const [tab, setTab] = useState<
    | "deliver" | "track" | "driver" | "ops" | "qa" | "dispatch" | "loadboard" | "onboarding" | "pay" | "compliance" | "risk" | "admin" | "equipment"
  >("deliver");

  useEffect(() => {
    if (getToken()) {
      api.get<{ user: LoginResponse["user"] }>("/api/auth/me").then(
        (r) => setUser(r.user),
        () => setToken(null)
      );
    }
  }, []);

  return (
    <div className="min-h-screen">
      <Header
        user={user}
        onLogout={() => {
          setToken(null);
          setUser(null);
        }}
      />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {!user ? (
          <Login onLogin={setUser} />
        ) : (
          <>
            <div className="mb-6 flex gap-2">
              <TabButton active={tab === "deliver"} onClick={() => setTab("deliver")}>
                Deliver with Navastar
              </TabButton>
              <TabButton active={tab === "track"} onClick={() => setTab("track")}>
                Track a shipment
              </TabButton>
              {user.roles.some((r) =>
                ["employee_driver", "lease_operator", "independent_carrier", "dispatcher", "admin"].includes(r)
              ) && (
                <TabButton active={tab === "driver"} onClick={() => setTab("driver")}>
                  Driver app
                </TabButton>
              )}
              {user.roles.some((r) => r === "dispatcher" || r === "admin") && (
                <TabButton active={tab === "ops"} onClick={() => setTab("ops")}>
                  Ops
                </TabButton>
              )}
              {user.roles.some((r) => r === "dispatcher" || r === "admin") && (
                <TabButton active={tab === "dispatch"} onClick={() => setTab("dispatch")}>
                  Dispatch
                </TabButton>
              )}
              {user.roles.some((r) => r === "qa_reviewer" || r === "admin") && (
                <TabButton active={tab === "qa"} onClick={() => setTab("qa")}>
                  QA
                </TabButton>
              )}
              {user.roles.some((r) => ["dispatcher", "qa_reviewer", "admin"].includes(r)) && (
                <TabButton active={tab === "compliance"} onClick={() => setTab("compliance")}>
                  Compliance
                </TabButton>
              )}
              {user.roles.some((r) => ["dispatcher", "qa_reviewer", "admin"].includes(r)) && (
                <TabButton active={tab === "risk"} onClick={() => setTab("risk")}>
                  Trust &amp; Risk
                </TabButton>
              )}
              {user.roles.includes("admin") && (
                <TabButton active={tab === "admin"} onClick={() => setTab("admin")}>
                  Revenue admin
                </TabButton>
              )}
              {user.roles.some((r) =>
                ["equipment_lessor", "independent_carrier", "lease_operator", "dispatcher", "admin"].includes(r)
              ) && (
                <TabButton active={tab === "equipment"} onClick={() => setTab("equipment")}>
                  Equipment
                </TabButton>
              )}
              {user.roles.some((r) =>
                ["independent_carrier", "lease_operator", "dispatcher", "admin"].includes(r)
              ) && (
                <TabButton active={tab === "loadboard"} onClick={() => setTab("loadboard")}>
                  Load board
                </TabButton>
              )}
              {user.roles.some((r) =>
                ["independent_carrier", "lease_operator", "employee_driver", "dispatcher", "admin"].includes(r)
              ) && (
                <TabButton active={tab === "onboarding"} onClick={() => setTab("onboarding")}>
                  Onboarding
                </TabButton>
              )}
              {user.roles.some((r) =>
                ["independent_carrier", "lease_operator", "employee_driver", "dispatcher", "admin"].includes(r)
              ) && (
                <TabButton active={tab === "pay"} onClick={() => setTab("pay")}>
                  Pay
                </TabButton>
              )}
            </div>
            {tab === "deliver" && (
              <>
                <DeliverWizard />
                <ShipAnything />
              </>
            )}
            {tab === "track" && (
              <TrackPanel canDispatch={user.roles.some((r) => r === "dispatcher" || r === "admin")} />
            )}
            {tab === "driver" && <DriverApp />}
            {tab === "ops" && <OpsDashboard />}
            {tab === "dispatch" && <DispatchBoard />}
            {tab === "loadboard" && (
              <LoadBoard
                canPost={user.roles.some((r) => r === "dispatcher" || r === "admin")}
                canBid={user.roles.some((r) => r === "independent_carrier" || r === "lease_operator" || r === "admin")}
              />
            )}
            {tab === "onboarding" && (
              <Onboarding
                canSubmit={user.roles.some((r) =>
                  ["independent_carrier", "lease_operator", "employee_driver", "dispatcher", "admin"].includes(r)
                )}
                canManage={user.roles.some((r) => r === "dispatcher" || r === "admin")}
              />
            )}
            {tab === "pay" && (
              <Payments
                canViewOwn={user.roles.some((r) =>
                  ["independent_carrier", "lease_operator", "employee_driver", "dispatcher", "admin"].includes(r)
                )}
                canSettle={user.roles.some((r) => r === "admin" || r === "dispatcher")}
              />
            )}
            {tab === "qa" && <QAConsole />}
            {tab === "compliance" && <Compliance />}
            {tab === "risk" && (
              <Monitoring canManageClaims={user.roles.some((r) => r === "dispatcher" || r === "admin")} />
            )}
            {tab === "admin" && <Admin />}
            {tab === "equipment" && (
              <Equipment canManage={user.roles.some((r) => r === "equipment_lessor" || r === "admin")} />
            )}
          </>
        )}
      </main>
      <footer className="mx-auto max-w-3xl px-4 py-8 text-xs text-slate-400">
        Navastar Logistics · Phase 1 · Module 1 — Auction intake → AI quote → Book. AI decisions are
        logged with confidence and route to a human below threshold.
      </footer>
    </div>
  );
}

function Header({ user, onLogout }: { user: LoginResponse["user"] | null; onLogout: () => void }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-navy-600 font-bold text-white">N</div>
          <div>
            <div className="font-semibold leading-tight">Navastar Logistics</div>
            <div className="text-xs text-slate-500">AI-powered transport OS</div>
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {user.name} · <span className="text-slate-400">{user.roles.join(", ")}</span>
            </span>
            <button onClick={onLogout} className="rounded-md border border-slate-200 px-3 py-1 hover:bg-slate-50">
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${
        active ? "bg-navy-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────
function Login({ onLogin }: { onLogin: (u: LoginResponse["user"]) => void }) {
  const [email, setEmail] = useState("buyer@demo.navastar");
  const [password, setPassword] = useState("password123");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<LoginResponse>("/api/auth/login", { email, password });
      setToken(res.token);
      onLogin(res.user);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Sign in">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={busy} className={primaryBtn}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-xs text-slate-500">
          Demo users (password <code>password123</code>): buyer@demo.navastar, dispatch@demo.navastar,
          admin@demo.navastar
        </p>
      </form>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Deliver wizard: intake → quote → book
// ─────────────────────────────────────────────────────────────
function DeliverWizard() {
  const [step, setStep] = useState(1);
  const [intake, setIntake] = useState<IntakeResponse | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [booked, setBooked] = useState<BookResponse | null>(null);

  return (
    <div className="space-y-4">
      <Steps current={step} labels={["Won lot", "AI quote", "Booked"]} />
      {step === 1 && (
        <IntakeStep
          onDone={(res) => {
            setIntake(res);
            setStep(2);
          }}
        />
      )}
      {step === 2 && intake && (
        <QuoteStep
          intake={intake}
          onQuoted={setQuote}
          onBooked={(b) => {
            setBooked(b);
            setStep(3);
          }}
          quote={quote}
        />
      )}
      {step === 3 && booked && (
        <BookedStep
          booked={booked}
          onRestart={() => {
            setIntake(null);
            setQuote(null);
            setBooked(null);
            setStep(1);
          }}
        />
      )}
    </div>
  );
}

const PARTNERS = ["BIDNOW", "AUCTORA", "AUCTION_OF_AMERICA", "COPART", "IAA", "MANHEIM", "ADESA"];

function IntakeStep({ onDone }: { onDone: (r: IntakeResponse) => void }) {
  const [form, setForm] = useState({
    partnerCode: "BIDNOW",
    externalLotId: "BN-2024-00123",
    vin: "1HGCM82633A004352",
    make: "Honda",
    model: "Accord EX",
    year: 2019,
    title: "2019 Honda Accord EX",
    buyerName: "Casey Buyer",
    buyerEmail: "buyer@demo.navastar",
    location: "Dallas, TX",
    lat: 32.7767,
    lng: -96.797,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<IntakeResponse>("/api/auction/lots", form);
      onDone(res);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Intake failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Won lot → draft shipment" subtitle="POST /api/auction/lots via the partner's AuctionConnector">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Auction partner">
          <select
            className={inputCls}
            value={form.partnerCode}
            onChange={(e) => setForm({ ...form, partnerCode: e.target.value })}
          >
            {PARTNERS.map((p) => (
              <option key={p} value={p}>
                {p.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lot #">
          <input className={inputCls} value={form.externalLotId} onChange={(e) => setForm({ ...form, externalLotId: e.target.value })} />
        </Field>
        <Field label="VIN">
          <input className={inputCls} value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
        </Field>
        <Field label="Title">
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Pickup location">
          <input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </Field>
        <Field label="Buyer email">
          <input className={inputCls} value={form.buyerEmail} onChange={(e) => setForm({ ...form, buyerEmail: e.target.value })} />
        </Field>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <button disabled={busy} onClick={submit} className={`${primaryBtn} mt-4`}>
        {busy ? "Creating…" : "Deliver with Navastar →"}
      </button>
    </Card>
  );
}

function QuoteStep({
  intake,
  quote,
  onQuoted,
  onBooked,
}: {
  intake: IntakeResponse;
  quote: QuoteResponse | null;
  onQuoted: (q: QuoteResponse) => void;
  onBooked: (b: BookResponse) => void;
}) {
  const [dropoff, setDropoff] = useState({ name: "Casey Buyer — Home", city: "Austin, TX", lat: 30.2672, lng: -97.7431 });
  const [enclosed, setEnclosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function getQuote() {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<QuoteResponse>("/api/quotes", { shipmentId: intake.shipmentId, dropoff, enclosed });
      onQuoted(res);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Quote failed");
    } finally {
      setBusy(false);
    }
  }

  async function book() {
    if (!quote) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<BookResponse>(`/api/shipments/${intake.shipmentId}/book`, { quoteId: quote.quoteId });
      onBooked(res);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="AI instant quote"
      subtitle={`Lot ${intake.lot.title ?? intake.auctionLotId} · draft ${intake.trackingId}`}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Deliver to (name)">
          <input className={inputCls} value={dropoff.name} onChange={(e) => setDropoff({ ...dropoff, name: e.target.value })} />
        </Field>
        <Field label="City">
          <input className={inputCls} value={dropoff.city} onChange={(e) => setDropoff({ ...dropoff, city: e.target.value })} />
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={enclosed} onChange={(e) => setEnclosed(e.target.checked)} />
        Enclosed transport (+surcharge)
      </label>

      {!quote ? (
        <button disabled={busy} onClick={getQuote} className={`${primaryBtn} mt-4`}>
          {busy ? "Pricing with AI…" : "Get AI quote"}
        </button>
      ) : (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-bold text-navy-700">{formatUSD(quote.priceCents)}</div>
            <div className="text-sm text-slate-500">{quote.distanceMiles} mi · ETA {new Date(quote.etaAt).toLocaleDateString()}</div>
          </div>
          <AiBadge ai={quote.ai} />
          <div className="mt-3 text-xs text-slate-500">
            Base {formatUSD(quote.breakdown.baseCents)} · Mileage {formatUSD(quote.breakdown.perMileCents)} · Surcharges{" "}
            {formatUSD(quote.breakdown.surchargesCents)}
          </div>
          <div className="mt-4 flex gap-2">
            <button disabled={busy} onClick={book} className={primaryBtn}>
              {busy ? "Booking…" : "Book this quote"}
            </button>
            <button onClick={getQuote} className={secondaryBtn}>
              Re-quote
            </button>
          </div>
        </div>
      )}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </Card>
  );
}

function BookedStep({ booked, onRestart }: { booked: BookResponse; onRestart: () => void }) {
  return (
    <Card title="Booked ✓" subtitle="Fee is collected up front; standard payout is weekly & free">
      <p className="text-slate-600">Your shipment is booked. Track it with this id:</p>
      <div className="my-4 rounded-lg border-2 border-dashed border-navy-600 bg-navy-50 p-4 text-center">
        <div className="text-xs uppercase tracking-wide text-slate-500">Tracking id</div>
        <div className="text-2xl font-bold text-navy-700">{booked.trackingId}</div>
      </div>
      <div className="text-sm text-slate-500">
        Status: <span className="font-medium text-slate-700">{booked.status}</span>
        {booked.etaAt && <> · ETA {new Date(booked.etaAt).toLocaleString()}</>}
      </div>
      <button onClick={onRestart} className={`${secondaryBtn} mt-4`}>
        Deliver another lot
      </button>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Track panel — live map + WebSocket stream + ETA + timeline
// ─────────────────────────────────────────────────────────────
function TrackPanel({ canDispatch }: { canDispatch: boolean }) {
  const [id, setId] = useState("");
  const [view, setView] = useState<ShipmentView | null>(null);
  const [track, setTrack] = useState<TrackData | null>(null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [current, setCurrent] = useState<TrackPoint | null>(null);
  const [status, setStatus] = useState<string>("");
  const [eta, setEta] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Close the socket on unmount.
  useEffect(() => () => wsRef.current?.close(), []);

  function openSocket(shipmentId: string) {
    wsRef.current?.close();
    const ws = new WebSocket(liveSocketUrl(shipmentId));
    wsRef.current = ws;
    ws.onopen = () => setLive(true);
    ws.onclose = () => setLive(false);
    ws.onerror = () => setLive(false);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as LiveMessage;
      if (msg.type === "tracking.point" && msg.lat != null && msg.lng != null) {
        const pt = { lat: msg.lat, lng: msg.lng, at: new Date().toISOString() };
        setCurrent(pt);
        setPoints((prev) => [...prev, pt]);
        if (msg.etaAt !== undefined) setEta(msg.etaAt ?? null);
      } else if (msg.type === "shipment.status" && msg.status) {
        setStatus(msg.status);
      }
    };
  }

  async function lookup() {
    setBusy(true);
    setErr(null);
    try {
      const key = id.trim();
      const [v, t] = await Promise.all([
        api.get<ShipmentView>(`/api/shipments/${encodeURIComponent(key)}`),
        api.get<TrackData>(`/api/shipments/${encodeURIComponent(key)}/track`),
      ]);
      setView(v);
      setTrack(t);
      setPoints(t.points);
      setCurrent(t.current);
      setStatus(t.status);
      setEta(t.etaAt);
      setSimulating(t.simulating);
      openSocket(t.shipmentId);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSim() {
    if (!track) return;
    try {
      if (simulating) {
        await api.post(`/api/shipments/${track.shipmentId}/simulate/stop`);
        setSimulating(false);
      } else {
        await api.post(`/api/shipments/${track.shipmentId}/simulate`, { steps: 24, intervalMs: 1200 });
        setSimulating(true);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Simulation failed");
    }
  }

  return (
    <Card title="Track a shipment" subtitle="Live location over WebSocket · ETA · hash-chained timeline">
      <div className="flex gap-2">
        <input className={inputCls} placeholder="NAV-XXXX-XXXX" value={id} onChange={(e) => setId(e.target.value)} />
        <button disabled={busy || !id.trim()} onClick={lookup} className={primaryBtn}>
          {busy ? "…" : "Track"}
        </button>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {view && track && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{view.shipment.trackingId}</div>
              <div className="text-sm text-slate-500">
                {view.cargo[0]?.description} · {track.pickup?.name ?? view.pickup?.city} → {track.dropoff?.name ?? view.dropoff?.city}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LiveDot live={live} />
              <span className="rounded-full bg-navy-600 px-3 py-1 text-sm font-medium text-white">{status}</span>
            </div>
          </div>

          <LiveMap pickup={track.pickup} dropoff={track.dropoff} points={points} current={current} />

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div>
              <span className="text-slate-400">ETA:</span>{" "}
              <span className="font-medium text-slate-700">{eta ? new Date(eta).toLocaleString() : "—"}</span>
            </div>
            {current && (
              <div className="text-slate-400">
                pos {current.lat.toFixed(3)}, {current.lng.toFixed(3)}
              </div>
            )}
            {canDispatch && (
              <button onClick={toggleSim} className={`${secondaryBtn} ml-auto`}>
                {simulating ? "■ Stop simulation" : "▶ Simulate movement"}
              </button>
            )}
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Custody timeline (hash-chained)
            </div>
            <ol className="space-y-2">
              {view.timeline.map((e) => (
                <li key={e.sequence} className="flex items-center gap-3 text-sm">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-navy-600 text-xs text-white">
                    {e.sequence}
                  </span>
                  <span className="font-medium text-slate-700">{e.type}</span>
                  <span className="text-slate-400">{new Date(e.at).toLocaleString()}</span>
                  <span className="ml-auto font-mono text-[10px] text-slate-300">{e.hash.slice(0, 12)}…</span>
                </li>
              ))}
            </ol>
            {!canDispatch && (
              <p className="mt-3 text-xs text-slate-400">
                Tip: sign in as <code>dispatch@demo.navastar</code> to simulate live movement.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function LiveDot({ live }: { live: boolean }) {
  return (
    <span className="flex items-center gap-1 text-xs">
      <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-slate-300"}`} />
      <span className={live ? "text-green-600" : "text-slate-400"}>{live ? "live" : "offline"}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared UI bits
// ─────────────────────────────────────────────────────────────
function AiBadge({ ai }: { ai: QuoteResponse["ai"] }) {
  const pct = Math.round(ai.confidence * 100);
  const review = ai.needsHumanReview;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-700">
        AI · {ai.model}@{ai.version}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 font-medium ${
          pct >= 75 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {pct}% confidence
      </span>
      {review ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">⚑ routes to human review</span>
      ) : (
        <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">auto-approved</span>
      )}
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">QA: {ai.qaStatus}</span>
    </div>
  );
}

function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                active ? "bg-navy-600 text-white" : done ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500"
              }`}
            >
              {done ? "✓" : n}
            </div>
            <span className={`text-sm ${active ? "font-semibold text-slate-800" : "text-slate-400"}`}>{label}</span>
            {n < labels.length && <span className="mx-1 h-px w-6 bg-slate-200" />}
          </div>
        );
      })}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy-600 focus:ring-1 focus:ring-navy-600";
const primaryBtn =
  "rounded-lg bg-navy-600 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50";
const secondaryBtn = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";
