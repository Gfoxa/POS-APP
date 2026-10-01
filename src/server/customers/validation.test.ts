import { describe, expect, it } from "vitest";
import { customerInputSchema } from "./validation";

describe("customer input validation", () => {
  it("normalizes optional contact fields and bounds names", () => {
    expect(customerInputSchema.parse({ name: "  Rani  ", phone: "", email: "", notes: "" })).toMatchObject({ name: "Rani", phone: null, email: null, notes: null });
    expect(customerInputSchema.safeParse({ name: " ", phone: "", email: "" }).success).toBe(false);
    expect(customerInputSchema.safeParse({ name: "Rani", phone: "", email: "not-an-email" }).success).toBe(false);
  });
});
