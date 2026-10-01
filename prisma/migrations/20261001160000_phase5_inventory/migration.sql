ALTER TABLE "Ingredient"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Ingredient_isActive_currentStock_minimumStock_idx"
  ON "Ingredient"("isActive", "currentStock", "minimumStock");

ALTER TABLE "Recipe"
  ALTER COLUMN "productId" DROP NOT NULL,
  ADD COLUMN "addonId" UUID;

CREATE UNIQUE INDEX "Recipe_addonId_key" ON "Recipe"("addonId");
ALTER TABLE "Recipe"
  ADD CONSTRAINT "Recipe_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "Addon"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Recipe_exactly_one_owner_check" CHECK (("productId" IS NOT NULL) <> ("addonId" IS NOT NULL));

CREATE TABLE "OrderItemIngredient" (
  "id" UUID NOT NULL,
  "orderItemId" UUID NOT NULL,
  "ingredientId" UUID NOT NULL,
  "ingredientNameSnapshot" TEXT NOT NULL,
  "unitSnapshot" "IngredientUnit" NOT NULL,
  "quantityRequired" DECIMAL(14,3) NOT NULL,
  "costPerUnitSnapshot" DECIMAL(14,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderItemIngredient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderItemIngredient_orderItemId_ingredientId_key"
  ON "OrderItemIngredient"("orderItemId", "ingredientId");
CREATE INDEX "OrderItemIngredient_ingredientId_idx"
  ON "OrderItemIngredient"("ingredientId");
ALTER TABLE "OrderItemIngredient"
  ADD CONSTRAINT "OrderItemIngredient_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OrderItemIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
