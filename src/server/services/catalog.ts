import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import type { AddonInput, CategoryInput, ProductInput, VariantInput } from "@/server/catalog/validation";

export class CatalogError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "IN_USE" | "DUPLICATE" | "INVALID_REFERENCE" | "DATABASE") {
    super(message);
    this.name = "CatalogError";
  }
}

type Db = PrismaClient | Prisma.TransactionClient;
type ActorId = string | null;

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeError(error: unknown): never {
  if (error instanceof CatalogError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new CatalogError("Nama atau SKU tersebut sudah digunakan.", "DUPLICATE");
    }
    if (error.code === "P2003" || error.code === "P2014") {
      throw new CatalogError("Data ini sedang digunakan dan tidak dapat dihapus.", "IN_USE");
    }
    if (error.code === "P2025") {
      throw new CatalogError("Data katalog tidak ditemukan.", "NOT_FOUND");
    }
  }
  console.error("Catalog operation failed.", error);
  throw new CatalogError("Perubahan katalog belum dapat disimpan. Coba lagi.", "DATABASE");
}

async function audit(
  db: Db,
  actorId: ActorId,
  action: string,
  entity: string,
  entityId: string,
  metadata: Prisma.InputJsonObject = {},
) {
  await db.auditLog.create({
    data: { userId: actorId, action, entity, entityId, metadata },
  });
}

