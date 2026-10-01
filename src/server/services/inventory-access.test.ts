import { describe, expect, it } from "vitest";
import { canAccessRoute } from "@/lib/permissions/roles";
import { navigationForRole } from "@/lib/permissions/navigation";

describe("inventory access boundary", () => {
  it("allows only owner and manager roles to reach inventory", () => {
    expect(canAccessRoute("OWNER", "inventory")).toBe(true);
    expect(canAccessRoute("MANAGER", "inventory")).toBe(true);
    expect(canAccessRoute("CASHIER", "inventory")).toBe(false);
    expect(canAccessRoute("KITCHEN", "inventory")).toBe(false);
  });

  it("publishes inventory navigation only once its protected routes exist", () => {
    expect(navigationForRole("OWNER").find((item) => item.route === "inventory")?.available).toBe(true);
    expect(navigationForRole("CASHIER").some((item) => item.route === "inventory")).toBe(false);
  });
});
