import { describe, expect, it } from "vitest";
import { canAccessRoute } from "./roles";
import { navigationForRole } from "./navigation";

describe("role route permissions", () => {
  it("allows managers and owners to view the dashboard", () => {
    expect(canAccessRoute("OWNER", "dashboard")).toBe(true);
    expect(canAccessRoute("MANAGER", "dashboard")).toBe(true);
  });

  it("keeps cashier and kitchen roles out of the dashboard", () => {
    expect(canAccessRoute("CASHIER", "dashboard")).toBe(false);
    expect(canAccessRoute("KITCHEN", "dashboard")).toBe(false);
  });

  it("grants only the routes assigned to each role", () => {
    expect(canAccessRoute("CASHIER", "pos")).toBe(true);
    expect(canAccessRoute("CASHIER", "inventory")).toBe(false);
    expect(canAccessRoute("KITCHEN", "kitchen")).toBe(true);
    expect(canAccessRoute("KITCHEN", "orders")).toBe(false);
    expect(canAccessRoute("MANAGER", "settings")).toBe(false);
  });

  it("limits category, product, and add-on management to owners and managers", () => {
    for (const role of ["OWNER", "MANAGER"] as const) {
      expect(canAccessRoute(role, "categories")).toBe(true);
      expect(canAccessRoute(role, "products")).toBe(true);
      expect(canAccessRoute(role, "addons")).toBe(true);
    }
    for (const role of ["CASHIER", "KITCHEN"] as const) {
      expect(canAccessRoute(role, "categories")).toBe(false);
      expect(canAccessRoute(role, "products")).toBe(false);
      expect(canAccessRoute(role, "addons")).toBe(false);
    }
  });

  it("allows cashier use of POS and orders but restricts discount management to owner and manager", () => {
    expect(canAccessRoute("CASHIER", "pos")).toBe(true);
    expect(canAccessRoute("CASHIER", "orders")).toBe(true);
    expect(canAccessRoute("OWNER", "discounts")).toBe(true);
    expect(canAccessRoute("MANAGER", "discounts")).toBe(true);
    expect(canAccessRoute("CASHIER", "discounts")).toBe(false);
    expect(canAccessRoute("KITCHEN", "pos")).toBe(false);
    expect(canAccessRoute("KITCHEN", "orders")).toBe(false);
  });

  it("shows the implemented catalog navigation only to owners and managers", () => {
    for (const role of ["OWNER", "MANAGER"] as const) {
      const navigation = navigationForRole(role);
      expect(navigation.find((item) => item.route === "categories")?.available).toBe(true);
      expect(navigation.find((item) => item.route === "products")?.available).toBe(true);
      expect(navigation.find((item) => item.route === "addons")?.available).toBe(true);
    }
    for (const role of ["CASHIER", "KITCHEN"] as const) {
      const navigation = navigationForRole(role);
      expect(navigation.some((item) => ["categories", "products", "addons"].includes(item.route))).toBe(false);
    }
  });

  it("marks POS, orders, and discount management available only to assigned roles", () => {
    expect(navigationForRole("CASHIER").find((item) => item.route === "pos")?.available).toBe(true);
    expect(navigationForRole("CASHIER").find((item) => item.route === "orders")?.available).toBe(true);
    expect(navigationForRole("CASHIER").some((item) => item.route === "discounts")).toBe(false);
    expect(navigationForRole("OWNER").find((item) => item.route === "discounts")?.available).toBe(true);
    expect(navigationForRole("KITCHEN").some((item) => item.route === "pos")).toBe(false);
  });

  it("restricts table management to owner and cashier, and kitchen display to owner and kitchen", () => {
    for (const role of ["OWNER", "CASHIER"] as const) expect(canAccessRoute(role, "tables")).toBe(true);
    for (const role of ["MANAGER", "KITCHEN"] as const) expect(canAccessRoute(role, "tables")).toBe(false);
    for (const role of ["OWNER", "KITCHEN"] as const) expect(canAccessRoute(role, "kitchen")).toBe(true);
    for (const role of ["MANAGER", "CASHIER"] as const) expect(canAccessRoute(role, "kitchen")).toBe(false);
    expect(navigationForRole("CASHIER").find((item) => item.route === "tables")?.available).toBe(true);
    expect(navigationForRole("KITCHEN").find((item) => item.route === "kitchen")?.available).toBe(true);
  });

  it("enforces Phase 6 and owner-only Phase 7 access", () => {
    for (const role of ["OWNER", "MANAGER", "CASHIER"] as const) expect(canAccessRoute(role, "customers")).toBe(true);
    for (const role of ["OWNER", "MANAGER"] as const) {
      expect(canAccessRoute(role, "expenses")).toBe(true);
      expect(canAccessRoute(role, "reports")).toBe(true);
      expect(canAccessRoute(role, "audit-logs")).toBe(true);
    }
    for (const role of ["CASHIER", "KITCHEN"] as const) {
      expect(canAccessRoute(role, "expenses")).toBe(false);
      expect(canAccessRoute(role, "reports")).toBe(false);
      expect(canAccessRoute(role, "audit-logs")).toBe(false);
    }
    expect(canAccessRoute("CASHIER", "cash-session")).toBe(true);
    expect(canAccessRoute("KITCHEN", "cash-session")).toBe(false);
    expect(canAccessRoute("OWNER", "users")).toBe(true);
    expect(canAccessRoute("MANAGER", "users")).toBe(false);
    expect(canAccessRoute("MANAGER", "settings")).toBe(false);
  });
});
