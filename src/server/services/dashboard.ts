import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { getStartOfJakartaDay } from "@/lib/utils/format";

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Tunai",
  QRIS: "QRIS",
  DEBIT: "Debit",
  CREDIT_CARD: "Kartu kredit",
  OTHER: "Lainnya",
};

export async function getDashboardOverview(now = new Date()) {
  const prisma = getPrismaClient();
  const startOfDay = getStartOfJakartaDay(now);

  try {
    const [orderCount, revenueResult, activeProductCount, recentOrders, topProducts, payments, ingredients] =
      await Promise.all([
        prisma.order.count({
          where: {
            createdAt: { gte: startOfDay },
            status: { in: ["CONFIRMED", "PREPARING", "READY", "COMPLETED"] },
          },
        }),
        prisma.order.aggregate({
          where: { status: "COMPLETED", completedAt: { gte: startOfDay } },
          _sum: { total: true },
        }),
        prisma.product.count({ where: { isActive: true } }),
        prisma.order.findMany({
          where: { createdAt: { gte: startOfDay }, status: { not: "DRAFT" } },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            createdAt: true,
            cashier: { select: { name: true } },
          },
        }),
        prisma.orderItem.groupBy({
          by: ["productId", "productName"],
          where: {
            order: { status: "COMPLETED", completedAt: { gte: startOfDay } },
          },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 5,
        }),
        prisma.payment.groupBy({
          by: ["method"],
          where: {
            kind: "CHARGE",
            paidAt: { gte: startOfDay },
            order: { status: "COMPLETED" },
          },
          _sum: { amount: true },
          orderBy: { _sum: { amount: "desc" } },
        }),
        prisma.ingredient.findMany({
          select: { id: true, name: true, unit: true, currentStock: true, minimumStock: true },
          orderBy: { name: "asc" },
        }),
      ]);

    const revenue = revenueResult._sum.total ?? new Prisma.Decimal(0);
    const lowStockIngredients = ingredients.filter((ingredient) =>
      ingredient.currentStock.lessThanOrEqualTo(ingredient.minimumStock),
    );

    return {
      orderCount,
      revenue,
      averageOrderValue:
        orderCount === 0
          ? new Prisma.Decimal(0)
          : revenue.div(orderCount).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
      activeProductCount,
      recentOrders,
      topProducts: topProducts.map((product) => ({
        productId: product.productId,
        name: product.productName,
        unitsSold: product._sum.quantity ?? 0,
      })),
      paymentBreakdown: payments.map((payment) => ({
        label: PAYMENT_LABELS[payment.method] ?? PAYMENT_LABELS.OTHER,
        amount: payment._sum.amount ?? new Prisma.Decimal(0),
      })),
      lowStockIngredients,
    };
  } catch (error) {
    console.error("Dashboard summary could not be loaded.", error);
    throw new Error("Ringkasan belum dapat dimuat. Periksa koneksi database lalu coba lagi.");
  }
}
