import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { getSeedCatalog } from "../src/server/seed/catalog";
import { hashPassword } from "../src/server/auth/password";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the cafe POS database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const demoUsers = [
  {
    name: "Ayu Pratama",
    email: "owner@cafe.local",
    password: "CafeOwner2026!",
    role: "OWNER",
  },
  {
    name: "Bima Santoso",
    email: "manager@cafe.local",
    password: "CafeManager2026!",
    role: "MANAGER",
  },
  {
    name: "Sari Putri",
    email: "cashier@cafe.local",
    password: "CafeCashier2026!",
    role: "CASHIER",
  },
  {
    name: "Dimas Saputra",
    email: "kitchen@cafe.local",
    password: "CafeKitchen2026!",
    role: "KITCHEN",
  },
] as const;

async function seed() {
  const catalog = getSeedCatalog();
  const roleIds = new Map<string, string>();

  for (const name of ["OWNER", "MANAGER", "CASHIER", "KITCHEN"] as const) {
    const role = await prisma.role.upsert({
      where: { name },
      create: { name, description: `${name.toLowerCase()} access role` },
      update: { description: `${name.toLowerCase()} access role` },
    });
    roleIds.set(name, role.id);
  }

  const owner = demoUsers[0];
  const ownerPasswordHash = await hashPassword(owner.password);
  const ownerUser = await prisma.user.upsert({
    where: { email: owner.email },
    create: {
      name: owner.name,
      email: owner.email,
      passwordHash: ownerPasswordHash,
      roleId: roleIds.get(owner.role)!,
    },
    update: {
      name: owner.name,
      passwordHash: ownerPasswordHash,
      roleId: roleIds.get(owner.role)!,
      isActive: true,
    },
  });

  for (const user of demoUsers.slice(1)) {
    const passwordHash = await hashPassword(user.password);
    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        roleId: roleIds.get(user.role)!,
      },
      update: {
        name: user.name,
        passwordHash,
        roleId: roleIds.get(user.role)!,
        isActive: true,
      },
    });
  }

  const categoryIds = new Map<string, string>();
  for (const category of catalog.categories) {
    const record = await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: {
        name: category.name,
        description: category.description,
        isActive: true,
      },
    });
    categoryIds.set(category.slug, record.id);
  }

  const ingredientIds = new Map<string, string>();
  for (const ingredient of catalog.ingredients) {
    const record = await prisma.$transaction(async (transaction) => {
      const savedIngredient = await transaction.ingredient.upsert({
        where: { name: ingredient.name },
        create: {
          name: ingredient.name,
          unit: ingredient.unit,
          currentStock: new Prisma.Decimal(0),
          minimumStock: new Prisma.Decimal(ingredient.minimumStock),
          costPerUnit: new Prisma.Decimal(ingredient.costPerUnit),
        },
        update: {
          unit: ingredient.unit,
          minimumStock: new Prisma.Decimal(ingredient.minimumStock),
        },
      });
      const idempotencyKey = `seed:opening:${ingredient.name
        .toLowerCase()
        .replaceAll(" ", "-")}`;
      const openingTransaction = await transaction.inventoryTransaction.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });

      if (!openingTransaction) {
        const openingStock = new Prisma.Decimal(ingredient.openingStock);
        await transaction.ingredient.update({
          where: { id: savedIngredient.id },
          data: { currentStock: { increment: openingStock } },
        });
        await transaction.inventoryTransaction.create({
          data: {
            ingredientId: savedIngredient.id,
            type: "PURCHASE",
            quantityDelta: openingStock,
            unitCostSnapshot: new Prisma.Decimal(ingredient.costPerUnit),
            note: "Stok awal untuk data pengembangan lokal",
            idempotencyKey,
            performedById: ownerUser.id,
          },
        });
      }

      return savedIngredient;
    });
    ingredientIds.set(ingredient.name, record.id);
  }

  const addonIds = new Map<string, string>();
  for (const addon of catalog.addons) {
    const record = await prisma.addon.upsert({
      where: { name: addon.name },
      create: { name: addon.name, price: new Prisma.Decimal(addon.price) },
      update: { price: new Prisma.Decimal(addon.price), isActive: true },
    });
    addonIds.set(addon.name, record.id);
  }

  for (const product of catalog.products) {
    const productRecord = await prisma.product.upsert({
      where: { sku: product.sku },
      create: {
        name: product.name,
        sku: product.sku,
        description: product.description,
        basePrice: new Prisma.Decimal(product.price),
        categoryId: categoryIds.get(product.categorySlug)!,
        addons: {
          connect: (product.addonNames ?? []).map((name) => ({
            id: addonIds.get(name)!,
          })),
        },
      },
      update: {
        name: product.name,
        description: product.description,
        basePrice: new Prisma.Decimal(product.price),
        categoryId: categoryIds.get(product.categorySlug)!,
        isActive: true,
        addons: {
          set: (product.addonNames ?? []).map((name) => ({
            id: addonIds.get(name)!,
          })),
        },
      },
    });

    for (const variant of product.variants ?? []) {
      await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        create: {
          name: variant.name,
          sku: variant.sku,
          price: new Prisma.Decimal(variant.price),
          productId: productRecord.id,
        },
        update: {
          name: variant.name,
          price: new Prisma.Decimal(variant.price),
          productId: productRecord.id,
          isActive: true,
        },
      });
    }

    const recipe = await prisma.recipe.upsert({
      where: { productId: productRecord.id },
      create: { name: `${product.name} recipe`, productId: productRecord.id },
      update: { name: `${product.name} recipe` },
    });
    await prisma.recipeItem.deleteMany({ where: { recipeId: recipe.id } });
    await prisma.recipeItem.createMany({
      data: product.recipe.map((item) => ({
        recipeId: recipe.id,
        ingredientId: ingredientIds.get(item.ingredientName)!,
        quantity: new Prisma.Decimal(item.quantity),
      })),
    });
  }

  for (const table of catalog.tables) {
    await prisma.cafeTable.upsert({
      where: { name: table.name },
      create: { ...table, status: "AVAILABLE" },
      update: { ...table, status: "AVAILABLE" },
    });
  }

  console.info(
    `Seeded ${demoUsers.length} demo users, ${catalog.products.length} products, and ${catalog.ingredients.length} ingredients.`,
  );
}

seed()
  .catch((error: unknown) => {
    console.error("Database seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
