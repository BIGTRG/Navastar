import { describe, it, expect } from "vitest";
import { AuctionPartnerCode } from "@navastar/db";
import { getConnector, listConnectors } from "./registry.js";

describe("auction connector registry", () => {
  it("registers all seven partners", () => {
    expect(listConnectors()).toHaveLength(7);
  });

  it("resolves a launch partner and renders the widget", () => {
    const c = getConnector(AuctionPartnerCode.BIDNOW);
    expect(c.name).toBe("BidNow");
    expect(c.widget().label).toBe("Deliver with Navastar");
    expect(c.widget().intakePathTemplate).toContain("BIDNOW");
  });

  it("Copart adapter maps partner-specific raw fields (lot_number, vehicle.vin)", () => {
    const c = getConnector(AuctionPartnerCode.COPART);
    const lot = c.normalize({
      externalLotId: "",
      raw: { lot_number: "44556677", vehicle: { vin: "1FTFW1ET5DFA00001", make: "Ford", model: "F-150", year: 2021 } },
    });
    expect(lot.externalLotId).toBe("44556677");
    expect(lot.vin).toBe("1FTFW1ET5DFA00001");
    expect(lot.make).toBe("Ford");
  });

  it("throws for an unregistered code", () => {
    // @ts-expect-error intentional bad code
    expect(() => getConnector("NOPE")).toThrow();
  });
});
