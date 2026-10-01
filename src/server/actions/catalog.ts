"use server";

import { revalidatePath } from "next/cache";
import { requireRouteAccess } from "@/lib/auth/guards";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { type CatalogActionState } from "@/server/catalog/action-state";
import {
  addonInputSchema,
  categoryInputSchema,
  productInputSchema,
  productStatusInputSchema,
  variantInputSchema,
} from "@/server/catalog/validation";
import { CatalogError, createCategory, createProduct, createVariant, deleteAddon, deleteCategory, deleteProduct, deleteVariant, saveAddon, setProductActive, updateCategory, updateProduct, updateVariant } from "@/server/services/catalog";

function formValue(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

function isChecked(formData: FormData, name: string, fallback: boolean) {
  const values = formData.getAll(name).map(String);
  if (!values.length) return fallback;
  return values.some((value) => value === "true" || value === "on");
}

function submittedValues(formData?: FormData) {
  if (!formData) return undefined;
  const values: NonNullable<CatalogActionState["values"]> = {};
  for (const name of new Set(formData.keys())) {
    const entries = formData.getAll(name).map(String);
    if (name === "isActive" || name === "trackInventory") {
      values[name] = entries.includes("true") || entries.includes("on");
    } else if (name === "productIds") {
      values[name] = entries;
    } else if (name !== "$ACTION_REF_0" && name !== "$ACTION_ID_0") {
      values[name] = entries.at(-1) ?? "";
    }
  }
  return values;
}

function parseFailure(error: unknown, formData?: FormData): CatalogActionState {
  if (error instanceof CatalogError) return { message: error.message, error: true, values: submittedValues(formData) };
  console.error("Catalog action failed.", error);
  return { message: "Permintaan belum dapat diproses. Coba lagi.", error: true, values: submittedValues(formData) };
}

function validationFailure(error: { issues: { path: PropertyKey[]; message: string }[] }, formData?: FormData): CatalogActionState {
  const firstIssue = error.issues[0];
  return { message: firstIssue?.message ?? "Periksa kembali data yang dimasukkan.", error: true, values: submittedValues(formData) };
}

function categoryData(formData: FormData) {
  return {
    id: formValue(formData, "id") || undefined,
    name: formValue(formData, "name"),
    description: formValue(formData, "description"),
    isActive: isChecked(formData, "isActive", true),
  };
}

function productData(formData: FormData) {
  return {
    id: formValue(formData, "id") || undefined,
    name: formValue(formData, "name"),
    sku: formValue(formData, "sku"),
    categoryId: formValue(formData, "categoryId"),
    description: formValue(formData, "description"),
    imageUrl: formValue(formData, "imageUrl"),
    basePrice: formValue(formData, "basePrice"),
    isActive: isChecked(formData, "isActive", true),
    trackInventory: isChecked(formData, "trackInventory", false),
  };
}

function variantData(formData: FormData) {
  return {
    id: formValue(formData, "id") || undefined,
    productId: formValue(formData, "productId"),
    name: formValue(formData, "name"),
    sku: formValue(formData, "sku"),
    price: formValue(formData, "price"),
    isActive: isChecked(formData, "isActive", true),
  };
}

function addonData(formData: FormData) {
  return {
    id: formValue(formData, "id") || undefined,
    name: formValue(formData, "name"),
    price: formValue(formData, "price"),
    isActive: isChecked(formData, "isActive", true),
    productIds: formData.getAll("productIds").map(String),
  };
}

async function auditActorId(userId: string): Promise<string | null> {
  if (!isLocalPreviewMode()) return userId;
  // Preview mode resolves the seeded owner so local catalog actions retain an attributable audit trail.
  const { getPrismaClient } = await import("@/lib/db/prisma");
  const actor = await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } });
  return actor?.isActive ? actor.id : null;
}

export async function saveCategoryAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("categories");
  const parsed = categoryInputSchema.safeParse(categoryData(formData));
  if (!parsed.success) return validationFailure(parsed.error, formData);
  try {
    const actorId = await auditActorId(user.id);
    if (parsed.data.id) await updateCategory(parsed.data, actorId);
    else await createCategory(parsed.data, actorId);
    revalidatePath("/categories");
    revalidatePath("/products");
    return { message: parsed.data.id ? "Kategori berhasil diperbarui." : "Kategori berhasil ditambahkan." };
  } catch (error) {
    return parseFailure(error, formData);
  }
}

