// BaseConnector: sensible defaults so most adapters are ~10 lines. Override
// `normalize` when a partner uses non-standard field names in its raw payload.
import type { AuctionPartnerCode } from "@navastar/db";
import type {
  AuctionConnector,
  NormalizedLot,
  RawLotInput,
  StatusPushInput,
  WidgetConfig,
} from "./types.js";

export abstract class BaseConnector implements AuctionConnector {
  abstract code: AuctionPartnerCode;
  abstract name: string;

  normalize(input: RawLotInput): NormalizedLot {
    // Default: trust already-normalized top-level fields, fall back to raw[key].
    const raw = input.raw ?? {};
    const pick = <T>(top: T | undefined, ...rawKeys: string[]): T | undefined => {
      if (top !== undefined && top !== null) return top;
      for (const k of rawKeys) {
        const v = (raw as Record<string, unknown>)[k];
        if (v !== undefined && v !== null) return v as T;
      }
      return undefined;
    };
    return {
      externalLotId: input.externalLotId,
      vin: pick(input.vin, "vin", "VIN"),
      make: pick(input.make, "make", "Make"),
      model: pick(input.model, "model", "Model"),
      year: pick(input.year, "year", "Year"),
      title: pick(input.title, "title", "description"),
      salePriceCents: pick(input.salePriceCents, "salePriceCents"),
      buyerName: pick(input.buyerName, "buyerName", "buyer"),
      buyerEmail: pick(input.buyerEmail, "buyerEmail", "buyer_email"),
      location: pick(input.location, "location", "yardLocation"),
      lat: pick(input.lat, "lat", "latitude"),
      lng: pick(input.lng, "lng", "longitude"),
      raw: input.raw,
    };
  }

  async pushStatus(input: StatusPushInput): Promise<{ ok: boolean; detail?: string }> {
    // MVP: log the callback we WOULD make to the partner. Real adapters POST here.
    // eslint-disable-next-line no-console
    console.log(
      `[connector:${this.code}] pushStatus lot=${input.externalLotId} tracking=${input.trackingId} status=${input.status}`
    );
    return { ok: true, detail: "stubbed" };
  }

  widget(): WidgetConfig {
    return {
      label: "Deliver with Navastar",
      accent: "#1e40af",
      intakePathTemplate: `/deliver?partner=${this.code}&lot={externalLotId}`,
    };
  }
}
