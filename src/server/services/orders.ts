import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { UserRole } from "@/lib/permissions/roles";
import { getPrismaClient } from "@/lib/db/prisma";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { calculateOrderTotals, validateTender, type CalculationLine, type OrderDiscount } from "@/server/orders/calculation";
import { calculateRecipeRequirements, type RecipeRequirementInput } from "@/server/inventory/calculation";
import type { CheckoutInput, SaveDraftInput } from "@/server/orders/validation";
import { claimDineInTable, refreshTableGroupAfterOrderChange, resolveTableRootInTransaction, TableServiceError } from "@/server/services/tables";
import { getCafeSettings } from "@/server/services/settings";

export class OrderServiceError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "INVALID_REFERENCE" | "INVALID_STATE" | "INVALID_PAYMENT" | "DATABASE") {
    super(message);
    this.name = "OrderServiceError";
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

function toRateDecimal(basisPoints: number): Prisma.Decimal {
  return new Prisma.Decimal(basisPoints).div(10000).toDecimalPlaces(5);
}

function safeError(error: unknown): never {
  if (error instanceof OrderServiceError) throw error;
  if (error instanceof TableServiceError) {
    const code = error.code === "NOT_FOUND" ? "NOT_FOUND" : error.code === "INVALID_STATE" ? "INVALID_STATE" : "INVALID_REFERENCE";
    throw new OrderServiceError(error.message, code);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") throw new OrderServiceError("Pesanan tidak ditemukan.", "NOT_FOUND");
    if (error.code === "P2002") throw new OrderServiceError("Pesanan ini sudah diproses. Muat ulang daftar pesanan.", "INVALID_STATE");
    if (error.code === "P2003" || error.code === "P2014") throw new OrderServiceError("Data pesanan sedang digunakan.", "INVALID_REFERENCE");
  }
  console.error("Order operation failed.", error);
  throw new OrderServiceError("Pesanan belum dapat diproses. Coba lagi.", "DATABASE");
}

async function audit(db: Db, actorId: string, action: string, orderId: string, metadata: Prisma.InputJsonObject = {}) {
  await db.auditLog.create({ data: { userId: actorId, action, entity: "Order", entityId: orderId, metadata } });
}

async function lockOpenCashSessionForPayment(tx: Prisma.TransactionClient, cashierId: string) {
  const user = await tx.user.findUnique({ where: { id: cashierId }, select: { role: { select: { name: true } } } });
  if (!user) throw new OrderServiceError("Kasir tidak ditemukan.", "INVALID_REFERENCE");
  const sessions = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashSession" WHERE "cashierId" = ${cashierId}::uuid AND "closedAt" IS NULL FOR UPDATE`;
  if (!sessions.length && user.role.name === "CASHIER") throw new OrderServiceError("Buka sesi kasir sebelum memproses pembayaran.", "INVALID_STATE");
  return sessions[0]?.id ?? null;
}

function makeOrderNumber(now = new Date()) {
  return `POS-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

type PreparedLine = {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: Prisma.Decimal;
  note: string | null;
  trackInventory: boolean;
  productRecipe: RecipeRequirementInput[];
  addons: { addonId: string; addonName: string; unitPrice: Prisma.Decimal; quantity: number; recipe: RecipeRequirementInput[] }[];
};

function toRecipeIngredients(recipe: { items: Array<{ ingredientId: string; quantity: Prisma.Decimal; ingredient: { name: string; unit: string; costPerUnit: Prisma.Decimal; isActive: boolean } }> } | null): RecipeRequirementInput[] {
  return recipe?.items.map((item) => ({ ingredientId: item.ingredientId, ingredientName: item.ingredient.name, unit: item.ingredient.unit, quantity: item.quantity, costPerUnit: item.ingredient.costPerUnit, isActive: item.ingredient.isActive })) ?? [];
}

async function prepareLines(db: Db, lines: SaveDraftInput["lines"]): Promise<PreparedLine[]> {
  const prepared: PreparedLine[] = [];
  for (const line of lines) {
    const product = await db.product.findUnique({
      where: { id: line.productId },
      include: {
        category: { select: { isActive: true } },
        variants: { where: { isActive: true } },
        addons: { where: { isActive: true }, include: { recipe: { include: { items: { include: { ingredient: true } } } } } },
        recipe: { include: { items: { include: { ingredient: true } } } },
      },
    });
    if (!product?.isActive || !product.category.isActive) {
      throw new OrderServiceError("Satu atau lebih produk sudah tidak tersedia.", "INVALID_REFERENCE");
    }
    const variant = line.variantId ? product.variants.find((entry) => entry.id === line.variantId) : null;
    if (line.variantId && !variant) throw new OrderServiceError("Varian produk sudah tidak tersedia.", "INVALID_REFERENCE");
    const selectedIds = new Set(line.addonIds);
    if (selectedIds.size !== line.addonIds.length) throw new OrderServiceError("Add-on yang sama tidak dapat dipilih dua kali.", "INVALID_REFERENCE");
    const addons = product.addons.filter((addon) => selectedIds.has(addon.id));
    if (addons.length !== selectedIds.size) throw new OrderServiceError("Add-on tidak tersedia untuk produk ini.", "INVALID_REFERENCE");
    prepared.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      productName: product.name,
      variantName: variant?.name ?? null,
      quantity: line.quantity,
      unitPrice: variant?.price ?? product.basePrice,
      note: line.note ?? null,
      trackInventory: product.trackInventory,
      productRecipe: toRecipeIngredients(product.recipe),
      addons: addons.map((addon) => ({ addonId: addon.id, addonName: addon.name, unitPrice: addon.price, quantity: 1, recipe: toRecipeIngredients(addon.recipe) })),
    });
  }
  return prepared;
}

async function getActiveDiscount(db: Db, discountId: string | null | undefined, now: Date) {
  if (!discountId) return null;
  const discount = await db.discount.findUnique({ where: { id: discountId } });
  if (!discount || !discount.isActive || (discount.startsAt && discount.startsAt > now) || (discount.endsAt && discount.endsAt < now)) {
    throw new OrderServiceError("Diskon tidak aktif atau sudah di luar masa berlaku.", "INVALID_REFERENCE");
  }
  if ((discount.scope === "PRODUCT" && !discount.productId) || (discount.scope === "ORDER" && discount.productId)) {
    throw new OrderServiceError("Aturan diskon tidak valid.", "INVALID_REFERENCE");
  }
  return discount;
}

function toCalculationLines(lines: PreparedLine[]): CalculationLine[] {
  return lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitPrice: line.unitPrice.toFixed(2),
    addons: line.addons.map((addon) => ({ unitPrice: addon.unitPrice.toFixed(2), quantity: addon.quantity })),
  }));
}

function toCalculationDiscount(discount: NonNullable<Awaited<ReturnType<typeof getActiveDiscount>>>): OrderDiscount {
  return {
    name: discount.name,
    type: discount.type,
    scope: discount.scope,
    value: discount.value.toFixed(2),
    maxAmount: discount.maxAmount?.toFixed(2) ?? null,
    productId: discount.productId,
  };
}

async function calculateDraft(db: Db, input: SaveDraftInput, now: Date) {
  const preparedLines = await prepareLines(db, input.lines);
  const customer = input.customerId ? await db.customer.findUnique({ where: { id: input.customerId }, select: { id: true, isActive: true } }) : null;
  const discount = await getActiveDiscount(db, input.discountId, now);
  if (input.customerId && (!customer || !customer.isActive)) throw new OrderServiceError("Pelanggan tidak tersedia untuk transaksi baru.", "INVALID_REFERENCE");
  if (discount?.scope === "PRODUCT" && !preparedLines.some((line) => line.productId === discount.productId)) {
    throw new OrderServiceError("Diskon ini tidak berlaku untuk produk di keranjang.", "INVALID_REFERENCE");
  }
  const settings = await getCafeSettings(db);
  const totals = calculateOrderTotals({
    lines: toCalculationLines(preparedLines),
    discount: discount ? toCalculationDiscount(discount) : null,
    taxRateBasisPoints: settings.taxRateBasisPoints,
    serviceChargeRateBasisPoints: settings.serviceChargeRateBasisPoints,
  });
  return { preparedLines, discount, totals, taxRateBasisPoints: settings.taxRateBasisPoints, serviceChargeRateBasisPoints: settings.serviceChargeRateBasisPoints };
}

function validateCheckoutInventory(lines: PreparedLine[]) {
  for (const line of lines) {
    if (line.trackInventory && !line.productRecipe.length) throw new OrderServiceError("Produk yang melacak stok harus memiliki resep bahan sebelum dibayar.", "INVALID_REFERENCE");
    const ingredients = [...(line.trackInventory ? line.productRecipe : []), ...line.addons.flatMap((addon) => addon.recipe)];
    if (ingredients.some((ingredient) => ingredient.isActive === false)) throw new OrderServiceError("Resep menggunakan bahan yang tidak aktif.", "INVALID_REFERENCE");
  }
}

async function persistCheckoutIngredientSnapshots(tx: Prisma.TransactionClient, orderItemIds: string[], lines: PreparedLine[]) {
  const requirements = calculateRecipeRequirements(lines.map((line, index) => ({
    orderItemId: orderItemIds[index],
    quantity: line.quantity,
    product: line.trackInventory ? line.productRecipe : [],
    addons: line.addons.map((addon) => ({ quantity: addon.quantity, recipe: addon.recipe })),
  })));
  if (!requirements.length) return;
  const ingredientIds = [...new Set(requirements.map((item) => item.ingredientId))].sort();
  const lockedIngredients: Array<{ id: string; unit: string; isActive: boolean }> = [];
  for (const ingredientId of ingredientIds) {
    const rows = await tx.$queryRaw<Array<{ id: string; unit: string; isActive: boolean }>>`
      SELECT "id", "unit", "isActive" FROM "Ingredient" WHERE "id" = ${ingredientId}::uuid FOR UPDATE`;
    if (rows[0]) lockedIngredients.push(rows[0]);
  }
  const lockedById = new Map(lockedIngredients.map((ingredient) => [ingredient.id, ingredient]));
  if (requirements.some((item) => {
    const current = lockedById.get(item.ingredientId);
    return !current || !current.isActive || current.unit !== item.unitSnapshot;
  })) throw new OrderServiceError("Resep bahan baru saja berubah. Muat ulang pesanan lalu coba lagi.", "INVALID_REFERENCE");
  await tx.orderItemIngredient.createMany({ data: requirements.map((item) => ({
    orderItemId: item.orderItemId,
    ingredientId: item.ingredientId,
    ingredientNameSnapshot: item.ingredientNameSnapshot,
    unitSnapshot: item.unitSnapshot as "GRAM" | "KILOGRAM" | "MILLILITER" | "LITER" | "PIECE",
    quantityRequired: item.quantityRequired,
    costPerUnitSnapshot: item.costPerUnitSnapshot,
  })) });
}

function orderSnapshotData(input: SaveDraftInput, actorId: string, calculated: Awaited<ReturnType<typeof calculateDraft>>) {
  const { discount, totals } = calculated;
  return {
    type: input.type,
    tableId: input.type === "DINE_IN" ? input.tableId ?? null : null,
    cashierId: actorId,
    customerId: input.customerId ?? null,
    discountId: discount?.id ?? null,
    discountName: discount?.name ?? null,
    discountAppliedById: discount ? actorId : null,
    subtotal: new Prisma.Decimal(totals.subtotal),
    discountAmount: new Prisma.Decimal(totals.discountAmount),
    taxRate: toRateDecimal(calculated.taxRateBasisPoints),
    taxAmount: new Prisma.Decimal(totals.taxAmount),
    serviceChargeRate: toRateDecimal(calculated.serviceChargeRateBasisPoints),
    serviceChargeAmount: new Prisma.Decimal(totals.serviceChargeAmount),
    total: new Prisma.Decimal(totals.total),
    note: input.note ?? null,
  };
}

function itemCreateData(lines: PreparedLine[]) {
  return lines.map((line) => ({
    id: randomUUID(),
    productId: line.productId,
    variantId: line.variantId,
    productName: line.productName,
    variantName: line.variantName,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    note: line.note,
    addons: { create: line.addons.map(({ addonId, addonName, unitPrice, quantity }) => ({ addonId, addonName, unitPrice, quantity })) },
  }));
}

export async function saveDraftOrderInTransaction(tx: Prisma.TransactionClient, input: SaveDraftInput, actorId: string) {
      if ((input.type === "DINE_IN" && !input.tableId) || (input.type === "TAKEAWAY" && input.tableId)) {
        throw new OrderServiceError("Pilih meja yang sesuai dengan tipe pesanan.", "INVALID_REFERENCE");
      }
      const now = new Date();
      const calculated = await calculateDraft(tx, input, now);
      const snapshot = orderSnapshotData(input, actorId, calculated);
      let order;
      if (input.orderId) {
        // Conditional update obtains the row lock and rechecks status after any
        // concurrent checkout has committed, so a draft save cannot overwrite a paid order.
        const claimed = await tx.order.updateMany({
          where: { id: input.orderId, cashierId: actorId, status: "DRAFT" },
          data: { updatedAt: now },
        });
        if (!claimed.count) throw new OrderServiceError("Hanya pesanan draft yang dapat dilanjutkan.", "INVALID_STATE");
        const previous = await tx.order.findUnique({ where: { id: input.orderId }, select: { id: true } });
        if (!previous) throw new OrderServiceError("Pesanan tidak ditemukan.", "NOT_FOUND");
        await tx.orderItem.deleteMany({ where: { orderId: previous.id } });
        order = await tx.order.update({
          where: { id: previous.id },
          data: { ...snapshot, items: { create: itemCreateData(calculated.preparedLines) } },
          include: { items: { include: { addons: true } } },
        });
      } else {
        order = await tx.order.create({
          data: {
            ...snapshot,
            orderNumber: makeOrderNumber(now),
            status: "DRAFT",
            items: { create: itemCreateData(calculated.preparedLines) },
          },
          include: { items: { include: { addons: true } } },
        });
      }
      await audit(tx, actorId, input.orderId ? "ORDER_DRAFT_UPDATED" : "ORDER_DRAFT_CREATED", order.id, {
        orderNumber: order.orderNumber,
        itemCount: calculated.preparedLines.length,
        total: order.total.toFixed(2),
      });
      return order;
}

export async function saveDraftOrder(input: SaveDraftInput, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = input.orderId ? await tx.order.findUnique({ where: { id: input.orderId }, select: { id: true, cashierId: true, status: true, tableId: true } }) : null;
      if (input.orderId && (!previous || previous.cashierId !== actorId || previous.status !== "DRAFT")) throw new OrderServiceError("Pesanan draft tidak ditemukan.", "INVALID_STATE");
      const sourceRoot = previous?.tableId ? await resolveTableRootInTransaction(tx, previous.tableId) : null;
      const assignedTableId = input.type === "DINE_IN" && input.tableId ? await claimDineInTable(tx, input.tableId) : null;
      const order = await saveDraftOrderInTransaction(tx, { ...input, tableId: assignedTableId }, actorId);
      if (sourceRoot && sourceRoot !== assignedTableId) {
        await refreshTableGroupAfterOrderChange(tx, sourceRoot);
        await audit(tx, actorId, "ORDER_TABLE_MOVED", order.id, { fromTableId: previous?.tableId ?? null, toTableId: assignedTableId });
      }
      return order;
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function cancelDraftOrder(orderId: string, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const draft = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true, cashierId: true, status: true, type: true, tableId: true } });
      if (!draft || draft.cashierId !== actorId || draft.status !== "DRAFT") throw new OrderServiceError("Pesanan draft tidak ditemukan atau sudah berubah status.", "INVALID_STATE");
      const result = await tx.order.updateMany({ where: { id: orderId, cashierId: actorId, status: "DRAFT" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      if (!result.count) throw new OrderServiceError("Pesanan draft tidak ditemukan atau sudah berubah status.", "INVALID_STATE");
      await audit(tx, actorId, "ORDER_CANCELLED", orderId, { orderNumber: draft.orderNumber });
      if (draft.type === "DINE_IN" && draft.tableId) {
        const rootId = await resolveTableRootInTransaction(tx, draft.tableId);
        await refreshTableGroupAfterOrderChange(tx, rootId);
      }
      return { id: orderId };
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function checkoutOrder(input: CheckoutInput, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id: input.orderId, cashierId: actorId, status: "DRAFT" }, data: { status: "CONFIRMED" } });
      if (!claimed.count) throw new OrderServiceError("Pesanan draft tidak ditemukan atau sudah dibayar.", "INVALID_STATE");
      const existing = await tx.order.findUnique({
        where: { id: input.orderId },
        include: { items: { include: { addons: true } } },
      });
      if (!existing) throw new OrderServiceError("Pesanan tidak ditemukan.", "NOT_FOUND");
      if (!existing.items.length) throw new OrderServiceError("Pesanan tidak memiliki produk.", "INVALID_STATE");
      if (existing.type === "DINE_IN" && !existing.tableId) throw new OrderServiceError("Pilih meja untuk pesanan makan di tempat.", "INVALID_REFERENCE");

      const assignedTableId = existing.type === "DINE_IN" && existing.tableId
        ? await claimDineInTable(tx, existing.tableId)
        : null;

      const draftInput: SaveDraftInput = {
        type: existing.type,
        tableId: assignedTableId,
        customerId: existing.customerId,
        discountId: existing.discountId,
        note: existing.note,
        lines: existing.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          addonIds: item.addons.map((addon) => addon.addonId),
          quantity: item.quantity,
          note: item.note,
        })),
      };
      const calculated = await calculateDraft(tx, draftInput, new Date());
      validateCheckoutInventory(calculated.preparedLines);
      let tender: ReturnType<typeof validateTender>;
      try {
        tender = validateTender(input.method, calculated.totals.total, input.tenderedAmount);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "";
        throw new OrderServiceError(
          reason.includes("underpayment") ? "Nominal pembayaran kurang dari total pesanan." : "Pembayaran non-tunai harus sesuai dengan total pesanan.",
          "INVALID_PAYMENT",
        );
      }

      for (let index = 0; index < existing.items.length; index += 1) {
        const oldItem = existing.items[index];
        const newItem = calculated.preparedLines[index];
        await tx.orderItem.update({
          where: { id: oldItem.id },
          data: {
            productId: newItem.productId, variantId: newItem.variantId,
            productName: newItem.productName, variantName: newItem.variantName,
            quantity: newItem.quantity, unitPrice: newItem.unitPrice, note: newItem.note,
          },
        });
        await tx.orderItemAddon.deleteMany({ where: { orderItemId: oldItem.id } });
        if (newItem.addons.length) await tx.orderItemAddon.createMany({ data: newItem.addons.map(({ addonId, addonName, unitPrice, quantity }) => ({ addonId, addonName, unitPrice, quantity, orderItemId: oldItem.id })) });
      }
      await persistCheckoutIngredientSnapshots(tx, existing.items.map((item) => item.id), calculated.preparedLines);

      const snapshot = orderSnapshotData(draftInput, actorId, calculated);
      const order = await tx.order.update({ where: { id: existing.id }, data: snapshot });
      const cashSessionId = await lockOpenCashSessionForPayment(tx, actorId);
      await tx.payment.create({
        data: {
          orderId: order.id,
          kind: "CHARGE",
          amount: order.total,
          tenderedAmount: new Prisma.Decimal(tender.tenderedAmount),
          changeAmount: new Prisma.Decimal(tender.changeAmount),
          method: input.method,
          referenceNumber: input.referenceNumber,
          cashierId: actorId,
          cashSessionId,
        },
      });
      await audit(tx, actorId, "ORDER_CHECKED_OUT", order.id, {
        orderNumber: order.orderNumber, paymentMethod: input.method,
        amount: order.total.toFixed(2), tenderedAmount: tender.tenderedAmount, changeAmount: tender.changeAmount,
      });
      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: { include: { addons: true } }, payments: true } });
    });
  } catch (error) {
    return safeError(error);
  }
}

/** Create and charge a new cart in one transaction. A caller supplied UUID makes
 * concurrent retries collide on the primary key instead of charging twice. */
export async function checkoutCart(input: SaveDraftInput, payment: Omit<CheckoutInput, "orderId">, newOrderId: string, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      if ((input.type === "DINE_IN" && !input.tableId) || (input.type === "TAKEAWAY" && input.tableId)) {
        throw new OrderServiceError("Pilih meja yang sesuai dengan tipe pesanan.", "INVALID_REFERENCE");
      }
      const previous = input.orderId ? await tx.order.findUnique({ where: { id: input.orderId }, select: { id: true, cashierId: true, status: true, type: true, tableId: true } }) : null;
      if (input.orderId && (!previous || previous.cashierId !== actorId || previous.status !== "DRAFT")) {
        throw new OrderServiceError("Pesanan draft tidak ditemukan atau sudah dibayar.", "INVALID_STATE");
      }
      const sourceRoot = previous?.tableId ? await resolveTableRootInTransaction(tx, previous.tableId) : null;
      const assignedTableId = input.type === "DINE_IN" && input.tableId ? await claimDineInTable(tx, input.tableId) : null;
      const checkoutInput: SaveDraftInput = { ...input, tableId: assignedTableId };
      const calculated = await calculateDraft(tx, checkoutInput, new Date());
      validateCheckoutInventory(calculated.preparedLines);
      let tender: ReturnType<typeof validateTender>;
      try {
        tender = validateTender(payment.method, calculated.totals.total, payment.tenderedAmount);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "";
        throw new OrderServiceError(
          reason.includes("underpayment") ? "Nominal pembayaran kurang dari total pesanan." : "Pembayaran non-tunai harus sesuai dengan total pesanan.",
          "INVALID_PAYMENT",
        );
      }
      const now = new Date();
      const snapshot = orderSnapshotData(checkoutInput, actorId, calculated);
      const orderId = input.orderId ?? newOrderId;
      let order;
      let orderItemIds: string[];
      const itemsToCreate = itemCreateData(calculated.preparedLines);
      if (input.orderId) {
        const claimed = await tx.order.updateMany({ where: { id: input.orderId, cashierId: actorId, status: "DRAFT" }, data: { status: "CONFIRMED" } });
        if (!claimed.count) throw new OrderServiceError("Pesanan draft tidak ditemukan atau sudah dibayar.", "INVALID_STATE");
        const previous = await tx.order.findUnique({ where: { id: input.orderId }, select: { id: true, orderNumber: true } });
        if (!previous) throw new OrderServiceError("Pesanan tidak ditemukan.", "NOT_FOUND");
        await tx.orderItem.deleteMany({ where: { orderId } });
        order = await tx.order.update({
          where: { id: orderId },
          data: { ...snapshot, status: "CONFIRMED", items: { create: itemsToCreate } },
          include: { items: { include: { addons: true } }, payments: true },
        });
        orderItemIds = itemsToCreate.map((item) => item.id);
      } else {
        const orderNumber = makeOrderNumber(now);
        const inserted = await tx.order.createMany({
          data: [{ id: orderId, ...snapshot, orderNumber, status: "CONFIRMED" }],
          skipDuplicates: true,
        });
        if (!inserted.count) throw new OrderServiceError("Pesanan ini sudah diproses. Muat ulang daftar pesanan.", "INVALID_STATE");
        orderItemIds = [];
        for (const lineData of itemsToCreate) {
          const item = await tx.orderItem.create({ data: { orderId, ...lineData }, select: { id: true } });
          orderItemIds.push(item.id);
        }
        order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, orderNumber: true, total: true } });
      }
      await persistCheckoutIngredientSnapshots(tx, orderItemIds, calculated.preparedLines);
      const cashSessionId = await lockOpenCashSessionForPayment(tx, actorId);
      await tx.payment.create({ data: {
        orderId: order.id, kind: "CHARGE", amount: order.total,
        tenderedAmount: new Prisma.Decimal(tender.tenderedAmount), changeAmount: new Prisma.Decimal(tender.changeAmount),
        method: payment.method, referenceNumber: payment.referenceNumber, cashierId: actorId, cashSessionId,
      } });
      await audit(tx, actorId, "ORDER_CHECKED_OUT", order.id, {
        orderNumber: order.orderNumber, paymentMethod: payment.method,
        amount: order.total.toFixed(2), tenderedAmount: tender.tenderedAmount, changeAmount: tender.changeAmount,
      });
      if (sourceRoot && sourceRoot !== assignedTableId) await refreshTableGroupAfterOrderChange(tx, sourceRoot);
      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: { include: { addons: true } }, payments: true } });
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function getOrderForReceipt(orderId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        cashier: { select: { name: true } },
        customer: { select: { name: true, phone: true } },
        items: { include: { addons: true } },
        payments: { orderBy: { paidAt: "asc" } },
      },
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function getPosData(actorId: string) {
  const prisma = getPrismaClient();
  const now = new Date();
  const effectiveActorId = isLocalPreviewMode()
    ? (await prisma.user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true } }))?.id ?? actorId
    : actorId;
  const [categories, products, customers, discounts, drafts, tables, cafeSettings] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({
      where: { isActive: true, category: { isActive: true } }, orderBy: { name: "asc" },
      include: {
        category: { select: { id: true, name: true } },
        variants: { where: { isActive: true }, orderBy: { name: "asc" } },
        addons: { where: { isActive: true }, orderBy: { name: "asc" } },
      },
    }),
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, phone: true } }),
    prisma.discount.findMany({
      where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      orderBy: { name: "asc" },
    }),
    prisma.order.findMany({
      where: { status: "DRAFT", cashierId: effectiveActorId }, orderBy: { updatedAt: "desc" }, take: 20,
      include: { items: { include: { addons: { select: { addonId: true } } } } },
    }),
    prisma.cafeTable.findMany({ where: { isActive: true, mergedIntoId: null }, orderBy: { name: "asc" }, include: { mergedTables: { where: { isActive: true }, orderBy: { name: "asc" } } } }),
    getCafeSettings(prisma),
  ]);
  return {
    taxRateBasisPoints: cafeSettings.taxRateBasisPoints,
    serviceChargeRateBasisPoints: cafeSettings.serviceChargeRateBasisPoints,
    categories,
    products: products.map((product) => ({
      id: product.id, name: product.name, sku: product.sku, categoryId: product.categoryId,
      categoryName: product.category.name, basePrice: product.basePrice.toFixed(2),
      variants: product.variants.map((variant) => ({ id: variant.id, name: variant.name, sku: variant.sku, price: variant.price.toFixed(2) })),
      addons: product.addons.map((addon) => ({ id: addon.id, name: addon.name, price: addon.price.toFixed(2) })),
    })),
    customers,
    discounts: discounts.map((discount) => ({
      id: discount.id, name: discount.name, type: discount.type, scope: discount.scope,
      value: discount.value.toFixed(2), maxAmount: discount.maxAmount?.toFixed(2) ?? null,
      productId: discount.productId,
    })),
    drafts: drafts.map((draft) => ({
      id: draft.id, orderNumber: draft.orderNumber, note: draft.note, type: draft.type, tableId: draft.tableId,
      customerId: draft.customerId, discountId: draft.discountId, total: draft.total.toFixed(2), updatedAt: draft.updatedAt,
      lines: draft.items.map((item) => ({
        id: item.id, productId: item.productId, productName: item.productName, variantName: item.variantName, variantId: item.variantId, quantity: item.quantity, note: item.note,
        addonIds: item.addons.map((addon) => addon.addonId),
      })),
    })),
    tables: tables.map((table) => ({
      id: table.id, name: table.name, capacity: table.capacity + table.mergedTables.reduce((sum, member) => sum + member.capacity, 0),
      status: table.status, members: [table.name, ...table.mergedTables.map((member) => member.name)],
    })),
  };
}

export async function listOrders(actorId: string, role: UserRole) {
  const prisma = getPrismaClient();
  return prisma.order.findMany({
    where: role === "CASHIER" ? { cashierId: actorId } : {},
    orderBy: { createdAt: "desc" }, take: 100,
    include: { cashier: { select: { name: true } }, customer: { select: { name: true } }, table: { select: { name: true, mergedInto: { select: { name: true } } } }, payments: { select: { method: true } }, _count: { select: { items: true } } },
  });
}
