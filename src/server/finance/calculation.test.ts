import { Prisma } from "@/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { calculateExpectedCash } from "./calculation";

describe("cash session calculations", () => {
  it("adds cash sales and subtracts cash expenses using exact decimals", () => {
    expect(calculateExpectedCash(new Prisma.Decimal("1000000"), new Prisma.Decimal("2500000"), new Prisma.Decimal("200000")).toFixed(2)).toBe("3300000.00");
  });
  it("subtracts cash refunds from the expected drawer balance", () => {
    expect(calculateExpectedCash(new Prisma.Decimal("1000"), new Prisma.Decimal("500"), new Prisma.Decimal("25"), new Prisma.Decimal("100")).toFixed(2)).toBe("1375.00");
  });
});
