// Tiny typed API client. Token lives in localStorage; every call is same-origin
// (Vite proxies /api → API in dev).
const TOKEN_KEY = "navastar.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, (json && (json.message || json.error)) || res.statusText, json);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
};

// ── Response shapes (mirror the API) ──
export interface LoginResponse {
  token: string;
  user: { userId: string; email: string; name: string; roles: string[] };
}
export interface IntakeResponse {
  shipmentId: string;
  trackingId: string;
  status: string;
  auctionLotId: string;
  lot: { vin?: string; make?: string; model?: string; year?: number; title?: string; location?: string };
  deliverWithNavastar: { label: string; accent?: string; intakePathTemplate: string };
}
export interface QuoteResponse {
  quoteId: string;
  shipmentId: string;
  priceCents: number;
  currency: string;
  distanceMiles: number;
  etaAt: string;
  breakdown: { baseCents: number; perMileCents: number; surchargesCents: number };
  ai: {
    model: string;
    version: string;
    confidence: number;
    needsHumanReview: boolean;
    decidedBy: string;
    qaStatus: string;
  };
}
export interface BookResponse {
  shipmentId: string;
  trackingId: string;
  status: string;
  etaAt: string | null;
}
export interface ShipmentView {
  shipment: {
    trackingId: string;
    status: string;
    quotedPriceCents: number | null;
    distanceMiles: number | null;
    etaAt: string | null;
  };
  cargo: Array<{ description: string; vin?: string; make?: string; model?: string; year?: number }>;
  pickup: { name: string; city: string | null } | null;
  dropoff: { name: string; city: string | null } | null;
  auction: { partner: string; externalLotId: string } | null;
  timeline: Array<{ sequence: number; type: string; at: string; hash: string }>;
}

export function formatUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
