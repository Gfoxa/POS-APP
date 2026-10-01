import { describe, expect, it } from "vitest";
import { expenseInputSchema, cashSessionInputSchema } from "./validation";

describe("finance input validation", () => {
  it("accepts positive IDR expenses and rejects malformed amounts", () => {
    const valid = { cashSessionId: "11111111-1111-4111-8111-111111111111", category: "Operasional", description: "Listrik", amount: "125000.50", paymentMethod: "CASH", incurredAt: "2026-10-01" };
    expect(expenseInputSchema.safeParse(valid).success).toBe(true);
    expect(expenseInputSchema.safeParse({ ...valid, amount: "0" }).success).toBe(false);
    expect(expenseInputSchema.safeParse({ ...valid, amount: "12,5" }).success).toBe(false);
  });

  it("requires nonnegative opening cash and validates closing cash", () => {
    expect(cashSessionInputSchema.safeParse({ openingCash: "1000000" }).success).toBe(true);
    expect(cashSessionInputSchema.safeParse({ openingCash: "-1" }).success).toBe(false);
    expect(cashSessionInputSchema.safeParse({ openingCash: "100", actualClosingCash: "abc" }).success).toBe(false);
  });
});
