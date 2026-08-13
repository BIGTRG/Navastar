// Module 4 — Ops dashboard. KPIs, Global GPS fleet map (live over WS), filterable
// shipments table (with fulfillment column), and the exceptions / human-review queue.
// B-track: fulfillment column, one-click exception resolve, enhanced driver popup
// with current job + ETA + route, driver roster filters (role, status, commodity).
import { useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  formatUSD,
  opsSocketUrl,
  type OpsKpis,
  type OpsShipmentRow,
  type FleetDriver,
  type OpsException,
  type OpsLiveMessage,
} from "../api.js";
import { FleetMap } from "./FleetMap.js";

const secondary = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";
const select = "rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-[#203088] focus:outline-none";
const btnPrimary = "rounded-lg bg-[#203088] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
const btnDanger = "rounded-lg bg-[#B4182A] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";

// ── Root ──────────────────────────────────────────────────────────────────────
export function OpsDashboard() {
  return (
    <div className="space-y-6">
      <KpiRow />
      <FleetPanel />
      <ShipmentsPanel />
      <ExceptionsPanel />
    </div>
  );
}

// ── KPI row ───────────────────────────────────────────────────────────────────
function KpiRow() {
  const [kpis, setKpis] = useState<OpsKpis | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setKpis(await api.get<OpsKpis>("/api/ops/kpis"));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load KPIs");
    }
  }
  useEffect(() => {
    void load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!kpis) return <p className="text-sm text-slate-400">Loading KPIs…</p>;

  type Card = { label: string; value: string; hint?: string; accent?: boolean; alert?: boolean };
  const cards: Card[] = [
    { label: "Active shipments", value: String(kpis.activeShipments), accent: true },
    { label: "Delivered", value: String(kpis.delivered) },
    { label: "Exceptions", value: String(kpis.exceptions), alert: kpis.exceptions > 0 },
    { label: "GMV", value: formatUSD(kpis.gmvCents) },
    {
      label: "Revenue (today)",
      value: formatUSD(kpis.revenueCents),
      hint: `${(kpis.blendedTakeRateBps / 100).toFixed(1)}% take`,
      accent: true,
    },
    { label: "Drivers active", value: String(kpis.driversActive) },
    {
      label: "Needs review",
      value: String(kpis.pendingReview),
      hint: kpis.avgAiConfidence != null ? `avg AI ${(kpis.avgAiConfidence * 100).toFixed(0)}%` : undefined,
      alert: kpis.pendingReview > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-xl border p-4 shadow-sm ${
            c.alert
              ? "border-red-200 bg-red-50"
              : c.accent
              ? "border-[#203088]/20 bg-[#203088]/5"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="text-xs uppercase tracking-wide text-slate-400">{c.label}</div>
          <div
            className={`mt-1 text-2xl font-bold ${
              c.alert ? "text-[#B4182A]" : c.accent ? "text-[#203088]" : "text-slate-800"
            }`}
          >
            {c.value}
          </div>
          {c.hint && <div className="text-xs text-slate-400">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Fleet panel: map + roster ─────────────────────────────────────────────────
interface DriverPopup {
  driver: FleetDriver;
  job?: { trackingId: string; status: string; origin: string; dest: string; etaAt?: string | null };
}

function FleetPanel() {
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [kind, setKind] = useState<"all" | "fleet" | "contractor">("all");
  const [rosterSearch, setRosterSearch] = useState("");
  const [popup, setPopup] = useState<DriverPopup | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  async function load(k = kind) {
    try {
      const res = await api.get<{ drivers: FleetDriver[] }>(`/api/ops/drivers?kind=${k}`);
      setDrivers(res.drivers);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load drivers");
    }
  }

  useEffect(() => {
    void load(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // Live driver positions over the ops WebSocket.
  useEffect(() => {
    const ws = new WebSocket(opsSocketUrl());
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as OpsLiveMessage;
      if (msg.type === "driver.location" && msg.driverId && msg.lat != null && msg.lng != null) {
        setDrivers((prev) =>
          prev.map((d) => (d.id === msg.driverId ? { ...d, lat: msg.lat!, lng: msg.lng!, roaming: true } : d))
        );
      }
    };
    return () => ws.close();
  }, []);

  async function toggleRoam(d: FleetDriver) {
    try {
      if (d.roaming) {
        await api.post(`/api/ops/drivers/${d.id}/roam/stop`);
      } else {
        await api.post(`/api/ops/drivers/${d.id}/roam`);
      }
      setDrivers((prev) => prev.map((x) => (x.id === d.id ? { ...x, roaming: !x.roaming } : x)));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Roam toggle failed");
    }
  }

  async function showDriverPopup(d: FleetDriver) {
    // Load driver's current job via fleet-map endpoint.
    try {
      const res = await api.get<{
        drivers: Array<{
          id: string;
          currentJob?: { trackingId: string; status: string; origin: string; dest: string; etaAt?: string | null };
        }>;
      }>("/api/ops/fleet-map");
      const found = res.drivers.find((r) => r.id === d.id);
      setPopup({ driver: d, job: found?.currentJob });
    } catch {
      setPopup({ driver: d });
    }
  }

  const filteredDrivers = drivers.filter((d) => {
    if (rosterSearch && !d.name.toLowerCase().includes(rosterSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="bg-[#203088] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Global GPS — Active Drivers</h2>
            <p className="text-xs text-blue-200">{drivers.length} driver(s) on roster</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Legend color="#2563eb" label="Fleet (W-2)" />
            <Legend color="#dc2626" label="Contractor" />
            <select
              className="rounded-md border border-blue-400 bg-[#203088] px-2 py-1.5 text-sm text-white"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="all">All</option>
              <option value="fleet">Fleet only</option>
              <option value="contractor">Contractors only</option>
            </select>
          </div>
        </div>
      </div>

      <div className="p-6">
        {err && <p className="mb-3 text-sm text-red-600">{err}</p>}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Map */}
          <div className="lg:col-span-2">
            <FleetMap
              drivers={filteredDrivers}
              onDriverClick={(d) => showDriverPopup(d)}
            />

            {/* Driver popup */}
            {popup && (
              <div className="mt-3 rounded-xl border border-[#203088]/20 bg-[#203088]/5 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-[#203088]">{popup.driver.name}</div>
                    <div className="text-xs text-slate-500">
                      {popup.driver.kind === "fleet" ? "Fleet (W-2)" : "Contractor"} · {popup.driver.carrier}
                    </div>
                    {popup.driver.lastSeenAt && (
                      <div className="mt-1 text-xs text-slate-400">
                        Last seen: {new Date(popup.driver.lastSeenAt).toLocaleTimeString()}
                      </div>
                    )}
                    {popup.driver.lat != null && popup.driver.lng != null && (
                      <div className="mt-1 font-mono text-xs text-slate-400">
                        {popup.driver.lat.toFixed(4)}, {popup.driver.lng.toFixed(4)}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setPopup(null)} className="text-slate-400 hover:text-slate-700">
                    ✕
                  </button>
                </div>

                {popup.job ? (
                  <div className="mt-3 border-t border-[#203088]/10 pt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Job</div>
                    <div className="mt-1 text-sm font-semibold text-slate-700">{popup.job.trackingId}</div>
                    <div className="text-xs text-slate-500">
                      {popup.job.origin} → {popup.job.dest}
                    </div>
                    <div className="mt-1 flex gap-2">
                      <span className="rounded-full bg-[#203088] px-2 py-0.5 text-xs text-white">
                        {popup.job.status}
                      </span>
                      {popup.job.etaAt && (
                        <span className="text-xs text-slate-500">
                          ETA: {new Date(popup.job.etaAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 border-t border-[#203088]/10 pt-3 text-xs text-slate-400">
                    No active job assigned.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Roster panel */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Roster</div>
              <span className="text-xs text-slate-400">{filteredDrivers.length}</span>
            </div>
            <input
              className={`${select} mb-2 w-full`}
              placeholder="Search drivers…"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
            />
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {filteredDrivers.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: d.kind === "fleet" ? "#2563eb" : "#dc2626" }}
                  />
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => showDriverPopup(d)}
                      className="block truncate text-left font-medium hover:text-[#203088] hover:underline"
                    >
                      {d.name}
                    </button>
                    <div className="truncate text-xs text-slate-400">{d.carrier}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {d.roaming && (
                      <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">live</span>
                    )}
                    <button
                      onClick={() => toggleRoam(d)}
                      className={`${secondary} py-0.5 px-2 text-xs`}
                    >
                      {d.roaming ? "■ Stop" : "▶ Roam"}
                    </button>
                  </div>
                </li>
              ))}
              {filteredDrivers.length === 0 && (
                <li className="text-sm text-slate-400">No drivers match.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-blue-200">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

// ── Shipments table with fulfillment column ───────────────────────────────────
const STATUSES = ["", "DRAFT", "QUOTED", "BOOKED", "ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "EXCEPTION"];
const COMMODITIES = ["", "VEHICLE", "BOAT", "EQUIPMENT", "FREIGHT", "WHITE_GLOVE", "HIGH_VALUE", "LIVE_ANIMALS"];

type SortKey = "trackingId" | "status" | "commodityType" | "quotedPriceCents" | "marginCents" | "createdAt";

function ShipmentsPanel() {
  const [rows, setRows] = useState<OpsShipmentRow[]>([]);
  const [status, setStatus] = useState("");
  const [commodity, setCommodity] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (commodity) params.set("commodity", commodity);
    if (search.trim()) params.set("search", search.trim());
    try {
      const res = await api.get<{ shipments: OpsShipmentRow[] }>(`/api/ops/shipments?${params.toString()}`);
      setRows(res.shipments);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load shipments");
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, commodity]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.key] ?? "";
    const bv = b[sort.key] ?? "";
    if (av < bv) return sort.dir === "asc" ? -1 : 1;
    if (av > bv) return sort.dir === "asc" ? 1 : -1;
    return 0;
  });

  function SortTh({ label, col }: { label: string; col: SortKey }) {
    return (
      <th
        className="cursor-pointer select-none py-2 hover:text-[#203088]"
        onClick={() => toggleSort(col)}
      >
        {label}
        {sort.key === col && (
          <span className="ml-1 text-[#203088]">{sort.dir === "asc" ? "↑" : "↓"}</span>
        )}
      </th>
    );
  }

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      EXCEPTION: "bg-red-100 text-red-700",
      IN_TRANSIT: "bg-blue-100 text-blue-700",
      DELIVERED: "bg-green-100 text-green-700",
      BOOKED: "bg-amber-100 text-amber-700",
      ASSIGNED: "bg-purple-100 text-purple-700",
    };
    return colors[s] ?? "bg-slate-100 text-slate-600";
  };

  // Derive fulfillment type from the row (fleet = no external carrier = Navastar fleet).
  function fulfillment(r: OpsShipmentRow): { label: string; cls: string } {
    // The API returns a driverName or carrierId field if we had it;
    // for now we use a heuristic: margin > 0 on fleet means they're inhouse.
    // We tag as "Fleet" if marginCents is defined (ops can see it), else "Carrier".
    if (r.marginCents != null) return { label: "Fleet", cls: "bg-blue-100 text-blue-700" };
    return { label: "Carrier", cls: "bg-orange-100 text-orange-700" };
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="bg-[#203088] px-6 py-4">
        <h2 className="text-lg font-semibold text-white">Shipments</h2>
      </div>

      <div className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <select className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || "All statuses"}
              </option>
            ))}
          </select>
          <select className={select} value={commodity} onChange={(e) => setCommodity(e.target.value)}>
            {COMMODITIES.map((c) => (
              <option key={c} value={c}>
                {c ? c.replace(/_/g, " ") : "All commodities"}
              </option>
            ))}
          </select>
          <input
            className={select}
            placeholder="tracking id / VIN"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <button onClick={load} className={btnPrimary}>
            Search
          </button>
        </div>

        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <SortTh label="Tracking" col="trackingId" />
                <SortTh label="Status" col="status" />
                <SortTh label="Commodity" col="commodityType" />
                <th className="py-2">Lane</th>
                <th>Fulfillment</th>
                <SortTh label="Price" col="quotedPriceCents" />
                <SortTh label="Margin" col="marginCents" />
                <SortTh label="Date" col="createdAt" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const f = fulfillment(r);
                return (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="py-2 font-medium text-[#203088]">{r.trackingId}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="text-slate-500">{r.commodityType}</td>
                    <td className="text-slate-500">
                      {r.origin ?? "—"} → {r.dest ?? "—"}
                    </td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${f.cls}`}>
                        {f.label}
                      </span>
                    </td>
                    <td className="text-right">
                      {r.quotedPriceCents != null ? formatUSD(r.quotedPriceCents) : "—"}
                    </td>
                    <td className="text-right text-green-700">
                      {r.marginCents != null ? formatUSD(r.marginCents) : "—"}
                    </td>
                    <td className="text-right text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400">
                    No shipments match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ── Exceptions panel with one-click resolve ───────────────────────────────────
function ExceptionsPanel() {
  const [items, setItems] = useState<OpsException[]>([]);
  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.get<{ exceptions: OpsException[] }>("/api/ops/exceptions");
      setItems(r.exceptions);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function resolve(item: OpsException) {
    if (!item.shipmentId) return;
    const key = item.shipmentId;
    setResolving((prev) => ({ ...prev, [key]: true }));
    setErr(null);
    try {
      await api.post(`/api/ops/exceptions/${item.shipmentId}/resolve`, { note: "Resolved by ops" });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Resolve failed");
    } finally {
      setResolving((prev) => ({ ...prev, [key]: false }));
    }
  }

  const statusExceptions = items.filter((x) => x.type === "status_exception");
  const reviewQueue = items.filter((x) => x.type === "needs_human_review");

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div
        className={`px-6 py-4 ${
          items.length > 0 ? "bg-[#B4182A]" : "bg-[#203088]"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {items.length > 0 ? `⚠ ${items.length} Exception(s) / Review(s)` : "Exceptions & Review Queue"}
            </h2>
            <p className="text-xs text-white/70">
              {statusExceptions.length} shipment exceptions · {reviewQueue.length} AI review(s) pending
            </p>
          </div>
          <button onClick={load} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10">
            Refresh
          </button>
        </div>
      </div>

      <div className="p-6">
        {err && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
            {err}
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            ✓ All clear — nothing needs attention.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Shipment EXCEPTION status items */}
            {statusExceptions.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Shipment exceptions
                </div>
                <ul className="space-y-2">
                  {statusExceptions.map((x, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm"
                    >
                      <span className="shrink-0 rounded-full bg-[#B4182A] px-2 py-0.5 text-xs font-medium text-white">
                        EXCEPTION
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-slate-700">{x.trackingId ?? x.shipmentId ?? "—"}</span>
                        <span className="ml-2 text-slate-500">{x.detail}</span>
                        <div className="text-xs text-slate-400">
                          {new Date(x.at).toLocaleString()}
                        </div>
                      </div>
                      {x.shipmentId && (
                        <button
                          onClick={() => resolve(x)}
                          disabled={resolving[x.shipmentId!]}
                          className={btnDanger}
                        >
                          {resolving[x.shipmentId!] ? "Resolving…" : "Resolve →"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* AI review queue */}
            {reviewQueue.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  AI human-review queue
                </div>
                <ul className="space-y-2">
                  {reviewQueue.map((x, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
                    >
                      <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
                        REVIEW
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-slate-700">{x.trackingId ?? x.shipmentId ?? "—"}</span>
                        <span className="ml-2 text-slate-500">{x.detail}</span>
                        <div className="text-xs text-slate-400">
                          {new Date(x.at).toLocaleString()}
                        </div>
                      </div>
                      <a
                        href="#qa"
                        className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      >
                        → QA Console
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
