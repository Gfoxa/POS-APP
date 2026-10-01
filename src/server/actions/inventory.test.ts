import { vi, describe, expect, it, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/local-preview", () => ({ isLocalPreviewMode: () => false }));
vi.mock("@/lib/auth/guards", () => ({ requireRouteAccess: vi.fn() }));

import { requireRouteAccess } from "@/lib/auth/guards";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { canAccessRoute } from "@/lib/permissions/roles";
import { saveIngredientAction } from "./inventory";

const users: Record<string, AuthenticatedUser> = {
  OWNER: { id: "11111111-1111-4111-8111-111111111111", name: "Owner", email: "owner@cafe.local", role: "OWNER" },
  MANAGER: { id: "22222222-2222-4222-8222-222222222222", name: "Manager", email: "manager@cafe.local", role: "MANAGER" },
  CASHIER: { id: "33333333-3333-4333-8333-333333333333", name: "Cashier", email: "cashier@cafe.local", role: "CASHIER" },
  KITCHEN: { id: "44444444-4444-4444-8444-444444444444", name: "Kitchen", email: "kitchen@cafe.local", role: "KITCHEN" },
};
let currentRole: keyof typeof users = "OWNER";

beforeEach(() => {
  currentRole = "OWNER";
  vi.mocked(requireRouteAccess).mockImplementation(async (route) => {
    const user = users[currentRole];
    if (!canAccessRoute(user.role, route)) throw new Error("Unauthorized");
    return user;
  });
});

describe("inventory server action authorization", () => {
  it("blocks cashiers and kitchen users before parsing or calling the mutation", async () => {
    for (const role of ["CASHIER", "KITCHEN"] as const) {
      currentRole = role;
      await expect(saveIngredientAction({ message: "" }, new FormData())).rejects.toThrow("Unauthorized");
      expect(requireRouteAccess).toHaveBeenLastCalledWith("inventory");
    }
  });

  it("allows owner and manager actions to reach server-side validation", async () => {
    for (const role of ["OWNER", "MANAGER"] as const) {
      currentRole = role;
      const result = await saveIngredientAction({ message: "" }, new FormData());
      expect(result.error).toBe(true);
      expect(requireRouteAccess).toHaveBeenLastCalledWith("inventory");
    }
  });
});
