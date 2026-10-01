import "dotenv/config";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { addonInputSchema, categoryInputSchema, productInputSchema, variantInputSchema } from "@/server/catalog/validation";
import { createCategory, createProduct, createVariant, deleteAddon, deleteCategory, deleteProduct, deleteVariant, saveAddon, setProductActive, updateCategory, updateProduct, updateVariant } from "@/server/services/catalog";

const integrationDescribe = process.env.CATALOG_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("catalog CRUD against PostgreSQL", () => {
  it("creates, updates, relates, protects, and deletes catalog records transactionally", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true } });
    if (!owner) throw new Error("Run the local database seed before catalog integration tests.");

    const suffix = `${Date.now()}`;
    const categoryInput = categoryInputSchema.parse({ name: `Phase 2 ${suffix}`, description: "CRUD verification" });
    const category = await createCategory(categoryInput, owner.id);
    const sku = `P2-${suffix}`;
    let productId: string | undefined;
    let addonId: string | undefined;
    let orderId: string | undefined;

    try {
      const product = await createProduct(productInputSchema.parse({
        name: `Product ${suffix}`, sku, categoryId: category.id, description: "Created in integration test",
        imageUrl: "", basePrice: "25000.00", isActive: "true", trackInventory: "on",
      }), owner.id);
      productId = product.id;
      expect(product.basePrice.equals(new Prisma.Decimal("25000.00"))).toBe(true);

      const updatedProduct = await updateProduct(productInputSchema.parse({
        id: product.id, name: `Product updated ${suffix}`, sku, categoryId: category.id,
        description: "Updated", imageUrl: "", basePrice: "26000.50", isActive: "true", trackInventory: "false",
      }), owner.id);
      expect(updatedProduct.basePrice.equals(new Prisma.Decimal("26000.50"))).toBe(true);

      await expect(createProduct(productInputSchema.parse({
        name: `Duplicate ${suffix}`, sku, categoryId: category.id, description: "", imageUrl: "",
        basePrice: "1000", isActive: "true", trackInventory: "false",
      }), owner.id)).rejects.toMatchObject({ code: "DUPLICATE" });

      await expect(deleteCategory(category.id, owner.id)).rejects.toMatchObject({ code: "IN_USE" });

      const variantInput = variantInputSchema.parse({ productId: product.id, name: "Large", sku: `P2L-${suffix}`, price: "30000" });
      const variant = await createVariant(variantInput, owner.id);
      const updatedVariant = await updateVariant(variantInputSchema.parse({ ...variantInput, id: variant.id, name: "Extra large", price: "35000" }), owner.id);
      expect(updatedVariant.name).toBe("Extra large");
      const priceAudit = await prisma.auditLog.findFirst({ where: { entityId: variant.id, action: "PRODUCT_VARIANT_PRICE_CHANGED" } });
      expect(priceAudit?.metadata).toMatchObject({ oldPrice: "30000.00", newPrice: "35000.00" });
      await deleteVariant(variant.id, owner.id);
      expect(await prisma.productVariant.findUnique({ where: { id: variant.id } })).toBeNull();

      const addon = await saveAddon(addonInputSchema.parse({ name: `Extra ${suffix}`, price: "7000", isActive: "true", productIds: [product.id] }), owner.id);
      addonId = addon.id;
      expect((await prisma.addon.findUnique({ where: { id: addon.id }, include: { products: true } }))?.products).toHaveLength(1);
      await setProductActive(product.id, false, owner.id);
      await expect(saveAddon(addonInputSchema.parse({ name: `New addon ${suffix}`, price: "500", productIds: [product.id] }), owner.id))
        .rejects.toMatchObject({ code: "INVALID_REFERENCE" });
      await saveAddon(addonInputSchema.parse({ id: addon.id, name: addon.name, price: "7500", productIds: [product.id] }), owner.id);
      const addonPriceAudit = await prisma.auditLog.findFirst({ where: { entityId: addon.id, action: "ADDON_PRICE_CHANGED" } });
      expect(addonPriceAudit?.metadata).toMatchObject({ oldPrice: "7000.00", newPrice: "7500.00" });
      await setProductActive(product.id, true, owner.id);

      const order = await prisma.order.create({
        data: { orderNumber: `P2-ORDER-${suffix}`, type: "TAKEAWAY", cashierId: owner.id },
      });
      orderId = order.id;
      await prisma.orderItem.create({
        data: {
          orderId: order.id, productId: product.id, productName: product.name, quantity: 1,
          unitPrice: new Prisma.Decimal("26000.50"),
          addons: { create: { addonId: addon.id, addonName: addon.name, unitPrice: new Prisma.Decimal("7000.00") } },
        },
      });
      await expect(deleteProduct(product.id, owner.id)).rejects.toMatchObject({ code: "IN_USE" });
      await expect(deleteAddon(addon.id, owner.id)).rejects.toMatchObject({ code: "IN_USE" });

      await saveAddon(addonInputSchema.parse({ id: addon.id, name: `Extra ${suffix}`, price: "8000", isActive: "true", productIds: [] }), owner.id);
      expect((await prisma.addon.findUnique({ where: { id: addon.id }, include: { products: true } }))?.products).toHaveLength(0);

      await updateCategory(categoryInputSchema.parse({ id: category.id, name: `Phase 2 updated ${suffix}`, description: "Updated", isActive: "true" }), owner.id);
      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
      orderId = undefined;
      await deleteAddon(addon.id, owner.id);
      addonId = undefined;
      await deleteProduct(product.id, owner.id);
      productId = undefined;
      await deleteCategory(category.id, owner.id);

      const auditCount = await prisma.auditLog.count({
        where: { entityId: { in: [category.id, product.id] } },
      });
      expect(auditCount).toBeGreaterThanOrEqual(5);
    } finally {
      if (orderId) {
        await prisma.orderItem.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
      }
      if (addonId) await prisma.addon.deleteMany({ where: { id: addonId } });
      if (productId) await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.category.deleteMany({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });
});
