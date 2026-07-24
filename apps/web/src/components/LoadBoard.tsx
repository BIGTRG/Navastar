// Module 7 — Load board. Carriers (with an active subscription) browse open
// overflow loads and bid; ops posts booked shipments and awards bids (which
// assigns the load + charges the per-load connection fee).
import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  formatUSD,
  type LoadBoardResponse,
  type LoadPostRow,
  type LoadBidRow,
  type DispatchQueueItem,
} from "../api.js";

const primary = "rounded-lg bg-navy-600 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

export function LoadBoard({ canPost, canBid }: { canPost: boolean; canBid: boolean }) {
  return (
    <div className="space-y-6">
      {canPost && <OpsLoadPanel />}
      {canBid && <CarrierLoadPanel />}
    </div>
  );
}

// ── Ops: post booked shipments, view bids, award ──
function OpsLoadPanel() {
  const [postable, setPostable] = useState<DispatchQueueItem[]>([]);
  const [board, setBoard] = useState<LoadBoardResponse | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const [queue, b] = await Promise.all([
        api.get<{ queue: DispatchQueueItem[] }>("/api/dispatch/queue"),
        api.get<LoadBoardResponse>("/api/loadboard/posts"),
      ]);
      setPostable(queue.queue);
      setBoard(b);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function post(shipmentId: string) {
    setMsg(null);
    try {
      await api.post("/api/loadboard/posts", { shipmentId });
      setMsg("Posted to the load board.");
      void load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Post failed");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Load board — ops</h2>
      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Post overflow (booked, unassigned)</div>
        {postable.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing to post. Book a shipment first.</p>
        ) : (
          <ul className="space-y-2">
            {postable.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
                <span>
                  <span className="font-medium">{s.cargo ?? s.commodityType}</span>{" "}
                  <span className="text-slate-400">
                    {s.trackingId} · {s.origin} → {s.dest}
                  </span>
                </span>
                <button onClick={() => post(s.id)} className={secondary}>
                  Post to board
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Open loads & bids</div>
        {board && board.posts.length === 0 && <p className="text-sm text-slate-400">No open loads.</p>}
        <div className="space-y-3">
          {board?.posts.map((p) => (
            <OpsPostRow key={p.id} post={p} onAwarded={load} />
          ))}
        </div>
      </div>
    </section>
  );
}

function OpsPostRow({ post, onAwarded }: { post: LoadPostRow; onAwarded: () => void }) {
  const [bids, setBids] = useState<LoadBidRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadBids() {
    try {
      const res = await api.get<{ bids: LoadBidRow[] }>(`/api/loadboard/posts/${post.id}/bids`);
      setBids(res.bids);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load bids");
    }
  }
  async function award(bidId: string) {
    try {
      await api.post(`/api/loadboard/bids/${bidId}/award`);
      onAwarded();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Award failed");
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium">{post.cargo ?? post.commodityType}</span>{" "}
          <span className="text-slate-400">
            {post.trackingId} · {post.origin} → {post.dest} · {post.bidCount} bid(s)
          </span>
        </div>
        <button onClick={loadBids} className={secondary}>
          {bids ? "Refresh bids" : "View bids"}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {bids && (
        <ul className="mt-3 space-y-1">
          {bids.length === 0 && <li className="text-xs text-slate-400">No bids yet.</li>}
          {bids.map((b) => (
            <li key={b.id} className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-navy-700">{formatUSD(b.amountCents)}</span>
              <span className="text-slate-500">{b.carrier?.name ?? "—"}</span>
              {b.carrier && <span className="text-xs text-slate-400">trust {b.carrier.trust}</span>}
              {b.status === "PENDING" ? (
                <button onClick={() => award(b.id)} className={`${primary} ml-auto px-3 py-1`}>
                  Award
                </button>
              ) : (
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs">{b.status}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Carrier: subscription + browse + bid ──
function CarrierLoadPanel() {
  const [board, setBoard] = useState<LoadBoardResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      setBoard(await api.get<LoadBoardResponse>("/api/loadboard/posts"));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function subscribe() {
    try {
      await api.post("/api/loadboard/subscribe", { tier: "PRO" });
      setMsg("Subscribed to PRO. You can bid now.");
      void load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Subscribe failed");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Load board</h2>
        {board?.subscription && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            {board.subscription.tier} · {board.subscription.status}
          </span>
        )}
      </div>
      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      {board?.needsSubscription ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">A load-board subscription is required to view and bid on overflow loads.</p>
          <button onClick={subscribe} className={`${primary} mt-3`}>
            Subscribe to PRO — $99/mo
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {board?.posts.length === 0 && <p className="text-sm text-slate-400">No open loads right now.</p>}
          {board?.posts.map((p) => (
            <BidRow key={p.id} post={p} onBid={load} />
          ))}
        </div>
      )}
    </section>
  );
}

function BidRow({ post, onBid }: { post: LoadPostRow; onBid: () => void }) {
  const [amount, setAmount] = useState(post.targetPayoutCents ? String(post.targetPayoutCents / 100) : "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function bid() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/loadboard/posts/${post.id}/bids`, { amountCents: Math.round(Number(amount) * 100) });
      onBid();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Bid failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{post.cargo ?? post.commodityType}</span>{" "}
          <span className="text-slate-400">
            {post.origin} → {post.dest} · {post.bidCount} bid(s)
          </span>
          {post.targetPayoutCents != null && (
            <span className="ml-2 text-xs text-slate-500">target {formatUSD(post.targetPayoutCents)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {post.myBidCents != null && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">your bid {formatUSD(post.myBidCents)}</span>
          )}
          <span className="text-slate-400">$</span>
          <input
            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="bid"
          />
          <button onClick={bid} disabled={busy || !amount} className={primary}>
            {post.myBidCents != null ? "Update bid" : "Bid"}
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  );
}
