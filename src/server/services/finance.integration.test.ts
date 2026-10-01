import "dotenv/config";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { openCashSession, closeCashSession, createExpense, listExpenses } from "./finance";
import { expenseInputSchema } from "@/server/finance/validation";

const integrationDescribe = process.env.PHASE6_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("finance services", () => {
  it("allows only one concurrently opened session per cashier", async () => {
    const prisma = getPrismaClient();
    const role = await prisma.role.findUniqueOrThrow({ where: { name: "CASHIER" }, select: { id: true } });
    const suffix = `${Date.now()}`;
    const cashier = await prisma.user.create({ data: { name: `Session race ${suffix}`, email: `session-race-${suffix}@cafe.local`, passwordHash: "test-only-hash", roleId: role.id } });
    let sessionId: string | undefined;
    try {
      const results = await Promise.allSettled([openCashSession("0", cashier.id), openCashSession("0", cashier.id)]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const opened = results.find((result) => result.status === "fulfilled");
      if (opened?.status === "fulfilled") sessionId = opened.value.id;
    } finally {
      if (sessionId) { await prisma.auditLog.deleteMany({ where: { entityId: sessionId } }); await prisma.cashSession.deleteMany({ where: { id: sessionId } }); }
      await prisma.auditLog.deleteMany({ where: { userId: cashier.id } });
      await prisma.user.delete({ where: { id: cashier.id } });
      await prisma.$disconnect();
    }
  });

  it("records expenses and closes a cash session with exact expected cash and variance", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const product = await prisma.product.findFirstOrThrow({ select: { id: true } });
    const suffix = `${Date.now()}`;
    let sessionId: string | undefined;
    let orderId: string | undefined;
    let expenseId: string | undefined;
    try {
      const session = await openCashSession("1000.00", owner.id);
      sessionId = session.id;
      await expect(openCashSession("100.00", owner.id)).rejects.toMatchObject({ code: "SESSION_OPEN" });
      const order = await prisma.order.create({ data: { orderNumber: `P6-CASH-${suffix}`, cashierId: owner.id, type: "TAKEAWAY", status: "COMPLETED", subtotal: "500", total: "500", completedAt: new Date(), items: { create: { productId: product.id, productName: "Cash session sale", quantity: 1, unitPrice: "500" } } } });
      orderId = order.id;
      await prisma.payment.create({ data: { orderId, amount: "500", tenderedAmount: "500", changeAmount: "0", method: "CASH", cashierId: owner.id, cashSessionId: session.id } });
      await prisma.payment.create({ data: { orderId, kind: "REFUND", amount: "50", method: "CASH", cashierId: owner.id, cashSessionId: session.id } });
      const expense = await createExpense(expenseInputSchema.parse({ cashSessionId: session.id, category: "Operasional", description: `Belanja ${suffix}`, amount: "200", paymentMethod: "CASH", incurredAt: new Date().toISOString() }), owner.id);
      expenseId = expense.id;
      expect((await listExpenses()).some((row) => row.id === expense.id)).toBe(true);
      const closed = await closeCashSession(session.id, "1250.00", owner.id);
      expect(closed.expectedClosingCash?.equals(new Prisma.Decimal("1250.00"))).toBe(true);
      expect(closed.cashRefunds.equals(new Prisma.Decimal("50.00"))).toBe(true);
      expect(closed.difference?.equals(new Prisma.Decimal("0.00"))).toBe(true);
      await expect(closeCashSession(session.id, "1250.00", owner.id)).rejects.toMatchObject({ code: "SESSION_CLOSED" });
      await prisma.payment.deleteMany({ where: { orderId } });
    } finally {
      if (expenseId) await prisma.expense.deleteMany({ where: { id: expenseId } });
      if (orderId) { await prisma.orderItem.deleteMany({ where: { orderId } }); await prisma.order.deleteMany({ where: { id: orderId } }); }
      if (sessionId) await prisma.cashSession.deleteMany({ where: { id: sessionId } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [sessionId ?? "", orderId ?? "", expenseId ?? ""] } } });
      await prisma.$disconnect();
    }
  });
});
