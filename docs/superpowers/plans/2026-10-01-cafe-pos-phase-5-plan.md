# Cafe POS Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Keep the checkboxes current and stop for review if a task reveals a schema or business-rule conflict.

**Goal:** Deliver auditable ingredient and recipe management, ledger-backed stock movements, and atomic recipe-based inventory deduction when an order is completed.

**Architecture:** Keep validation and exact quantity arithmetic in pure server modules. `src/server/services/inventory.ts` owns ingredient/recipe mutations, serialized ledger movements, weighted-average cost, and the transaction-scoped order deduction helper. Checkout captures immutable ingredient requirements in the same transaction as payment/confirmation; the existing order workflow calls the deduction helper in the same transaction as READY → COMPLETED. Server actions authorize and validate, while thin protected pages render safe projections.

**Tech Stack:** Existing Next.js App Router, TypeScript strict mode, PostgreSQL, Prisma, Auth.js, Zod, React Server Actions, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-cafe-pos-phase-5-design.md`

## Global Constraints

- Follow the spec as the source of business rules; preserve existing Phase 1–4 behavior.
- Use `Prisma.Decimal` for all stock and cost arithmetic; do not use JS `number` for financial/quantity calculations.
- Every mutation validates with Zod and authorizes server-side. Inventory and cost projections are OWNER/MANAGER only.
- Every stock delta and its ledger row, audit record, and weighted-average cost update commit atomically.
- Lock ingredients in stable ID order before balance reads/updates. Do not allow negative stock. `SALE` is service-only.
- Capture requirements/cost snapshots only at checkout, not while saving a draft. Do so for both checkout paths.
- Completion consumes checkout snapshots even if an ingredient was deactivated later. New recipes and checkout snapshots may not use inactive ingredients.
- Product recipes apply per sold unit across variants; addon recipe quantities are multiplied by addon quantity and parent line quantity. An untracked product or recipe-less addon creates no requirement; tracked products without a recipe cannot check out.
- Never hard-delete ingredients with history or permanently delete financial/stock ledger entries. Do not silently convert units.
- Keep UI labels in Indonesian and formatting consistent with existing rupiah/quantity conventions. Keep the existing local preview server running; do not disable its development-only no-login mode.
- Existing repository files are untracked and there is no baseline commit. Do not create a broad initial commit or capture unrelated files.

## Review Focus

- A tracked product without a recipe fails checkout before payment/confirmation; an untracked product still checks out.
- Changing recipe, ingredient name, or cost after checkout does not alter that order's requirement or cost snapshots.
- If any ingredient is insufficient during completion, status, all stock, SALE rows, and audits all roll back.
- Deactivation after checkout does not strand a confirmed order, while deactivation before checkout prevents a new requirement snapshot.
- Simultaneous manual movement and completion serialize without lost updates or negative stock; repeated idempotency keys do not apply twice.
- CASHIER/KITCHEN cannot read inventory/cost data or invoke inventory mutations through direct actions.

---

### Task 1: Pure validation and deterministic recipe arithmetic

**Files:**
- Create: `src/server/inventory/validation.ts`
- Create: `src/server/inventory/validation.test.ts`
- Create: `src/server/inventory/calculation.ts`
- Create: `src/server/inventory/calculation.test.ts`

**Interfaces:**
- `ingredientInputSchema`: `{ id?: UUID; name: trimmed nonempty string <= 120; unit: IngredientUnit; minimumStock: decimal string >= 0, max 3 fractional digits; isActive?: boolean }`. Do not accept stock or cost edits here.
- `recipeInputSchema`: `{ productId?: UUID; addonId?: UUID; items: [{ ingredientId: UUID; quantity: positive decimal string, max 3 fractional digits }] }`; exactly one target, nonempty unique ingredient IDs.
- `inventoryMovementInputSchema` is a discriminated union for `PURCHASE {ingredientId,quantity,unitCost,idempotencyKey,note}`, `ADJUSTMENT {ingredientId,quantityDelta,...}`, `WASTE {ingredientId,quantity,...}`, `STOCK_OPNAME {ingredientId,countedStock,...}`, and `RETURN {ingredientId,quantity,...}`. No client SALE variant. UUID idempotency key required.
- `calculateWeightedAverageCost(oldQty, oldCost, purchaseQty, purchaseCost): Prisma.Decimal`, returning 4 decimal places using exact Decimal arithmetic; when old and purchase quantity are zero, retain zero cost.
- `calculateRecipeRequirements(lines): RecipeRequirement[]` aggregates to one item/ingredient snapshot per order item, multiplying product line quantity and addon quantity correctly. Keep values as Decimal and snapshot ingredient label/unit/cost at input time.

- [x] Write validation tests for trimming, UUIDs, positive/nonnegative decimal scale, adjustment nonzero signed delta, nonnegative opname, mutually exclusive recipe owner, duplicate ingredient rejection, and preventing SALE input. Run `npm test -- --reporter=dot src/server/inventory/validation.test.ts`; confirm it fails because modules are absent.
- [x] Write calculation tests for exact weighted averages/rounding, zero stock, line and addon multiplication, aggregation, and distinct order-item snapshots using `Prisma.Decimal`.
- [x] Implement schemas and pure calculations without DB access.
- [x] Run both focused suites and `npm run typecheck`.

### Task 2: Additive schema and migration for addon recipes and checkout snapshots

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_phase5_inventory/migration.sql`
- Generate: `src/generated/prisma/**` via `npm run db:generate`
- Create: `src/server/services/inventory-schema.integration.test.ts`

