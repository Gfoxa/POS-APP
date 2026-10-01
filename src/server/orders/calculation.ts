export type OrderDiscount = {
  name: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  scope: "PRODUCT" | "ORDER";
  value: string;
  maxAmount: string | null;
  productId: string | null;
};

export type CalculationLine = {
  productId: string;
  quantity: number;
  unitPrice: string;
  addons: { unitPrice: string; quantity: number }[];
};

export type OrderTotals = {
  subtotal: string;
  discountAmount: string;
  taxable: string;
  taxAmount: string;
  serviceChargeAmount: string;
  total: string;
};

function toCents(value: string): bigint {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) throw new Error("invalid money amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function fromCents(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return quotient + (remainder * 2n >= denominator ? 1n : 0n);
}

function discountFor(lines: CalculationLine[], discount?: OrderDiscount | null): bigint {
  if (!discount) return 0n;
  const eligibleLines = discount.scope === "PRODUCT"
    ? lines.filter((line) => line.productId === discount.productId)
    : lines;
  const eligibleSubtotal = eligibleLines.reduce((total, line) => {
    const addonUnit = line.addons.reduce((sum, addon) => sum + toCents(addon.unitPrice) * BigInt(addon.quantity), 0n);
    const eligibleUnit = toCents(line.unitPrice) + (discount.scope === "ORDER" ? addonUnit : 0n);
    return total + eligibleUnit * BigInt(line.quantity);
  }, 0n);
  if (eligibleSubtotal <= 0n) return 0n;
  const raw = discount.type === "PERCENTAGE"
    ? roundHalfUp(eligibleSubtotal * toCents(discount.value), 10000n)
    : toCents(discount.value);
  const capped = discount.maxAmount === null ? raw : raw < toCents(discount.maxAmount) ? raw : toCents(discount.maxAmount);
  return capped < eligibleSubtotal ? capped : eligibleSubtotal;
}

export function calculateOrderTotals(input: {
  lines: CalculationLine[];
  discount?: OrderDiscount | null;
  taxRateBasisPoints: number;
  serviceChargeRateBasisPoints: number;
}): OrderTotals {
  if (!Number.isSafeInteger(input.taxRateBasisPoints) || input.taxRateBasisPoints < 0 || input.taxRateBasisPoints > 10000) {
    throw new Error("invalid tax rate");
  }
  if (!Number.isSafeInteger(input.serviceChargeRateBasisPoints) || input.serviceChargeRateBasisPoints < 0 || input.serviceChargeRateBasisPoints > 10000) {
    throw new Error("invalid service charge rate");
  }
  const subtotal = input.lines.reduce((total, line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error("invalid quantity");
    const addonUnit = line.addons.reduce((sum, addon) => {
      if (!Number.isSafeInteger(addon.quantity) || addon.quantity < 1) throw new Error("invalid add-on quantity");
      return sum + toCents(addon.unitPrice) * BigInt(addon.quantity);
    }, 0n);
    return total + (toCents(line.unitPrice) + addonUnit) * BigInt(line.quantity);
  }, 0n);
  const discountAmount = discountFor(input.lines, input.discount);
  const taxable = subtotal - discountAmount;
  const tax = roundHalfUp(taxable * BigInt(input.taxRateBasisPoints), 10000n);
  const serviceCharge = roundHalfUp(taxable * BigInt(input.serviceChargeRateBasisPoints), 10000n);
  return {
    subtotal: fromCents(subtotal),
    discountAmount: fromCents(discountAmount),
    taxable: fromCents(taxable),
    taxAmount: fromCents(tax),
    serviceChargeAmount: fromCents(serviceCharge),
    total: fromCents(taxable + tax + serviceCharge),
  };
}

export function validateTender(method: string, total: string, tendered: string) {
  const totalCents = toCents(total);
  const tenderedCents = toCents(tendered);
  if (method !== "CASH" && tenderedCents !== totalCents) throw new Error("non-cash methods require exact payment");
  if (tenderedCents < totalCents) throw new Error("payment underpayment");
  return { tenderedAmount: fromCents(tenderedCents), changeAmount: fromCents(tenderedCents - totalCents) };
}
