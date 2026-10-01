import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { UserRole } from "@/lib/permissions/roles";
import { getPrismaClient } from "@/lib/db/prisma";
import { calculateProfit } from "@/server/reports/calculation";
import type { ReportRangeInput } from "@/server/reports/validation";

export class ReportServiceError extends Error {
  constructor(message: string, readonly code: "FORBIDDEN" | "INVALID_RANGE" | "DATABASE") { super(message); this.name = "ReportServiceError"; }
}

function jakartaDate(now: Date) {
  const local = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return String(local.getUTCFullYear()).padStart(4, "0") + "-" + String(local.getUTCMonth() + 1).padStart(2, "0") + "-" + String(local.getUTCDate()).padStart(2, "0");
}
function addDays(day: string, offset: number) {
  const [year, month, date] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + offset));
  return String(shifted.getUTCFullYear()).padStart(4, "0") + "-" + String(shifted.getUTCMonth() + 1).padStart(2, "0") + "-" + String(shifted.getUTCDate()).padStart(2, "0");
}
function startAtJakarta(day: string) { return new Date(day + "T00:00:00+07:00"); }

export function resolveReportWindow(range: ReportRangeInput, now = new Date()) {
  const today = jakartaDate(now);
  let from: string;
  let through: string;
  if (range.range === "CUSTOM") { from = range.from!; through = range.to!; }
  else if (range.range === "YESTERDAY") { from = addDays(today, -1); through = from; }
  else if (range.range === "THIS_MONTH") { from = today.slice(0, 7) + "-01"; through = today; }
  else if (range.range === "THIS_WEEK") {
    const local = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    from = addDays(today, -((local.getUTCDay() + 6) % 7)); through = today;
  } else { from = today; through = today; }
  return { start: startAtJakarta(from), endExclusive: startAtJakarta(addDays(through, 1)), from, to: through };
}

const zero = () => new Prisma.Decimal(0);

