import "dotenv/config";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { createCategory, createProduct } from "@/server/services/catalog";
import { discountInputSchema } from "@/server/orders/validation";
import { listDiscounts, saveDiscount } from "@/server/services/discounts";

const integrationDescribe = process.env.ORDER_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("discount services against PostgreSQL", () => {
  it("creates, updates, lists, and audits a product-specific discount", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true } });
    if (!owner) throw new Error("Run the local database seed before discount integration tests.");
    const suffix = `${Date.now()}`;
    const category = await createCategory({ name: `Discount test ${suffix}`, description: null, isActive: true }, owner.id);
    const product = await createProduct({
      name: `Discount product ${suffix}`, sku: `DSC-${suffix}`, categoryId: category.id,
      description: null, imageUrl: null, basePrice: "10000.00", isActive: true, trackInventory: false,
    }, owner.id);
    let discountId: string | undefined;
    try {
      const discount = await saveDiscount(discountInputSchema.parse({
        name: `Half price ${suffix}`, type: "PERCENTAGE", scope: "PRODUCT", value: "50.00", maxAmount: "4000.00",
        productId: product.id, isActive: true, startsAt: "2026-10-01", endsAt: "2026-10-31",
      }), owner.id);
      discountId = discount.id;
      expect(discount.value.equals(new Prisma.Decimal("50.00"))).toBe(true);
      expect(discount.maxAmount?.equals(new Prisma.Decimal("4000.00"))).toBe(true);
      expect(discount.startsAt?.toISOString()).toBe("2026-09-30T17:00:00.000Z");
      expect(discount.endsAt?.toISOString()).toBe("2026-10-31T16:59:59.999Z");
      expect(await listDiscounts()).toEqual(expect.arrayContaining([expect.objectContaining({ id: discount.id })]));

      const updated = await saveDiscount(discountInputSchema.parse({
        id: discount.id, name: `Half price updated ${suffix}`, type: "PERCENTAGE", scope: "PRODUCT", value: "40.00",
        maxAmount: "4000.00", productId: product.id, isActive: true, startsAt: "2026-10-01", endsAt: "2026-10-31",
      }), owner.id);
      expect(updated.name).toBe(`Half price updated ${suffix}`);
      expect(updated.value.equals(new Prisma.Decimal("40.00"))).toBe(true);
      expect(await prisma.auditLog.count({ where: { entityId: discount.id, action: { in: ["DISCOUNT_CREATED", "DISCOUNT_UPDATED"] } } })).toBe(2);
    } finally {
      if (discountId) await prisma.discount.deleteMany({ where: { id: discountId } });
      await prisma.product.deleteMany({ where: { id: product.id } });
      await prisma.category.deleteMany({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });
});