**Interfaces:**
- Add `Ingredient.isActive Boolean @default(true)` and index active/stock fields for listing.
- Change `Recipe.productId` to nullable unique, add nullable unique `addonId`, inverse `Addon.recipe`, and a SQL CHECK constraint requiring exactly one owner. Preserve existing product recipes.
- Add `OrderItemIngredient`: UUID id, `orderItemId`, `ingredientId`, `ingredientNameSnapshot`, `unitSnapshot`, `quantityRequired Decimal(14,3)`, `costPerUnitSnapshot Decimal(14,4)`, timestamps, unique `(orderItemId, ingredientId)`, and FK delete restrictions suitable for historical snapshots.
- Add corresponding `OrderItem.ingredientSnapshots` and `Ingredient.orderSnapshots` relations/indexes. Keep existing ledger fields and references.

- [x] Add PostgreSQL schema tests for preservation of seeded product recipes, owner CHECK (product xor addon), unique ownership, snapshot FK/uniqueness, and `isActive` default.
- [x] Modify schema and create an additive migration; inspect SQL for non-destructive conversion of existing product-owned recipes and correct constraints/indexes.
- [x] Run `npm run db:validate`, `npm run db:generate`, and the focused schema integration test. Apply migration to local PostgreSQL using the repository's documented CLI/direct-driver fallback if Prisma CLI repeats its connection error; do not reset the database. (`prisma migrate dev` hit P1001; the additive migration was applied in a transaction through `pg` and its checksum was recorded in `_prisma_migrations`.)

### Task 3: Ingredient and recipe services plus serialized stock ledger

**Files:**
- Create: `src/server/services/inventory.ts`
- Create: `src/server/services/inventory.integration.test.ts`
- Consume: `src/server/inventory/validation.ts`, `src/server/inventory/calculation.ts`
- Modify: `prisma/seed.ts` only if required to keep idempotent seed data valid under the new relations.

**Interfaces:**
- `saveIngredient(input: IngredientInput, actorId): Promise<Ingredient>` creates/updates name, minimum stock, and active state; new stock/cost are zero. Reject unit changes after any recipe or movement exists. Audit every successful change; never delete historical ingredient rows.
- `deactivateIngredient(id, actorId): Promise<void>` soft-deactivates and audits.
- `saveRecipe(input: RecipeInput, actorId): Promise<Recipe>` validates active target and ingredients inside one transaction, replaces recipe items atomically, and audits. It supports a product or addon owner, exactly one.
- `recordInventoryMovement(input: InventoryMovementInput, actorId): Promise<InventoryTransaction>` takes transaction-scoped row locks in stable ingredient ID order, checks/replays UUID idempotency key, validates active status and balance, updates balance and cost, writes ledger and audit atomically. Purchases use weighted-average cost; other manual types snapshot current cost. Stock opname computes counted minus locked balance. Return adds usable stock.
- Export `deductOrderInventoryInTransaction(tx: Prisma.TransactionClient, orderId: string, actorId: string): Promise<void>` for Task 5; it consumes persisted snapshots only, uses deterministic order-item/ingredient idempotency keys, and inserts negative SALE ledger entries with snapshot cost. Ensure no manual API can call SALE.
- `getInventoryOverview()`, `listIngredients()`, `listRecipes()`, and `listInventoryMovements()` return explicit, typed projections; keep cost-bearing projections server-only.