export async function getReportsBundle(range: ReportRangeInput, role: UserRole, now = new Date()) {
  if (role !== "OWNER" && role !== "MANAGER") throw new ReportServiceError("Anda tidak memiliki akses ke laporan.", "FORBIDDEN");
  const window = resolveReportWindow(range, now);
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
    const completedWhere: Prisma.OrderWhereInput = { status: { in: ["COMPLETED", "REFUNDED"] }, completedAt: { gte: window.start, lt: window.endExclusive } };
    const [salesAggregate, products, payments, refundRows, inventoryGroups, movements, ingredients, allIngredients, saleRows, expenseAggregate] = await Promise.all([
      tx.order.aggregate({ where: completedWhere, _sum: { subtotal: true, discountAmount: true, taxAmount: true, serviceChargeAmount: true }, _count: { id: true } }),
      tx.orderItem.findMany({ where: { order: completedWhere }, select: { productName: true, quantity: true, unitPrice: true, addons: { select: { unitPrice: true, quantity: true } } } }),
      tx.payment.groupBy({ by: ["method", "kind"], where: { paidAt: { gte: window.start, lt: window.endExclusive } }, _sum: { amount: true } }),
      tx.payment.findMany({ where: { kind: "REFUND", paidAt: { gte: window.start, lt: window.endExclusive } }, select: { amount: true, order: { select: { total: true, subtotal: true, discountAmount: true, taxAmount: true, serviceChargeAmount: true, completedAt: true } } } }),
      tx.inventoryTransaction.groupBy({ by: ["ingredientId", "type"], where: { createdAt: { gte: window.start, lt: window.endExclusive } }, _sum: { quantityDelta: true }, _count: { id: true } }),
      tx.inventoryTransaction.findMany({ where: { createdAt: { gte: window.start, lt: window.endExclusive } }, orderBy: { createdAt: "desc" }, take: 200, include: { ingredient: { select: { name: true, unit: true } }, performedBy: { select: { name: true } } } }),
      tx.ingredient.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, currentStock: true, minimumStock: true } }),
      tx.ingredient.findMany({ select: { id: true, name: true, unit: true } }),
      tx.inventoryTransaction.findMany({ where: { type: "SALE", order: { is: { status: { in: ["COMPLETED", "REFUNDED"] }, completedAt: { gte: window.start, lt: window.endExclusive } } } }, select: { quantityDelta: true, unitCostSnapshot: true } }),
      tx.expense.aggregate({ where: { incurredAt: { gte: window.start, lt: window.endExclusive } }, _sum: { amount: true } }),
    ]);
    const grossSales = salesAggregate._sum.subtotal ?? zero();
    const discounts = salesAggregate._sum.discountAmount ?? zero();
    const netSales = grossSales.minus(discounts);
    const orderCount = salesAggregate._count.id;
    const sales = {
      grossSales, discounts, tax: salesAggregate._sum.taxAmount ?? zero(),
      serviceCharge: salesAggregate._sum.serviceChargeAmount ?? zero(), netSales, orderCount,
      averageOrderValue: orderCount ? netSales.div(orderCount).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP) : zero(),
    };
    const revenueByProduct = new Map<string, { unitsSold: number; revenue: Prisma.Decimal }>();
    for (const row of products) {
      const existing = revenueByProduct.get(row.productName) ?? { unitsSold: 0, revenue: zero() };
      existing.unitsSold += row.quantity;
      const addons = row.addons.reduce((sum, addon) => sum.plus(addon.unitPrice.times(addon.quantity)), zero());
      existing.revenue = existing.revenue.plus(row.unitPrice.plus(addons).times(row.quantity));
      revenueByProduct.set(row.productName, existing);
    }
    const inventory = {
      movements: inventoryGroups.map((group) => ({ type: group.type, ingredientId: group.ingredientId, ingredient: allIngredients.find((item) => item.id === group.ingredientId), quantityDelta: group._sum.quantityDelta ?? zero(), count: group._count.id })),
      stock: ingredients,
      lowStock: ingredients.filter((item) => item.currentStock.lessThanOrEqualTo(item.minimumStock)),
      recent: movements,
    };
    const cogs = saleRows.reduce((sum, row) => sum.plus((row.unitCostSnapshot ?? zero()).times(row.quantityDelta.abs())), zero());
    const expenses = expenseAggregate._sum.amount ?? zero();
    const refunds = refundRows.reduce((sum, row) => sum.plus(row.amount), zero());
    const refundedNetSales = refundRows.reduce((sum, row) => {
      if (row.order.total.isZero() || !row.order.completedAt) return sum;
      return sum.plus(row.amount.times(row.order.subtotal.minus(row.order.discountAmount)).div(row.order.total));
    }, zero());
    const refundedTax = refundRows.reduce((sum, row) => row.order.total.isZero() || !row.order.completedAt ? sum : sum.plus(row.amount.times(row.order.taxAmount).div(row.order.total)), zero());
    const refundedService = refundRows.reduce((sum, row) => row.order.total.isZero() || !row.order.completedAt ? sum : sum.plus(row.amount.times(row.order.serviceChargeAmount).div(row.order.total)), zero());
    const adjustedNetSales = netSales.minus(refundedNetSales).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const adjustedOrderCount = orderCount;
    const paymentTotals = new Map<string, Prisma.Decimal>();
    for (const row of payments) paymentTotals.set(row.method, (paymentTotals.get(row.method) ?? zero()).plus(row.kind === "REFUND" ? row._sum.amount?.negated() ?? zero() : row._sum.amount ?? zero()));
    return {
      window, sales: {
        ...sales, refunds, netSales: adjustedNetSales,
        tax: sales.tax.minus(refundedTax).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        serviceCharge: sales.serviceCharge.minus(refundedService).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        averageOrderValue: adjustedOrderCount ? adjustedNetSales.div(adjustedOrderCount).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP) : zero(),
      },
      products: [...revenueByProduct.entries()].map(([name, totals]) => ({ name, ...totals })).sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 20),
      payments: [...paymentTotals.entries()].map(([method, amount]) => ({ method, amount })),
      inventory,
      profit: calculateProfit(adjustedNetSales, cogs, expenses),
    };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  } catch (error) {
    console.error("Reports could not be loaded.", error);
    throw new ReportServiceError("Laporan belum dapat dimuat. Periksa koneksi database lalu coba lagi.", "DATABASE");
  }
}
