import { Prisma } from "@/generated/prisma/client";

export function calculateExpectedCash(openingCash: Prisma.Decimal, cashSales: Prisma.Decimal, cashExpenses: Prisma.Decimal, cashRefunds = new Prisma.Decimal(0)) {
  return openingCash.plus(cashSales).minus(cashExpenses).minus(cashRefunds).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
