// Module 14 — Equipment leasing marketplace. Browse + lease listings; lessors
// create + manage their own.
import { useEffect, useState } from "react";
import { api, ApiError, formatUSD, type EquipmentListingRow, type MyLeaseRow } from "../api.js";

const input = "rounded-md border border-slate-300 px-3 py-2 text-sm";
const primary = "rounded-lg bg-navy-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50";

const ASSET_TYPES = ["TRUCK", "TRAILER", "CAR_HAULER", "FLATBED", "ENCLOSED", "OTHER"];

export function Equipment({ canManage }: { canManage: boolean }) {
  return (
    <div className="space-y-6">
      <Browse />
      {canManage && <MyListings />}
      <MyLeases />
    </div>
  );
}

function Browse() {
  const [listings, setListings] = useState<EquipmentListingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get<{ listings: EquipmentListingRow[] }>("/api/equipment/listings");
      setListings(res.listings);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function lease(id: string) {
    setErr(null);
    setMsg(null);
    try {
      await api.post(`/api/equipment/listings/${id}/lease`, {});
      setMsg("Leased. See it under your leases below.");
      void load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Lease failed");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Equipment marketplace</h2>
      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {listings.map((l) => (
          <div key={l.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{l.title}</div>
              <span className="text-sm font-semibold text-navy-700">{formatUSD(l.dailyRateCents)}/day</span>
            </div>
            <div className="text-xs text-slate-400">
              {l.assetType} · {l.location ?? "—"}
            </div>
            {l.description && <p className="mt-1 text-sm text-slate-500">{l.description}</p>}
            <button onClick={() => lease(l.id)} className={`${primary} mt-2`}>
              Lease
            </button>
          </div>
        ))}
        {listings.length === 0 && <p className="text-sm text-slate-400">No equipment available right now.</p>}
      </div>
    </section>
  );
}

function MyListings() {
  const [form, setForm] = useState({ title: "", assetType: "TRAILER", dailyRate: "", location: "", description: "" });
  const [mine, setMine] = useState<Array<{ id: string; title: string; assetType: string; dailyRateCents: number; available: boolean; leaseCount: number }>>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get<{ listings: typeof mine }>("/api/equipment/my-listings");
      setMine(res.listings);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setErr(null);
    try {
      await api.post("/api/equipment/listings", {
        title: form.title,
        assetType: form.assetType,
        dailyRateCents: Math.round(Number(form.dailyRate) * 100),
        location: form.location || undefined,
        description: form.description || undefined,
      });
      setForm({ title: "", assetType: "TRAILER", dailyRate: "", location: "", description: "" });
      void load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Create failed");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">List your equipment</h2>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input className={`${input} w-44`} placeholder="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <select className={input} value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })}>
          {ASSET_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input className={`${input} w-28`} placeholder="$/day" value={form.dailyRate} onChange={(e) => setForm({ ...form, dailyRate: e.target.value })} />
        <input className={`${input} w-36`} placeholder="location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <button onClick={create} disabled={!form.title || !form.dailyRate} className={primary}>
          List
        </button>
      </div>
      <ul className="mt-4 space-y-2">
        {mine.map((l) => (
          <li key={l.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 text-sm">
            <span className="font-medium">{l.title}</span>
            <span className="text-slate-400">{l.assetType}</span>
            <span className="text-slate-500">{formatUSD(l.dailyRateCents)}/day</span>
            <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${l.available ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {l.available ? "available" : `leased (${l.leaseCount})`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MyLeases() {
  const [leases, setLeases] = useState<MyLeaseRow[]>([]);
  useEffect(() => {
    api.get<{ leases: MyLeaseRow[] }>("/api/equipment/my-leases").then(
      (r) => setLeases(r.leases),
      () => setLeases([])
    );
  }, []);
  if (leases.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">My leases</h2>
      <ul className="mt-3 space-y-2">
        {leases.map((l) => (
          <li key={l.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 text-sm">
            <span className="font-medium">{l.title}</span>
            <span className="text-slate-500">{formatUSD(l.rateCents)}/day</span>
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs">{l.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