- [x] Add PostgreSQL integration tests for create/update/deactivate, duplicate names, unit-history guard, recipe replacement/validation/rollback, each movement sign, purchase weighted-average cost, stock-opname delta, zero/negative rejection, idempotent retries, audits, and serialized concurrent updates.
- [x] Run `INVENTORY_INTEGRATION_TESTS=true npm test -- --reporter=dot src/server/services/inventory.integration.test.ts`; confirm the unimplemented service causes the new cases to fail.
- [x] Implement ingredient/recipe service methods and ledger transactions with safe domain errors and no raw DB messages returned to callers.
- [x] Rerun focused integration tests and unit suites. Verify replay with the same key but different payload returns the original movement without applying a second delta.

### Task 4: Capture immutable inventory requirements during checkout

**Files:**
- Modify: `src/server/services/orders.ts`
- Modify: `src/server/services/orders.integration.test.ts`
- Consume: `src/server/inventory/calculation.ts`
- Modify: `src/server/actions/orders.ts` only if its checkout result needs localized mapping for the new domain error.

**Interfaces:**
- Extend prepared catalog lines to load the active product recipe and active addon recipes, ingredient ID/name/unit/cost, and recipe quantities. Do not put these fields in POS bootstrap or client state.
- During authoritative `checkoutOrder` and `checkoutCart`, build `OrderItemIngredient` rows from current persisted recipes and line quantities and create them in the same transaction as confirmed order items and payment.
- Existing draft save/update paths remain unchanged and write no ingredient snapshots.
- Tracked products with no ingredient recipe fail before any order/payment mutation. Products with `trackInventory=false` skip the product recipe; add-ons without recipes skip deduction. Any inactive ingredient encountered for a new checkout fails with a safe validation error.

- [x] Add integration tests for both checkout paths: correct product/variant/addon arithmetic; tracked product with missing recipe; untracked product; recipe-less addon; inactive ingredient rejection; no snapshots on draft; payment/order rollback on failure.
- [x] Add snapshot stability test: checkout then edit recipe, ingredient name, and cost; assert saved requirement/name/unit/cost remain unchanged.
- [x] Run focused orders integration suite with `ORDER_INTEGRATION_TESTS=true`; verify the tests fail before wiring.
- [x] Implement shared snapshot generation/persistence in both checkout paths without changing draft persistence or exposing recipe data to clients.
- [x] Rerun checkout/order tests and `npm run typecheck`.

### Task 5: Deduct stock atomically with READY → COMPLETED

**Files:**
- Modify: `src/server/services/inventory.ts`
- Modify: `src/server/services/order-workflow.ts`
- Modify: `src/server/services/order-workflow.integration.test.ts`

**Interfaces:**
- `transitionOrder` calls `deductOrderInventoryInTransaction(tx, orderId, actorId)` only on the allowed READY → COMPLETED path and inside the existing transaction. The helper locks all referenced ingredients in sorted ID order, aggregates required quantity per ingredient for balance validation/decrement, then creates one SALE movement per order-item/ingredient snapshot using deterministic unique keys and snapshot costs.
- Order status, completed timestamp, all stock decrements, SALE rows, inventory/order audits, and table cleanup commit or roll back together. Allow inactive ingredients in already captured snapshots. An already completed/retried order cannot deduct again.
- Insufficient or missing stock/reference raises a typed safe error. No partial changes survive.

