import { describe, expect, it } from "vitest";
import { formatIdr, formatIdrUnitCost } from "@/lib/utils/format";

describe("formatIdr", () => {
  it("keeps nonzero rupiah fractions visible without changing whole amounts", () => {
    expect(formatIdr("1110.01")).toBe("Rp 1.110,01");
    expect(formatIdr("1110.10")).toBe("Rp 1.110,1");
    expect(formatIdr("1110.00")).toBe("Rp 1.110");
  });
});

it("keeps four decimal places when displaying ingredient unit cost", () => {
  expect(formatIdrUnitCost("0.1250")).toBe("Rp 0,1250");
  expect(formatIdrUnitCost("12345.6789")).toBe("Rp 12.345,6789");
});
