import { describe, expect, it } from "vitest";
import { newUserInputSchema, updateUserInputSchema } from "./validation";

describe("user administration validation", () => {
  it("normalizes email, requires a strong password on create, and validates roles", () => {
    expect(newUserInputSchema.parse({ name: "  Kasir  ", email: "CASHIER@CAFE.LOCAL", password: "LongEnough!42", role: "CASHIER" })).toMatchObject({ name: "Kasir", email: "cashier@cafe.local", role: "CASHIER" });
    expect(newUserInputSchema.safeParse({ name: "User", email: "bad", password: "123", role: "OWNER" }).success).toBe(false);
    expect(updateUserInputSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111", name: "User", email: "u@example.test", role: "KITCHEN", isActive: true, password: "" }).success).toBe(true);
  });
});
