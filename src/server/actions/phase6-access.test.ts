import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/local-preview", () => ({ isLocalPreviewMode: () => false }));
vi.mock("@/lib/auth/guards", () => ({ requireRouteAccess: vi.fn() }));
import { requireRouteAccess } from "@/lib/auth/guards";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { createExpenseAction } from "./expenses";
import { createUserAction } from "./users";
import { saveCafeSettingsAction } from "./settings";
import { openCashSessionAction } from "./cash-session";

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
import { canAccessRoute } from "@/lib/permissions/roles";

describe("Phase 6 and 7 server action authorization", () => {
  it("rejects direct manager, cashier, and kitchen calls to owner-only or finance actions", async () => {
    currentRole = "MANAGER";
    await expect(createUserAction({ message: "" }, new FormData())).rejects.toThrow("Unauthorized");
    await expect(saveCafeSettingsAction({ message: "" }, new FormData())).rejects.toThrow("Unauthorized");
    currentRole = "CASHIER";
    await expect(createExpenseAction({ message: "" }, new FormData())).rejects.toThrow("Unauthorized");
    currentRole = "KITCHEN";
    await expect(openCashSessionAction({ message: "" }, new FormData())).rejects.toThrow("Unauthorized");
  });

  it("allows cashiers to reach session validation and managers to reach expense/settings route checks", async () => {
    currentRole = "CASHIER";
    expect((await openCashSessionAction({ message: "" }, new FormData())).error).toBe(true);
    expect(requireRouteAccess).toHaveBeenLastCalledWith("cash-session");
    currentRole = "MANAGER";
    expect((await createExpenseAction({ message: "" }, new FormData())).error).toBe(true);
    expect(requireRouteAccess).toHaveBeenLastCalledWith("expenses");
  });
});
