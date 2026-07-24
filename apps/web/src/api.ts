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

export interface TrackPoint {
  lat: number;
  lng: number;
  at: string;
}
export interface TrackData {
  shipmentId: string;
  trackingId: string;
  status: string;
  etaAt: string | null;
  simulating: boolean;
  pickup: { name: string; lat: number; lng: number } | null;
  dropoff: { name: string; lat: number; lng: number } | null;
  current: TrackPoint | null;
  points: TrackPoint[];
}

/** Live-tracking WebSocket message (server → client). */
export interface LiveMessage {
  type: "connected" | "tracking.point" | "shipment.status";
  shipmentId?: string;
  lat?: number;
  lng?: number;
  etaAt?: string | null;
  status?: string;
  remainingMiles?: number | null;
}

/** Build the WS URL for a shipment's live stream (token in query). */
export function liveSocketUrl(shipmentId: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws/shipments/${encodeURIComponent(shipmentId)}?token=${getToken() ?? ""}`;
}

// ── Module 3 — driver / media ──
export interface DriverJob {
  trackingId: string;
  status: string;
  cargo: Array<{ description: string; vin?: string | null; odometer?: number | null }>;
  pickup: { name: string; city: string | null; lat: number | null; lng: number | null } | null;
  dropoff: { name: string; city: string | null } | null;
  id?: string;
}
export interface Finding {
  id?: string;
  panel?: string;
  kind: string;
  severity: "INFO" | "MINOR" | "MODERATE" | "MAJOR" | "CRITICAL";
  note?: string;
  source: "ai" | "human";
  confidence?: number;
}
export interface InspectionResponse {
  inspectionId: string;
  conditionScore: number | null;
  findings: Finding[];
  ai: { model: string; version: string; confidence: number; needsHumanReview: boolean; decidedBy: string; qaStatus: string };
}
export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  method: "PUT";
  headers?: Record<string, string>;
}

/** Presign → PUT bytes directly to storage (MinIO/S3). Returns the object key. */
export async function uploadMedia(shipmentId: string, kind: string, file: File | Blob, filename: string): Promise<string> {
  const mimeType = (file as File).type || "application/octet-stream";
  const presigned = await api.post<PresignedUpload>("/api/uploads/presign", { shipmentId, kind, filename, mimeType });
  const put = await fetch(presigned.uploadUrl, { method: "PUT", headers: presigned.headers, body: file });
  if (!put.ok) throw new ApiError(put.status, `Upload failed (${put.status}). Is MinIO running + CORS allowed?`);
  return presigned.key;
}

// ── Module 4 — ops ──
export interface OpsKpis {
  activeShipments: number;
  delivered: number;
  exceptions: number;
  pendingReview: number;
  driversActive: number;
  gmvCents: number;
  revenueCents: number;
  blendedTakeRateBps: number;
  avgAiConfidence: number | null;
}
export interface OpsShipmentRow {
  id: string;
  trackingId: string;
  status: string;
  commodityType: string;
  quotedPriceCents: number | null;
  marginCents?: number;
  origin: string | null;
  dest: string | null;
  createdAt: string;
}
export interface FleetDriver {
  id: string;
  name: string;
  type: string;
  kind: "fleet" | "contractor";
  carrier: string;
  lat: number | null;
  lng: number | null;
  lastSeenAt: string | null;
  roaming: boolean;
}
export interface OpsException {
  type: "status_exception" | "needs_human_review";
  shipmentId: string | null;
  trackingId: string | null;
  detail: string;
  at: string;
}
export interface OpsLiveMessage {
  type: "connected" | "driver.location";
  driverId?: string;
  lat?: number;
  lng?: number;
  name?: string;
}

// ── Module 5 — QA ──
export interface QaQueueItem {
  inspectionId: string;
  shipmentId: string;
  trackingId: string;
  type: string;
  conditionScore: number | null;
  findingsCount: number;
  approved: boolean;
  aiConfidence: number | null;
  needsHumanReview: boolean;
  createdAt: string;
}
export interface QaQueue {
  counts: { pending: number; pass: number; fix: number; fail: number };
  queue: QaQueueItem[];
}
export interface QaDetail {
  inspection: { id: string; type: string; conditionScore: number | null; qaStatus: string; approvedByUserId: string | null };
  findings: Array<{ panel?: string; kind: string; severity: string; note?: string; source: "ai" | "human"; confidence?: number }>;
  ai: { model: string; version: string; confidence: number; needsHumanReview: boolean; qaStatus: string; approvedByUserId: string | null } | null;
  cargo: Array<{ description: string; vin?: string | null; odometer?: number | null }>;
  custody: {
    ok: boolean;
    length: number;
    brokenAtSequence: number | null;
    events: Array<{ sequence: number; type: string; at: string; hash: string }>;
  };
  documents: Array<{ id: string; type: string; url: string }>;
}
export interface QaReliabilityRow {
  id: string;
  name: string;
  type: string;
  trustScore: number;
  carrier: string;
  carrierTrust: number | null;
  reviewed: number;
  passRate: number | null;
}

export function opsSocketUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws/ops?token=${getToken() ?? ""}`;
}

export function formatUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
