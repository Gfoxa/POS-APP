import { describe, expect, it } from "vitest";
import { canAccessRoute } from "@/lib/permissions/roles";
import { canTransitionOrder } from "@/server/orders/workflow";

describe("table and kitchen access policy", () => {
  it("grants table operations only to owner and cashier routes", () => {
    expect(canAccessRoute("OWNER", "tables")).toBe(true);
    expect(canAccessRoute("CASHIER", "tables")).toBe(true);
    expect(canAccessRoute("MANAGER", "tables")).toBe(false);
    expect(canAccessRoute("KITCHEN", "tables")).toBe(false);
  });

  it("allows kitchen roles to advance preparation but reserves completion for owner and cashier", () => {
    expect(canAccessRoute("OWNER", "kitchen")).toBe(true);
    expect(canAccessRoute("KITCHEN", "kitchen")).toBe(true);
    expect(canAccessRoute("MANAGER", "kitchen")).toBe(false);
    expect(canTransitionOrder("CONFIRMED", "PREPARING", "KITCHEN")).toBe(true);
    expect(canTransitionOrder("PREPARING", "READY", "KITCHEN")).toBe(true);
    expect(canTransitionOrder("READY", "COMPLETED", "KITCHEN")).toBe(false);
    expect(canTransitionOrder("READY", "COMPLETED", "CASHIER")).toBe(true);
  });
});