export async function deleteCategoryAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("categories");
  const id = formValue(formData, "id");
  if (!categoryInputSchema.shape.id.safeParse(id).success) return { message: "Kategori tidak ditemukan.", error: true };
  try {
    await deleteCategory(id, await auditActorId(user.id));
    revalidatePath("/categories");
    revalidatePath("/products");
    return { message: "Kategori berhasil dihapus." };
  } catch (error) {
    return parseFailure(error);
  }
}

export async function saveProductAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("products");
  const parsed = productInputSchema.safeParse(productData(formData));
  if (!parsed.success) return validationFailure(parsed.error, formData);
  try {
    const actorId = await auditActorId(user.id);
    const product = parsed.data.id
      ? await updateProduct(parsed.data, actorId)
      : await createProduct(parsed.data, actorId);
    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath(`/products/${product.id}`);
    return { message: parsed.data.id ? "Produk berhasil diperbarui." : "Produk berhasil ditambahkan." };
  } catch (error) {
    return parseFailure(error, formData);
  }
}

export async function setProductActiveAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("products");
  const parsed = productStatusInputSchema.safeParse({ id: formValue(formData, "id"), isActive: formValue(formData, "isActive") });
  if (!parsed.success) return validationFailure(parsed.error, formData);
  const { id, isActive } = parsed.data;
  try {
    await setProductActive(id, isActive, await auditActorId(user.id));
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return { message: "Status produk berhasil diperbarui." };
  } catch (error) {
    return parseFailure(error, formData);
  }
}

export async function deleteProductAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("products");
  const id = formValue(formData, "id");
  if (!categoryInputSchema.shape.id.safeParse(id).success) return { message: "Produk tidak ditemukan.", error: true };
  try {
    await deleteProduct(id, await auditActorId(user.id));
    revalidatePath("/products");
    return { message: "Produk berhasil dihapus." };
  } catch (error) {
    return parseFailure(error);
  }
}

export async function saveVariantAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("products");
  const parsed = variantInputSchema.safeParse(variantData(formData));
  if (!parsed.success) return validationFailure(parsed.error, formData);
  try {
    const actorId = await auditActorId(user.id);
    const variant = parsed.data.id ? await updateVariant(parsed.data, actorId) : await createVariant(parsed.data, actorId);
    revalidatePath(`/products/${variant.productId}`);
    revalidatePath("/products");
    return { message: parsed.data.id ? "Varian berhasil diperbarui." : "Varian berhasil ditambahkan." };
  } catch (error) {
    return parseFailure(error, formData);
  }
}

export async function deleteVariantAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("products");
  const id = formValue(formData, "id");
  if (!categoryInputSchema.shape.id.safeParse(id).success) return { message: "Varian tidak ditemukan.", error: true };
  try {
    const deleted = await deleteVariant(id, await auditActorId(user.id));
    revalidatePath(`/products/${deleted.productId}`);
    return { message: "Varian berhasil dihapus." };
  } catch (error) {
    return parseFailure(error);
  }
}

export async function saveAddonAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("addons");
  const parsed = addonInputSchema.safeParse(addonData(formData));
  if (!parsed.success) return validationFailure(parsed.error, formData);
  try {
    await saveAddon(parsed.data, await auditActorId(user.id));
    revalidatePath("/addons");
    revalidatePath("/products");
    for (const id of parsed.data.productIds) revalidatePath(`/products/${id}`);
    return { message: parsed.data.id ? "Add-on berhasil diperbarui." : "Add-on berhasil ditambahkan." };
  } catch (error) {
    return parseFailure(error, formData);
  }
}

export async function deleteAddonAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("addons");
  const id = formValue(formData, "id");
  if (!categoryInputSchema.shape.id.safeParse(id).success) return { message: "Add-on tidak ditemukan.", error: true };
  try {
    await deleteAddon(id, await auditActorId(user.id));
    revalidatePath("/addons");
    revalidatePath("/products");
    return { message: "Add-on berhasil dihapus." };
  } catch (error) {
    return parseFailure(error);
  }
}
