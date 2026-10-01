import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import type { CustomerInput } from "@/server/customers/validation";

export class CustomerServiceError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "DUPLICATE" | "DATABASE") { super(message); this.name = "CustomerServiceError"; }
}

function safeError(error: unknown): never {
  if (error instanceof CustomerServiceError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") throw new CustomerServiceError("Nomor telepon atau email sudah digunakan.", "DUPLICATE");
    if (error.code === "P2025") throw new CustomerServiceError("Pelanggan tidak ditemukan.", "NOT_FOUND");
  }
  console.error("Customer operation failed.", error);
  throw new CustomerServiceError("Data pelanggan belum dapat disimpan. Coba lagi.", "DATABASE");
}

export async function saveCustomer(input: CustomerInput, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const data = { name: input.name, phone: input.phone, email: input.email, notes: input.notes };
      const customer = input.id
        ? await tx.customer.update({ where: { id: input.id }, data })
        : await tx.customer.create({ data });
      await tx.auditLog.create({ data: { userId: actorId, action: input.id ? "CUSTOMER_UPDATED" : "CUSTOMER_CREATED", entity: "Customer", entityId: customer.id } });
      return customer;
    });
  } catch (error) { return safeError(error); }
}

export async function setCustomerActive(id: string, isActive: boolean, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const result = await tx.customer.update({ where: { id }, data: { isActive } });
      await tx.auditLog.create({ data: { userId: actorId, action: isActive ? "CUSTOMER_ACTIVATED" : "CUSTOMER_DEACTIVATED", entity: "Customer", entityId: id } });
      return result;
    });
  } catch (error) { return safeError(error); }
}

export async function listCustomers(query = "") {
  const prisma = getPrismaClient();
  const needle = query.trim().slice(0, 80);
  const customers = await prisma.customer.findMany({
    where: needle ? { OR: [{ name: { contains: needle, mode: "insensitive" } }, { phone: { contains: needle } }, { email: { contains: needle, mode: "insensitive" } }] } : {},
    orderBy: [{ isActive: "desc" }, { name: "asc" }], take: 100,
    select: { id: true, name: true, phone: true, email: true, notes: true, isActive: true, createdAt: true, updatedAt: true },
  });
  if (!customers.length) return [];
  const aggregates = await prisma.order.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customers.map((customer) => customer.id) }, status: "COMPLETED", completedAt: { not: null } },
    _count: { id: true }, _sum: { total: true }, _max: { completedAt: true },
  });
  const summary = new Map(aggregates.map((row) => [row.customerId, row]));
  return customers.map((customer) => {
    const aggregate = summary.get(customer.id);
    return { ...customer, totalVisits: aggregate?._count.id ?? 0, totalSpending: aggregate?._sum.total ?? new Prisma.Decimal(0), lastVisit: aggregate?._max.completedAt ?? null };
  });
}

export async function getActiveCustomersForPos() {
  return getPrismaClient().customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, phone: true } });
}
