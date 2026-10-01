import "dotenv/config";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { listCustomers, saveCustomer, setCustomerActive } from "./customers";

const integrationDescribe = process.env.PHASE6_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("customer services", () => {
  it("manages active customers and derives totals from completed orders", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const product = await prisma.product.findFirstOrThrow({ select: { id: true } });
    const suffix = `${Date.now()}`;
    const customer = await saveCustomer({ name: `Customer ${suffix}`, phone: `+628${suffix.slice(-9)}`, email: `cust-${suffix}@example.test`, notes: "First visit" }, owner.id);
    const completedAt = new Date();
    const order = await prisma.order.create({ data: { orderNumber: `P6-${suffix}`, cashierId: owner.id, type: "TAKEAWAY", status: "COMPLETED", customerId: customer.id, subtotal: "25000", total: "27750", completedAt, items: { create: { productId: product.id, productName: "Test coffee", quantity: 1, unitPrice: "25000" } } } });
    try {
      const rows = await listCustomers(`Customer ${suffix}`);
      expect(rows[0]).toMatchObject({ id: customer.id, totalVisits: 1, totalSpending: new Prisma.Decimal("27750"), lastVisit: completedAt });
      await expect(saveCustomer({ id: customer.id, name: customer.name, phone: `+628${suffix.slice(-9)}`, email: `updated-${suffix}@example.test`, notes: null }, owner.id)).resolves.toMatchObject({ name: customer.name });
      await setCustomerActive(customer.id, false, owner.id);
      expect(await prisma.customer.findUnique({ where: { id: customer.id }, select: { isActive: true } })).toEqual({ isActive: false });
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [customer.id, order.id] } } });
      await prisma.payment.deleteMany({ where: { orderId: order.id } });
      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
      await prisma.$disconnect();
    }
  });
});
