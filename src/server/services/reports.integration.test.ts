import "dotenv/config";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { getReportsBundle } from "./reports";

const integrationDescribe = process.env.PHASE6_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("reports against PostgreSQL", () => {
  it("reports sales, product units, payment methods, inventory cost, and expenses with exact decimals", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const product = await prisma.product.findFirstOrThrow({ select: { id: true } });
    const suffix = `${Date.now()}`;
    const reportDate = new Date("2020-01-01T05:00:00.000Z");
    let orderId: string | undefined;
    let precompletionRefundId: string | undefined;
    let ingredientId: string | undefined;
    try {
      const order = await prisma.order.create({ data: { orderNumber: `P6-REPORT-${suffix}`, cashierId: owner.id, type: "TAKEAWAY", status: "REFUNDED", subtotal: "1000", discountAmount: "100", taxAmount: "99", total: "999", completedAt: reportDate, items: { create: { productId: product.id, productName: `Report coffee ${suffix}`, quantity: 2, unitPrice: "500" } } } });
      orderId = order.id;
      const ingredient = await prisma.ingredient.create({ data: { name: `Report bean ${suffix}`, unit: "GRAM", costPerUnit: "2.0000", currentStock: "10" } });
      ingredientId = ingredient.id;
      await prisma.inventoryTransaction.create({ data: { ingredientId: ingredient.id, type: "SALE", quantityDelta: "-10", unitCostSnapshot: "2.0000", orderId: order.id, performedById: owner.id, createdAt: reportDate } });
      await prisma.payment.create({ data: { orderId: order.id, amount: "999", tenderedAmount: "999", changeAmount: "0", method: "QRIS", cashierId: owner.id, paidAt: reportDate } });
      await prisma.payment.create({ data: { orderId: order.id, kind: "REFUND", amount: "111", method: "QRIS", cashierId: owner.id, paidAt: reportDate } });
      const precompletionRefund = await prisma.order.create({ data: { orderNumber: `P6-REFUND-EARLY-${suffix}`, cashierId: owner.id, type: "TAKEAWAY", status: "REFUNDED", subtotal: "100", total: "111", items: { create: { productId: product.id, productName: `Early refund ${suffix}`, quantity: 1, unitPrice: "100" } } } });
      precompletionRefundId = precompletionRefund.id;
      await prisma.payment.createMany({ data: [
        { orderId: precompletionRefund.id, kind: "CHARGE", amount: "111", method: "QRIS", cashierId: owner.id, paidAt: reportDate },
        { orderId: precompletionRefund.id, kind: "REFUND", amount: "111", method: "QRIS", cashierId: owner.id, paidAt: reportDate },
      ] });
      await prisma.expense.create({ data: { category: "Uji", description: `Report expense ${suffix}`, amount: "50", paymentMethod: "OTHER", incurredAt: reportDate, userId: owner.id } });
      const report = await getReportsBundle({ range: "CUSTOM", from: "2020-01-01", to: "2020-01-01" }, "OWNER");
      expect(report.sales.grossSales.equals(new Prisma.Decimal("1000"))).toBe(true);
      expect(report.sales.discounts.equals(new Prisma.Decimal("100"))).toBe(true);
      expect(report.sales.netSales.equals(new Prisma.Decimal("800"))).toBe(true);
      expect(report.sales.refunds.equals(new Prisma.Decimal("222"))).toBe(true);
      expect(report.sales.tax.equals(new Prisma.Decimal("88"))).toBe(true);
      expect(report.sales.averageOrderValue.equals(new Prisma.Decimal("800"))).toBe(true);
      expect(report.sales.serviceCharge.equals(new Prisma.Decimal("0"))).toBe(true);
      expect(report.sales.orderCount).toBe(1);
      expect(report.products).toEqual(expect.arrayContaining([expect.objectContaining({ name: `Report coffee ${suffix}`, unitsSold: 2, revenue: new Prisma.Decimal("1000") })]));
      expect(report.payments.find((row) => row.method === "QRIS")?.amount.equals(new Prisma.Decimal("888"))).toBe(true);
      expect(report.profit.cogs.equals(new Prisma.Decimal("20"))).toBe(true);
      expect(report.profit.expenses.equals(new Prisma.Decimal("50"))).toBe(true);
      expect(report.profit.estimatedProfit.equals(new Prisma.Decimal("730"))).toBe(true);
      await expect(getReportsBundle({ range: "CUSTOM", from: "2020-01-01", to: "2020-01-01" }, "CASHIER")).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await prisma.expense.deleteMany({ where: { description: `Report expense ${suffix}` } });
      const orderIds = [orderId, precompletionRefundId].filter((id): id is string => Boolean(id));
      if (orderIds.length) { await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } }); await prisma.inventoryTransaction.deleteMany({ where: { orderId: { in: orderIds } } }); await prisma.orderItemIngredient.deleteMany({ where: { orderItem: { orderId: { in: orderIds } } } }); await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }); await prisma.order.deleteMany({ where: { id: { in: orderIds } } }); }
      if (ingredientId) { await prisma.inventoryTransaction.deleteMany({ where: { ingredientId: ingredientId } }); await prisma.ingredient.deleteMany({ where: { id: ingredientId } }); }
      await prisma.$disconnect();
    }
  });
});
