import { describe, expect, it } from "vitest";
import { canTransitionOrder } from "./workflow";

describe("order workflow permissions", () => {
  it("allows kitchen and owner to start and ready paid orders", () => {
    expect(canTransitionOrder("CONFIRMED", "PREPARING", "KITCHEN")).toBe(true);
    expect(canTransitionOrder("PREPARING", "READY", "OWNER")).toBe(true);
  });

  it("allows owner or cashier to complete a ready order", () => {
    expect(canTransitionOrder("READY", "COMPLETED", "CASHIER")).toBe(true);
    expect(canTransitionOrder("READY", "COMPLETED", "OWNER")).toBe(true);
  });

  it("rejects skipped, backwards, refund, and role-forbidden transitions", () => {
    expect(canTransitionOrder("CONFIRMED", "READY", "KITCHEN")).toBe(false);
    expect(canTransitionOrder("READY", "PREPARING", "KITCHEN")).toBe(false);
    expect(canTransitionOrder("COMPLETED", "PREPARING", "OWNER")).toBe(false);
    expect(canTransitionOrder("READY", "REFUNDED", "OWNER")).toBe(false);
    expect(canTransitionOrder("CONFIRMED", "PREPARING", "CASHIER")).toBe(false);
    expect(canTransitionOrder("READY", "COMPLETED", "KITCHEN")).toBe(false);
  });
});
