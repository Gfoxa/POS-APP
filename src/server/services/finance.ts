import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { calculateExpectedCash } from "@/server/finance/calculation";
import type { ExpenseInput } from "@/server/finance/validation";

export class FinanceServiceError extends Error {
  constructor(message: string, readonly code: "SESSION_OPEN" | "SESSION_CLOSED" | "NOT_FOUND" | "FORBIDDEN" | "INVALID_INPUT" | "DATABASE") { super(message); this.name = "FinanceServiceError"; }
}

function safeError(error: unknown): never {
  if (error instanceof FinanceServiceError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") throw new FinanceServiceError("Sesi kasir masih terbuka. Tutup sesi sebelum membuka sesi baru.", "SESSION_OPEN");
    if (error.code === "P2025") throw new FinanceServiceError("Data keuangan tidak ditemukan.", "NOT_FOUND");
    if (error.code === "P2003") throw new FinanceServiceError("Sesi kasir tidak tersedia.", "NOT_FOUND");
  }
  console.error("Finance operation failed.", error);
  throw new FinanceServiceError("Perubahan keuangan belum dapat disimpan. Coba lagi.", "DATABASE");
}

function toIncurredAt(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+07:00`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new FinanceServiceError("Tanggal pengeluaran tidak valid.", "INVALID_INPUT");
  return parsed;
}

export async function createExpense(input: ExpenseInput, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.cashSessionId && input.paymentMethod === "CASH") {
        const sessions = await tx.$queryRaw<Array<{ id: string; closedAt: Date | null }>>`SELECT "id", "closedAt" FROM "CashSession" WHERE "id" = ${input.cashSessionId}::uuid FOR UPDATE`;
        if (!sessions[0] || sessions[0].closedAt) throw new FinanceServiceError("Pilih sesi kasir yang masih terbuka.", "SESSION_CLOSED");
      }
      const expense = await tx.expense.create({ data: {
        category: input.category,
        description: input.description,
        amount: new Prisma.Decimal(input.amount),
        paymentMethod: input.paymentMethod,
        incurredAt: toIncurredAt(input.incurredAt),
        userId: actorId,
        cashSessionId: input.paymentMethod === "CASH" ? input.cashSessionId : null,
      } });
      await tx.auditLog.create({ data: { userId: actorId, action: "EXPENSE_CREATED", entity: "Expense", entityId: expense.id, metadata: { category: expense.category, amount: expense.amount.toFixed(2), paymentMethod: expense.paymentMethod } } });
      return expense;
    });
  } catch (error) { return safeError(error); }
}

export async function listExpenses(range?: { start: Date; endExclusive: Date }) {
  return getPrismaClient().expense.findMany({
    where: range ? { incurredAt: { gte: range.start, lt: range.endExclusive } } : {},
    orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }], take: 250,
    include: { user: { select: { name: true } }, cashSession: { select: { id: true, openedAt: true, cashier: { select: { name: true } } } } },
  });
}

export async function listOpenCashSessions() {
  return getPrismaClient().cashSession.findMany({ where: { closedAt: null }, orderBy: { openedAt: "asc" }, select: { id: true, openedAt: true, cashier: { select: { id: true, name: true } } } });
}

export async function getOpenCashSession(cashierId: string) {
  return getPrismaClient().cashSession.findFirst({ where: { cashierId, closedAt: null }, orderBy: { openedAt: "desc" } });
}

export async function getCashSessionLiveTotals(sessionId: string) {
  const prisma = getPrismaClient();
  const session = await prisma.cashSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new FinanceServiceError("Sesi kasir tidak ditemukan.", "NOT_FOUND");
  const [sales, refunds, expenses] = await Promise.all([
    prisma.payment.aggregate({ where: { cashSessionId: session.id, method: "CASH", kind: "CHARGE" }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { cashSessionId: session.id, method: "CASH", kind: "REFUND" }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH" }, _sum: { amount: true } }),
  ]);
  const cashSales = sales._sum.amount ?? new Prisma.Decimal(0);
  const cashExpenses = expenses._sum.amount ?? new Prisma.Decimal(0);
  const cashRefunds = refunds._sum.amount ?? new Prisma.Decimal(0);
  return { cashSales, cashExpenses, cashRefunds, expectedClosingCash: calculateExpectedCash(session.openingCash, cashSales, cashExpenses, cashRefunds) };
}

export async function listCashSessions(cashierId: string) {
  return getPrismaClient().cashSession.findMany({ where: { cashierId }, orderBy: { openedAt: "desc" }, take: 20 });
}

export async function openCashSession(openingCash: string, cashierId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.cashSession.findFirst({ where: { cashierId, closedAt: null }, select: { id: true } });
      if (existing) throw new FinanceServiceError("Sesi kasir masih terbuka. Tutup sesi sebelum membuka sesi baru.", "SESSION_OPEN");
      const session = await tx.cashSession.create({ data: { cashierId, openingCash: new Prisma.Decimal(openingCash) } });
      await tx.auditLog.create({ data: { userId: cashierId, action: "CASH_SESSION_OPENED", entity: "CashSession", entityId: session.id, metadata: { openingCash: session.openingCash.toFixed(2) } } });
      return session;
    });
  } catch (error) { return safeError(error); }
}

export async function closeCashSession(sessionId: string, actualClosingCash: string, cashierId: string, closedAt = new Date()) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashSession" WHERE "id" = ${sessionId}::uuid FOR UPDATE`;
      if (!rows.length) throw new FinanceServiceError("Sesi kasir tidak ditemukan.", "NOT_FOUND");
      const session = await tx.cashSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new FinanceServiceError("Sesi kasir tidak ditemukan.", "NOT_FOUND");
      if (session.cashierId !== cashierId) throw new FinanceServiceError("Anda hanya dapat menutup sesi kasir sendiri.", "FORBIDDEN");
      if (session.closedAt) throw new FinanceServiceError("Sesi kasir sudah ditutup.", "SESSION_CLOSED");
      const [sales, refunds] = await Promise.all([
        tx.payment.aggregate({ where: { cashSessionId: session.id, method: "CASH", kind: "CHARGE" }, _sum: { amount: true } }),
        tx.payment.aggregate({ where: { cashSessionId: session.id, method: "CASH", kind: "REFUND" }, _sum: { amount: true } }),
      ]);
      const expenses = await tx.expense.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH" }, _sum: { amount: true } });
      const cashSales = sales._sum.amount ?? new Prisma.Decimal(0);
      const cashRefunds = refunds._sum.amount ?? new Prisma.Decimal(0);
      const cashExpenses = expenses._sum.amount ?? new Prisma.Decimal(0);
      const expectedClosingCash = calculateExpectedCash(session.openingCash, cashSales, cashExpenses, cashRefunds);
      const actual = new Prisma.Decimal(actualClosingCash);
      const difference = actual.minus(expectedClosingCash).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const result = await tx.cashSession.update({ where: { id: sessionId, closedAt: null }, data: { expectedClosingCash, actualClosingCash: actual, difference, closedAt } });
      await tx.auditLog.create({ data: { userId: cashierId, action: "CASH_SESSION_CLOSED", entity: "CashSession", entityId: sessionId, metadata: { cashSales: cashSales.toFixed(2), cashRefunds: cashRefunds.toFixed(2), cashExpenses: cashExpenses.toFixed(2), expected: expectedClosingCash.toFixed(2), actual: actual.toFixed(2), difference: difference.toFixed(2) } } });
      return { ...result, cashSales, cashRefunds, cashExpenses };
    });
  } catch (error) { return safeError(error); }
}
