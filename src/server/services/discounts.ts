import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import type { DiscountInput } from "@/server/orders/validation";

export class DiscountServiceError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "INVALID_REFERENCE" | "DATABASE") {
    super(message);
    this.name = "DiscountServiceError";
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

function dateBoundary(value: string | null | undefined, endOfDay = false) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+07:00`);
  }
  return new Date(value);
}

function safeError(error: unknown): never {
  if (error instanceof DiscountServiceError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    throw new DiscountServiceError("Diskon tidak ditemukan.", "NOT_FOUND");
  }
  console.error("Discount operation failed.", error);
  throw new DiscountServiceError("Diskon belum dapat disimpan. Coba lagi.", "DATABASE");
}

async function writeAudit(db: Db, actorId: string, action: string, id: string, name: string, value: string) {
  await db.auditLog.create({
    data: { userId: actorId, action, entity: "Discount", entityId: id, metadata: { name, value } },
  });
}

export async function listDiscounts() {
  return getPrismaClient().discount.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { product: { select: { id: true, name: true, isActive: true } }, _count: { select: { orders: true } } },
  });
}

export async function listProductsForDiscount() {
  return getPrismaClient().product.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isActive: true },
  });
}

export async function saveDiscount(input: DiscountInput, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = input.id
        ? await tx.discount.findUnique({ where: { id: input.id }, select: { id: true, productId: true } })
        : null;
      if (input.id && !previous) throw new DiscountServiceError("Diskon tidak ditemukan.", "NOT_FOUND");

      if (input.scope === "PRODUCT") {
        const product = input.productId
          ? await tx.product.findUnique({ where: { id: input.productId }, select: { id: true, isActive: true } })
          : null;
        if (!product) throw new DiscountServiceError("Produk diskon tidak ditemukan.", "INVALID_REFERENCE");
        if (!product.isActive && previous?.productId !== product.id) {
          throw new DiscountServiceError("Diskon hanya dapat dibuat untuk produk aktif.", "INVALID_REFERENCE");
        }
      }

      const data = {
        name: input.name,
        type: input.type,
        scope: input.scope,
        value: new Prisma.Decimal(input.value),
        maxAmount: input.maxAmount ? new Prisma.Decimal(input.maxAmount) : null,
        productId: input.scope === "PRODUCT" ? input.productId ?? null : null,
        isActive: input.isActive,
        startsAt: dateBoundary(input.startsAt),
        endsAt: dateBoundary(input.endsAt, true),
      };
      const discount = input.id
        ? await tx.discount.update({ where: { id: input.id }, data })
        : await tx.discount.create({ data: { ...data, createdById: actorId } });
      await writeAudit(tx, actorId, input.id ? "DISCOUNT_UPDATED" : "DISCOUNT_CREATED", discount.id, discount.name, discount.value.toFixed(2));
      return discount;
    });
  } catch (error) {
    return safeError(error);
  }
}
