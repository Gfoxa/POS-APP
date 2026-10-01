import { describe, expect, it } from "vitest";
import { calculateOrderTotals, validateTender } from "./calculation";

describe("order money calculation", () => {
  it("calculates subtotal, discount, 11% tax, service charge, and total exactly", () => {
    const totals = calculateOrderTotals({
      lines: [{ productId: "latte", quantity: 1, unitPrice: "100000.00", addons: [] }],
      discount: { name: "Potongan", type: "FIXED_AMOUNT", scope: "ORDER", value: "10000.00", maxAmount: null, productId: null },
      taxRateBasisPoints: 1100,
      serviceChargeRateBasisPoints: 0,
    });

    expect(totals).toMatchObject({ subtotal: "100000.00", discountAmount: "10000.00", taxable: "90000.00", taxAmount: "9900.00", serviceChargeAmount: "0.00", total: "99900.00" });
  });

  it("multiplies item and add-on prices by their quantities", () => {
    expect(calculateOrderTotals({
      lines: [{ productId: "latte", quantity: 2, unitPrice: "25000.00", addons: [{ unitPrice: "7000.00", quantity: 1 }] }],
      taxRateBasisPoints: 0,
      serviceChargeRateBasisPoints: 0,
    }).subtotal).toBe("64000.00");
  });

  it("applies product discounts only to matching products and respects maxAmount", () => {
    const result = calculateOrderTotals({
      lines: [
        { productId: "latte", quantity: 1, unitPrice: "50000.00", addons: [] },
        { productId: "cake", quantity: 1, unitPrice: "30000.00", addons: [] },
      ],
      discount: { name: "Latte 50% max 10000", type: "PERCENTAGE", scope: "PRODUCT", value: "50.00", maxAmount: "10000.00", productId: "latte" },
      taxRateBasisPoints: 0,
      serviceChargeRateBasisPoints: 0,
    });
    expect(result).toMatchObject({ subtotal: "80000.00", discountAmount: "10000.00", total: "70000.00" });
  });

  it("does not discount add-ons when a discount targets the base product", () => {
    const result = calculateOrderTotals({
      lines: [{ productId: "latte", quantity: 1, unitPrice: "10000.00", addons: [{ unitPrice: "8000.00", quantity: 1 }] }],
      discount: { name: "Product 50%", type: "PERCENTAGE", scope: "PRODUCT", value: "50.00", maxAmount: null, productId: "latte" },
      taxRateBasisPoints: 0,
      serviceChargeRateBasisPoints: 0,
    });
    expect(result).toMatchObject({ subtotal: "18000.00", discountAmount: "5000.00", total: "13000.00" });
  });

  it("rounds a half-cent percentage result half-up", () => {
    const result = calculateOrderTotals({
      lines: [{ productId: "item", quantity: 1, unitPrice: "0.01", addons: [] }],
      discount: { name: "Half", type: "PERCENTAGE", scope: "ORDER", value: "50.00", maxAmount: null, productId: null },
      taxRateBasisPoints: 0,
      serviceChargeRateBasisPoints: 0,
    });
    expect(result.discountAmount).toBe("0.01");
    expect(result.total).toBe("0.00");
  });

  it("computes cash change and rejects underpayment or non-cash overpayment", () => {
    expect(validateTender("CASH", "100000.00", "120000.00")).toEqual({ tenderedAmount: "120000.00", changeAmount: "20000.00" });
    expect(() => validateTender("CASH", "100000.00", "99999.99")).toThrow("underpayment");
    expect(validateTender("QRIS", "100000.00", "100000.00")).toEqual({ tenderedAmount: "100000.00", changeAmount: "0.00" });
    expect(() => validateTender("QRIS", "100000.00", "100001.00")).toThrow("exact payment");
  });
});
