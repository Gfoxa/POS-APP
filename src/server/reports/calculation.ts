import { Prisma } from "@/generated/prisma/client";

export function calculateProfit(netSales: Prisma.Decimal, cogs: Prisma.Decimal, expenses: Prisma.Decimal) {
  return { cogs, expenses, estimatedProfit: netSales.minus(cogs).minus(expenses).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) };
}
