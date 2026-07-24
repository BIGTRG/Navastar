// Integration tests — the real end-to-end flows against a REAL Postgres.
// Run:  createdb + `TEST_DATABASE_URL=postgresql://… pnpm --filter @navastar/db push \
//        && pnpm --filter @navastar/db seed && TEST_DATABASE_URL=… pnpm --filter @navastar/api test`
// Without TEST_DATABASE_URL these self-skip (so the default suite needs no DB).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/server.js";

const HAS_DB = !!process.env.TEST_DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

async function login(app: FastifyInstance, email: string, password = "password123") {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed for ${email}: ${res.statusCode} ${res.body}`);
  return (res.json() as { token: string }).token;
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

d("integration — auction intake → quote → book → track (+ authz)", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("runs the full customer flow and enforces ownership", async () => {
    const buyer = await login(app, "buyer@demo.navastar");
    const lotId = `IT-${Date.now()}`;

    // 1. Intake a won lot → draft shipment.
    const intake = await app.inject({
      method: "POST",
      url: "/api/auction/lots",
      headers: auth(buyer),
      payload: { partnerCode: "BIDNOW", externalLotId: lotId, vin: "1HGCM82633A004352", make: "Honda", model: "Accord", location: "Dallas, TX", lat: 32.7767, lng: -96.797 },
    });
    expect(intake.statusCode).toBe(201);
    const { shipmentId, trackingId } = intake.json() as { shipmentId: string; trackingId: string };
    expect(trackingId).toMatch(/^NAV-/);

    // 2. AI quote.
    const quote = await app.inject({
      method: "POST",
      url: "/api/quotes",
      headers: auth(buyer),
      payload: { shipmentId, dropoff: { lat: 30.2672, lng: -97.7431 } },
    });
    expect(quote.statusCode).toBe(201);
    const q = quote.json() as { quoteId: string; priceCents: number; ai: { confidence: number } };
    expect(q.priceCents).toBeGreaterThan(0);
    expect(q.ai.confidence).toBeGreaterThan(0);

    // 3. Book → tracking id.
    const book = await app.inject({ method: "POST", url: `/api/shipments/${shipmentId}/book`, headers: auth(buyer), payload: { quoteId: q.quoteId } });
    expect(book.statusCode).toBe(200);
    expect((book.json() as { status: string }).status).toBe("BOOKED");

    // 4. Owner can read it.
    const read = await app.inject({ method: "GET", url: `/api/shipments/${shipmentId}`, headers: auth(buyer) });
    expect(read.statusCode).toBe(200);

    // 5. AUTHZ: a driver who isn't assigned and isn't the owner is denied (P0 #1).
    const driver = await login(app, "driver@demo.navastar");
    const denied = await app.inject({ method: "GET", url: `/api/shipments/${shipmentId}`, headers: auth(driver) });
    expect(denied.statusCode).toBe(403);

    // 6. Ops (SHIPMENT_READ_ALL) may read any shipment.
    const dispatch = await login(app, "dispatch@demo.navastar");
    const opsRead = await app.inject({ method: "GET", url: `/api/shipments/${shipmentId}`, headers: auth(dispatch) });
    expect(opsRead.statusCode).toBe(200);

    // 7. Payments: init escrow (up-front fee) and verify the state machine.
    const initEscrow = await app.inject({ method: "POST", url: `/api/payments/shipments/${shipmentId}/init-escrow`, headers: auth(dispatch) });
    expect(initEscrow.statusCode).toBe(200);
    const pay = await app.inject({ method: "GET", url: `/api/payments/shipments/${shipmentId}`, headers: auth(dispatch) });
    const payBody = pay.json() as { escrow: { state: string } | null; payments: Array<{ memo: string | null }> };
    expect(payBody.escrow?.state).toBe("FUNDS_HELD");
    expect(payBody.payments.some((p) => p.memo === "booking_fee_up_front")).toBe(true);
  });

  it("rejects a disabled commodity via the rules engine (Live Animals OFF)", async () => {
    const buyer = await login(app, "buyer@demo.navastar");
    const res = await app.inject({
      method: "POST",
      url: "/api/shipments",
      headers: auth(buyer),
      payload: { commodityType: "LIVE_ANIMALS", description: "livestock", pickup: { lat: 32.7, lng: -96.8 }, dropoff: { lat: 30.2, lng: -97.7 } },
    });
    expect(res.statusCode).toBe(409);
  });

  it("verifies the hash-chained custody export for a booked shipment", async () => {
    const dispatch = await login(app, "dispatch@demo.navastar");
    const buyer = await login(app, "buyer@demo.navastar");
    const intake = await app.inject({
      method: "POST",
      url: "/api/auction/lots",
      headers: auth(buyer),
      payload: { partnerCode: "BIDNOW", externalLotId: `IT-CUS-${Date.now()}`, vin: "5YJ3E1EA7KF317654", make: "Tesla", model: "3", location: "Phoenix, AZ", lat: 33.4484, lng: -112.074 },
    });
    const { trackingId } = intake.json() as { trackingId: string };
    const verify = await app.inject({ method: "GET", url: `/api/custody/shipments/${trackingId}/verify`, headers: auth(dispatch) });
    expect(verify.statusCode).toBe(200);
    expect((verify.json() as { ok: boolean }).ok).toBe(true);
  });
});
