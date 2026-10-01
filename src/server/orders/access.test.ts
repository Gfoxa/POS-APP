import { describe, expect, it } from "vitest";
import { canViewOrder } from "./access";

describe("order visibility", () => {
  it("limits cashiers to receipts for their own orders", () => {
    expect(canViewOrder("CASHIER", "cashier-a", "cashier-a")).toBe(true);
    expect(canViewOrder("CASHIER", "cashier-a", "cashier-b")).toBe(false);
  });

  it("allows owners and managers to review orders while denying kitchen", () => {
    expect(canViewOrder("OWNER", "owner", "cashier-a")).toBe(true);
    expect(canViewOrder("MANAGER", "manager", "cashier-a")).toBe(true);
    expect(canViewOrder("KITCHEN", "kitchen", "cashier-a")).toBe(false);
  });
});
