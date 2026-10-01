import { describe, expect, it } from "vitest";
import { cafeSettingsInputSchema } from "./validation";

describe("cafe settings validation", () => {
  it("normalizes identity fields and bounds tax/service percentages", () => {
    expect(cafeSettingsInputSchema.parse({ name: " Kopi Sore ", address: "", phone: "", taxRate: "11", serviceChargeRate: "2.5" })).toMatchObject({ name: "Kopi Sore", address: null, phone: null, taxRateBasisPoints: 1100, serviceChargeRateBasisPoints: 250 });
    expect(cafeSettingsInputSchema.safeParse({ name: "Cafe", address: "", phone: "", taxRate: "100.01", serviceChargeRate: "0" }).success).toBe(false);
    expect(cafeSettingsInputSchema.safeParse({ name: "Cafe", address: "", phone: "", taxRate: "abc", serviceChargeRate: "0" }).success).toBe(false);
  });
});
