// Module 4 — Ops dashboard. KPIs, Global GPS fleet map (live over WS), filterable
// shipments table, and the exceptions / human-review queue.
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
const select = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";

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
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!kpis) return <p className="text-sm text-slate-400">Loading KPIs…</p>;

  const cards: Array<{ label: string; value: string; hint?: string }> = [
    { label: "Active shipments", value: String(kpis.activeShipments) },
    { label: "Delivered", value: String(kpis.delivered) },
    { label: "GMV", value: formatUSD(kpis.gmvCents) },
    { label: "Revenue", value: formatUSD(kpis.revenueCents), hint: `${(kpis.blendedTakeRateBps / 100).toFixed(1)}% take` },
    { label: "Drivers active", value: String(kpis.driversActive) },
    {
      label: "Needs review",
      value: String(kpis.pendingReview),
      hint: kpis.avgAiConfidence != null ? `avg AI ${(kpis.avgAiConfidence * 100).toFixed(0)}%` : undefined,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-400">{c.label}</div>
          <div className="mt-1 text-2xl font-bold text-navy-700">{c.value}</div>
          {c.hint && <div className="text-xs text-slate-400">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}

function FleetPanel() {
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [kind, setKind] = useState<"all" | "fleet" | "contractor">("all");
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

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Global GPS — active drivers</h2>
        <div className="flex items-center gap-3 text-sm">
          <Legend color="#2563eb" label="Fleet (W-2)" />
          <Legend color="#dc2626" label="Contractor" />
          <select className={select} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="all">All</option>
            <option value="fleet">Fleet only</option>
            <option value="contractor">Contractors only</option>
          </select>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FleetMap drivers={drivers} />
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Roster</div>
          <ul className="space-y-2">
            {drivers.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: d.kind === "fleet" ? "#2563eb" : "#dc2626" }}
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.name}</div>
                  <div className="truncate text-xs text-slate-400">{d.carrier}</div>
                </div>
                <button onClick={() => toggleRoam(d)} className={`${secondary} ml-auto`}>
                  {d.roaming ? "■" : "▶"}
                </button>
              </li>
            ))}
            {drivers.length === 0 && <li className="text-sm text-slate-400">No drivers match.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-slate-500">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

const STATUSES = ["", "DRAFT", "QUOTED", "BOOKED", "ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "EXCEPTION"];
const COMMODITIES = ["", "VEHICLE", "BOAT", "EQUIPMENT", "FREIGHT", "WHITE_GLOVE", "HIGH_VALUE", "LIVE_ANIMALS"];

function ShipmentsPanel() {
  const [rows, setRows] = useState<OpsShipmentRow[]>([]);
  const [status, setStatus] = useState("");
  const [commodity, setCommodity] = useState("");
  const [search, setSearch] = useState("");
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

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Shipments</h2>
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
          <button onClick={load} className={secondary}>
            Search
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="py-2">Tracking</th>
              <th>Status</th>
              <th>Commodity</th>
              <th>Lane</th>
              <th className="text-right">Price</th>
              <th className="text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">{r.trackingId}</td>
                <td>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{r.status}</span>
                </td>
                <td className="text-slate-500">{r.commodityType}</td>
                <td className="text-slate-500">
                  {r.origin ?? "—"} → {r.dest ?? "—"}
                </td>
                <td className="text-right">{r.quotedPriceCents != null ? formatUSD(r.quotedPriceCents) : "—"}</td>
                <td className="text-right text-green-700">{r.marginCents != null ? formatUSD(r.marginCents) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No shipments match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExceptionsPanel() {
  const [items, setItems] = useState<OpsException[]>([]);
  useEffect(() => {
    api.get<{ exceptions: OpsException[] }>("/api/ops/exceptions").then(
      (r) => setItems(r.exceptions),
      () => setItems([])
    );
  }, []);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Exceptions & human-review queue</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">All clear — nothing needs attention.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((x, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm">
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">
                {x.type === "needs_human_review" ? "review" : "exception"}
              </span>
              <span className="font-medium text-slate-700">{x.trackingId ?? x.shipmentId ?? "—"}</span>
              <span className="text-slate-500">{x.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