export async function listCategories() {
  return getPrismaClient().category.findMany({
    orderBy: [{ name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
}

export async function createCategory(input: CategoryInput, actorId: ActorId) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.category.create({
        data: { name: input.name, slug: slugify(input.name), description: input.description, isActive: input.isActive },
      });
      await audit(tx, actorId, "CATEGORY_CREATED", "Category", category.id, { name: category.name });
      return category;
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function updateCategory(input: CategoryInput, actorId: ActorId) {
  if (!input.id) throw new CatalogError("Kategori tidak ditemukan.", "NOT_FOUND");
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.category.update({
        where: { id: input.id },
        data: { name: input.name, slug: slugify(input.name), description: input.description, isActive: input.isActive },
      });
      await audit(tx, actorId, "CATEGORY_UPDATED", "Category", category.id, { name: category.name, isActive: category.isActive });
      return category;
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function deleteCategory(id: string, actorId: ActorId) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
      if (!category) throw new CatalogError("Kategori tidak ditemukan.", "NOT_FOUND");
      if (category._count.products > 0) {
        throw new CatalogError("Kategori masih dipakai produk. Nonaktifkan kategori atau pindahkan produknya terlebih dahulu.", "IN_USE");
      }
      await audit(tx, actorId, "CATEGORY_DELETED", "Category", category.id, { name: category.name });
      await tx.category.delete({ where: { id } });
      return { id };
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function listProductCategories() {
  return getPrismaClient().category.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export async function listCategoriesForProduct(categoryId: string) {
  return getPrismaClient().category.findMany({
    where: { OR: [{ isActive: true }, { id: categoryId }] },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isActive: true },
  });
}

export type ProductFilters = { query?: string; categoryId?: string; status?: "active" | "inactive" | "all" };

export async function listProducts(filters: ProductFilters = {}) {
  const query = filters.query?.trim();
  return getPrismaClient().product.findMany({
    where: {
      ...(filters.status === "active" ? { isActive: true } : {}),
      ...(filters.status === "inactive" ? { isActive: false } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { sku: { contains: query, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { category: { select: { name: true } }, _count: { select: { variants: true, addons: true, orderItems: true } } },
  });
}

export async function getProductForEdit(id: string) {
  return getPrismaClient().product.findUnique({
    where: { id },
    include: {
      category: { select: { name: true } },
      variants: { orderBy: [{ isActive: "desc" }, { name: "asc" }] },
      addons: { orderBy: [{ isActive: "desc" }, { name: "asc" }], select: { id: true, name: true, price: true, isActive: true } },
      _count: { select: { orderItems: true } },
    },
  });
}

export async function createProduct(input: ProductInput, actorId: ActorId) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({ where: { id: input.categoryId }, select: { id: true, isActive: true } });
      if (!category?.isActive) throw new CatalogError("Pilih kategori aktif yang tersedia.", "INVALID_REFERENCE");
      const product = await tx.product.create({
        data: {
          name: input.name, sku: input.sku, categoryId: input.categoryId,
          description: input.description, imageUrl: input.imageUrl,
          basePrice: new Prisma.Decimal(input.basePrice), isActive: input.isActive,
          trackInventory: input.trackInventory,
        },
      });
      await audit(tx, actorId, "PRODUCT_CREATED", "Product", product.id, { name: product.name, sku: product.sku, basePrice: product.basePrice.toFixed(2) });
      return product;
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function updateProduct(input: ProductInput, actorId: ActorId) {
  if (!input.id) throw new CatalogError("Produk tidak ditemukan.", "NOT_FOUND");
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.product.findUnique({ where: { id: input.id }, select: { id: true, basePrice: true, categoryId: true } });
      if (!previous) throw new CatalogError("Produk tidak ditemukan.", "NOT_FOUND");
      const category = await tx.category.findUnique({ where: { id: input.categoryId }, select: { id: true, isActive: true } });
      if (!category || (!category.isActive && category.id !== previous.categoryId)) {
        throw new CatalogError("Pilih kategori aktif yang tersedia.", "INVALID_REFERENCE");
      }
      const product = await tx.product.update({
        where: { id: input.id },
        data: {
          name: input.name, sku: input.sku, categoryId: input.categoryId,
          description: input.description, imageUrl: input.imageUrl,
          basePrice: new Prisma.Decimal(input.basePrice), isActive: input.isActive,
          trackInventory: input.trackInventory,
        },
      });
      const priceChanged = !previous.basePrice.equals(product.basePrice);
      await audit(tx, actorId, priceChanged ? "PRODUCT_PRICE_CHANGED" : "PRODUCT_UPDATED", "Product", product.id, {
        name: product.name, sku: product.sku,
        ...(priceChanged ? { oldPrice: previous.basePrice.toFixed(2), newPrice: product.basePrice.toFixed(2) } : {}),
      });
      return product;
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function setProductActive(id: string, isActive: boolean, actorId: ActorId) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.update({ where: { id }, data: { isActive } });
      await audit(tx, actorId, "PRODUCT_STATUS_CHANGED", "Product", product.id, { isActive });
      return product;
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function deleteProduct(id: string, actorId: ActorId) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id }, include: { _count: { select: { orderItems: true } } } });
      if (!product) throw new CatalogError("Produk tidak ditemukan.", "NOT_FOUND");
      if (product._count.orderItems) throw new CatalogError("Produk sudah tercatat di pesanan. Nonaktifkan produk agar histori tetap terjaga.", "IN_USE");
      await audit(tx, actorId, "PRODUCT_DELETED", "Product", id, { name: product.name, sku: product.sku });
      await tx.product.delete({ where: { id } });
      return { id };
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function createVariant(input: VariantInput, actorId: ActorId) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({ data: { ...input, price: new Prisma.Decimal(input.price) } });
      await audit(tx, actorId, "PRODUCT_VARIANT_CREATED", "ProductVariant", variant.id, { productId: variant.productId, name: variant.name, sku: variant.sku });
      return variant;
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function updateVariant(input: VariantInput, actorId: ActorId) {
  if (!input.id) throw new CatalogError("Varian tidak ditemukan.", "NOT_FOUND");
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.productVariant.findUnique({ where: { id: input.id }, select: { id: true, productId: true, price: true } });
      if (!previous) throw new CatalogError("Varian tidak ditemukan.", "NOT_FOUND");
      if (previous.productId !== input.productId) throw new CatalogError("Varian tidak sesuai dengan produk.", "INVALID_REFERENCE");
      const variant = await tx.productVariant.update({
        where: { id: input.id },
        data: { name: input.name, sku: input.sku, price: new Prisma.Decimal(input.price), isActive: input.isActive },
      });
      const priceChanged = !previous.price.equals(variant.price);
      await audit(tx, actorId, priceChanged ? "PRODUCT_VARIANT_PRICE_CHANGED" : "PRODUCT_VARIANT_UPDATED", "ProductVariant", variant.id, {
        productId: variant.productId, name: variant.name, sku: variant.sku,
        ...(priceChanged ? { oldPrice: previous.price.toFixed(2), newPrice: variant.price.toFixed(2) } : {}),
      });
      return variant;
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function deleteVariant(id: string, actorId: ActorId) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({ where: { id }, select: { id: true, productId: true, name: true } });
      if (!variant) throw new CatalogError("Varian tidak ditemukan.", "NOT_FOUND");
      const draftReferences = await tx.orderItem.count({ where: { variantId: id, order: { status: "DRAFT" } } });
      if (draftReferences) throw new CatalogError("Varian sedang dipakai pesanan yang ditahan. Perbarui atau batalkan pesanan terlebih dahulu.", "IN_USE");
      await audit(tx, actorId, "PRODUCT_VARIANT_DELETED", "ProductVariant", id, { name: variant.name });
      await tx.productVariant.delete({ where: { id } });
      return { id, productId: variant.productId };
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function listAddons() {
  return getPrismaClient().addon.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      products: { select: { id: true, name: true } },
      _count: { select: { orderItems: true } },
    },
  });
}

export async function listProductsForAddon() {
  return getPrismaClient().product.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], select: { id: true, name: true, isActive: true } });
}

export async function saveAddon(input: AddonInput, actorId: ActorId) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = input.id ? await tx.addon.findUnique({ where: { id: input.id }, select: { id: true, price: true, products: { select: { id: true } } } }) : null;
      if (input.id && !previous) throw new CatalogError("Add-on tidak ditemukan.", "NOT_FOUND");
      const existingIds = new Set(previous?.products.map(({ id }) => id) ?? []);
      const products = input.productIds.length
        ? await tx.product.findMany({ where: { id: { in: input.productIds } }, select: { id: true, isActive: true } })
        : [];
      if (products.length !== input.productIds.length) {
        throw new CatalogError("Satu atau lebih produk tidak ditemukan.", "INVALID_REFERENCE");
      }
      if (products.some(({ id, isActive }) => !isActive && !existingIds.has(id))) {
        throw new CatalogError("Add-on hanya dapat ditambahkan ke produk aktif.", "INVALID_REFERENCE");
      }

      const addon = input.id
        ? await tx.addon.update({
            where: { id: input.id },
            data: { name: input.name, price: new Prisma.Decimal(input.price), isActive: input.isActive, products: { set: products.map(({ id }) => ({ id })) } },
          })
        : await tx.addon.create({
            data: { name: input.name, price: new Prisma.Decimal(input.price), isActive: input.isActive, products: { connect: products.map(({ id }) => ({ id })) } },
          });

      const priceChanged = !!previous && !previous.price.equals(addon.price);
      await audit(tx, actorId, priceChanged ? "ADDON_PRICE_CHANGED" : input.id ? "ADDON_UPDATED" : "ADDON_CREATED", "Addon", addon.id, {
        name: addon.name, price: addon.price.toFixed(2), productIds: products.map(({ id }) => id),
        ...(priceChanged ? { oldPrice: previous!.price.toFixed(2), newPrice: addon.price.toFixed(2) } : {}),
      });
      return addon;
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function deleteAddon(id: string, actorId: ActorId) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const addon = await tx.addon.findUnique({ where: { id }, include: { _count: { select: { orderItems: true } } } });
      if (!addon) throw new CatalogError("Add-on tidak ditemukan.", "NOT_FOUND");
      if (addon._count.orderItems) throw new CatalogError("Add-on tercatat di histori pesanan. Nonaktifkan add-on agar histori tetap terjaga.", "IN_USE");
      await audit(tx, actorId, "ADDON_DELETED", "Addon", id, { name: addon.name });
      await tx.addon.delete({ where: { id } });
      return { id };
    });
  } catch (error) {
    return safeError(error);
  }
}