- [x] Add integration tests for correct multi-line SALE rows and costs; inactive-after-checkout completion; insufficient one-of-many ingredient rollback including status, balances, SALE rows, and audits; repeated/concurrent completion single-winner behavior; and completion of orders with no snapshots.
- [x] Run `ORDER_INTEGRATION_TESTS=true npm test -- --reporter=dot src/server/services/order-workflow.integration.test.ts`; verify new cases fail before implementation.
- [x] Wire the helper into the transaction and ensure ingredient locking order is stable. Keep existing transition/table behavior intact.
- [x] Rerun workflow and table/order workflow integration suites. Verify no second deduction is possible even when a retry sees the unique idempotency key.

### Task 6: Authorized actions and inventory pages

**Files:**
- Create: `src/server/actions/inventory.ts`
- Create: `src/server/services/inventory-access.test.ts`
- Create: `src/app/(protected)/inventory/page.tsx`
- Create: `src/app/(protected)/inventory/ingredients/page.tsx`
- Create: `src/app/(protected)/inventory/recipes/page.tsx`
- Create: `src/components/inventory/inventory-overview.tsx`
- Create: `src/components/inventory/ingredient-form.tsx`
- Create: `src/components/inventory/movement-form.tsx`
- Create: `src/components/inventory/recipe-form.tsx`
- Modify: `src/lib/permissions/navigation.ts`
- Modify: `src/app/globals.css` only for small shared layout additions.

**Interfaces:**
- Every page calls `requireRouteAccess("inventory")`; every server action rechecks that access, parses FormData through Task 1 schemas, maps typed domain errors to localized form state, and revalidates affected inventory/products/POS/orders/dashboard/kitchen routes.
- `/inventory`: stock summary, low-stock list, recent movements. `/inventory/ingredients`: ingredient create/edit/deactivate and purchase/adjustment/waste/opname/return forms. `/inventory/recipes`: product/addon recipe editor with ingredient/unit labels and quantities.
- OWNER/MANAGER see the pages and cost fields. CASHIER/KITCHEN receive no inventory projection and direct action calls are rejected. Do not expose these projections through POS or kitchen props.
- Mark inventory navigation implemented only after protected routes and actions exist. All mutation forms create a fresh UUID idempotency key per intentional submission and preserve it across retry UI where practical.

- [x] Add access tests for OWNER/MANAGER allow and CASHIER/KITCHEN deny on route/action boundaries; test server projection excludes costs for non-authorized callers by preventing the query/action entirely.
- [x] Implement server actions and test safe validation/domain error states before building forms.
- [x] Build thin Indonesian forms/pages with touch-friendly controls; render IDR/decimal units via existing formatting helpers.
- [x] Run focused access/action tests, `npm run typecheck`, and manual browser smoke checks for the three inventory routes and one movement/recipe save. Confirm no-login preview remains local-development only. (Protected routes returned HTTP 200 under local preview; actual form mutations are covered by PostgreSQL service tests.)

### Task 7: Seed compatibility, full verification, and review

**Files:**
- Modify: `prisma/seed.ts` only if Task 2/3 requires it.
- Modify: `README.md` only for accurate Phase 5 feature/setup notes and any migration command nuance.
- Review all Phase 5 files listed above; no unrelated formatting or broad cleanup.

- [x] Ensure seeding remains idempotent and existing seeded recipes/positive opening purchase transactions survive migration and can be consumed at completion.
- [x] Run `npm run db:validate`, `npm run db:generate`, `npm run typecheck`, `npm run lint`, and `npm test -- --reporter=dot`.
- [x] Run `INVENTORY_INTEGRATION_TESTS=true npm test -- --reporter=dot src/server/services/inventory-schema.integration.test.ts src/server/services/inventory.integration.test.ts`.
- [x] Run `ORDER_INTEGRATION_TESTS=true npm test -- --reporter=dot src/server/services/orders.integration.test.ts src/server/services/order-workflow.integration.test.ts src/server/services/table-orders.integration.test.ts`.
- [x] Run `npm run build` and HTTP smoke checks for `/inventory`, `/inventory/ingredients`, `/inventory/recipes`; verify owner/manager access, cashier/kitchen denial, and local-preview-only no-login behavior. (Build passed; all three routes returned 200 without a login in local preview.)
- [x] Request a fresh whole-phase review focused on atomicity, precision, authorization, and migration safety; fix Critical/Important findings with regression tests and rerun affected checks.
