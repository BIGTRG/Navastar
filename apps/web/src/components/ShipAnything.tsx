// Module 14 — multi-commodity draft shipment (not an auction lot). Creates a
// shipment for any enabled commodity; disabled commodities (e.g. Live Animals)
// are rejected by the server's rules engine.
import { useState } from "react";
import { api, ApiError } from "../api.js";

const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
const primary = "rounded-lg bg-navy-600 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50";

const COMMODITIES = ["VEHICLE", "BOAT", "EQUIPMENT", "FREIGHT", "WHITE_GLOVE", "HIGH_VALUE", "LIVE_ANIMALS"];

export function ShipAnything() {
  const [form, setForm] = useState({ commodityType: "BOAT", description: "22ft center-console boat on trailer", value: "" });
  const [tracking, setTracking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setErr(null);
    setTracking(null);
    try {
      const res = await api.post<{ trackingId: string }>("/api/shipments", {
        commodityType: form.commodityType,
        description: form.description,
        valueCents: form.value ? Math.round(Number(form.value) * 100) : undefined,
        pickup: { name: "Origin", city: "Dallas, TX", lat: 32.7767, lng: -96.797 },
        dropoff: { name: "Destination", city: "Austin, TX", lat: 30.2672, lng: -97.7431 },
      });
      setTracking(res.trackingId);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Ship any commodity</h2>
      <p className="mt-1 text-sm text-slate-500">Not an auction lot? Create a multi-commodity draft, then quote &amp; track it.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Commodity</span>
          <select className={input} value={form.commodityType} onChange={(e) => setForm({ ...form, commodityType: e.target.value })}>
            {COMMODITIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Declared value ($)</span>
          <input className={input} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="optional" />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm text-slate-600">Description</span>
          <input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {tracking && (
        <div className="mt-3 rounded-md bg-navy-50 p-3 text-sm">
          Draft created — tracking id <span className="font-bold text-navy-700">{tracking}</span>. Quote it from the Track tab or API.
        </div>
      )}
      <button onClick={create} disabled={busy} className={`${primary} mt-4`}>
        {busy ? "Creating…" : "Create draft"}
      </button>
    </section>
  );
}
