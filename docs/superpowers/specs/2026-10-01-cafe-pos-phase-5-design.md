# Cafe POS Phase 5 Design

## Goal

Add usable ingredient, recipe, and inventory management to the existing cafe POS. Stock movements must be recorded in an auditable ledger, and completing a tracked order must deduct the ingredients captured for that order without allowing stock to go negative. Inventory behavior must remain deterministic if recipes or ingredient costs change after checkout.

## Evidence from the current repository

- `prisma/schema.prisma` already defines `Ingredient`, product-owned `Recipe`, `RecipeItem`, and `InventoryTransaction`, including decimal quantities, `currentStock`, `minimumStock`, `costPerUnit`, movement types, and order/order-item references.
- `Product.trackInventory` exists and is enabled by the Prisma default. Phase 2 catalog forms allow products to opt out of tracking.
- Local seed data creates ingredients, positive opening `PURCHASE` transactions, and recipes for seeded products. Seeded recipe quantities are stored in the ingredient's unit.
- Phase 4's `transitionOrder` owns the atomic `READY → COMPLETED` transition, its audit event, and table cleanup. It does not yet update inventory.
- No inventory actions, services, or pages exist. Navigation already assigns the inventory route to OWNER and MANAGER.
- The project uses Prisma `Decimal`, Zod, server actions, route guards, and PostgreSQL integration tests. No new dependency is needed.

## Scope

### Ingredients

- Add an OWNER/MANAGER inventory area for ingredient listing, creation, editing, and deactivation.
- Show ingredient name, unit, active state, current stock, minimum stock, cost per unit, and low-stock state.
- A new ingredient starts with zero stock; staff add stock with a purchase movement instead of entering an unledgered starting balance.
- Ingredient units are `GRAM`, `KILOGRAM`, `MILLILITER`, `LITER`, or `PIECE`. Recipe quantities and all stock movements use the selected ingredient unit; the application does not silently convert units.
- Name, minimum stock, and active state may be edited with validation and audit logging. An ingredient unit cannot change after recipe or movement history exists. Ingredients with recipe or movement history cannot be deleted; deactivation preserves references.

### Recipes

- A recipe belongs to exactly one Product or Addon. Products retain a single recipe per product; add-ons may have one optional recipe. This extends the current product-only recipe relation while keeping ingredients as the shared component list.
- Recipe items use positive decimal quantities in the corresponding ingredient's unit. A recipe cannot contain the same ingredient more than once; inactive ingredients cannot be newly added.
- OWNER/MANAGER can create and update recipes and recipe items. Replacing a recipe is one database transaction and writes audit events.
- A product's recipe quantities apply to each sold menu unit across all its variants. An add-on recipe is multiplied by the add-on quantity and the parent order-item quantity.
- Add-ons without a recipe consume no stock. Products with `trackInventory=true` must have at least one recipe ingredient before checkout can confirm the order. Products with tracking disabled do not create ingredient requirements.

### Checkout recipe snapshots

- At checkout, calculate ingredient requirements from the then-current product recipe and selected add-on recipes. Persist one requirement snapshot per order item and ingredient with the total required quantity, ingredient unit/name, and unit cost as of checkout.
- The snapshot is immutable after checkout. Later recipe edits, ingredient renames, or cost changes cannot change the requirements or estimated COGS for an already-confirmed ticket.
- Recipe snapshots are written in the same transaction as order confirmation and payment. Both the existing saved-draft checkout and new-cart checkout paths use the same rule.

### Inventory movements

- Every stock change updates `Ingredient.currentStock` and creates an `InventoryTransaction` in the same PostgreSQL transaction. The ledger's signed `quantityDelta` is authoritative for history; `currentStock` is the cached balance maintained only by inventory services and the seed.
- Supported movement behavior:

  | Type | Quantity behavior | Entry path |
  |---|---|---|
  | `PURCHASE` | Positive quantity; accepts acquisition unit cost and updates weighted-average cost | Inventory form |
  | `SALE` | Negative recipe requirement quantity | Order completion service only |
  | `ADJUSTMENT` | Positive or negative delta | Inventory form |
  | `WASTE` | Negative quantity | Inventory form |
  | `STOCK_OPNAME` | Difference between counted stock and current stock; ledger stores the signed difference | Inventory form |
  | `RETURN` | Positive quantity returned to usable stock | Inventory form |

- Purchases require a positive quantity and nonnegative unit cost. Weighted-average cost is calculated with decimal arithmetic and rounded to the existing four-place cost scale. Return, adjustment, waste, and opname movements snapshot the ingredient's current weighted-average cost.
- Manual movement forms accept a UUID idempotency key. Repeating a request with the same key must not apply the stock delta twice. Sales use a deterministic key derived from order item and ingredient.
- Movement services lock affected ingredient rows in stable ingredient-ID order before reading balances. Purchases, adjustments, waste, returns, and opname therefore serialize with order deductions; stock opname computes its delta from the locked balance. Replaying an idempotency key returns the original movement result without applying its delta again.
- Every manual movement records the actor and writes an `AuditLog` event in the same transaction. A movement and its source order are never permanently deleted through the application.
- Negative balances are rejected. Stock opname values cannot be negative. Zero-delta movements are rejected.

### Order completion and stock deduction

- When an authorized OWNER/CASHIER completes a READY order, `transitionOrder` consumes the order-item ingredient snapshots and moves the order to COMPLETED in a single transaction.
- Aggregate required quantities by ingredient for the order. Conditionally decrement each ingredient only if it has enough stock, then create one negative `SALE` transaction per order-item/ingredient snapshot with cost, order, order-item, and actor references. An ingredient deactivated after checkout remains consumable for that already-confirmed snapshot; deactivation prevents new recipes and new checkout snapshots from using it but does not strand paid orders.
- The completed status, stock balances, SALE transactions, order status audit, and inventory audit records commit together. If a required ingredient reference is missing or its stock is insufficient, the entire completion fails without changing status, stock, or audit records.
- Conditional stock updates and unique idempotency keys protect against concurrent completions and retries. Completed orders cannot be completed again or re-deducted.
- Cancelled drafts do not consume stock. Refund processing, restocking a refunded order, and reversing sale movements remain out of scope because refund payments are not implemented.

### Inventory UI and authorization

- Implement `/inventory` for stock summary, low-stock ingredients, and recent movements; `/inventory/ingredients` for ingredient maintenance; and `/inventory/recipes` for recipe maintenance.
- OWNER and MANAGER can access all Phase 5 pages and mutations. CASHIER and KITCHEN cannot read inventory costs, ingredient stock, recipes, or movement history.
- Each page is protected by server-side `requireRouteAccess("inventory")`. Each mutation uses Zod parsing and server-side authorization; client checks are only for usability.
- Use existing Indonesian UI and IDR formatting conventions. Quantities are shown with their ingredient units; unit costs use rupiah formatting.

## Architecture and data changes

- Add `Ingredient.isActive` with a default of true.
- Change `Recipe.productId` to optional, add optional `Recipe.addonId`, and enforce exactly one non-null owner with unique constraints and a database check constraint. Add the inverse optional recipe relation on `Addon`.
- Add an `OrderItemIngredient` snapshot model related to `OrderItem` and `Ingredient`. Store ingredient display name/unit, required total quantity, and unit cost snapshot; uniquely constrain `(orderItemId, ingredientId)`.
- Keep `InventoryTransaction.quantityDelta`, `unitCostSnapshot`, `idempotencyKey`, and existing order references. No separate stock-balance table is needed.
- `src/server/services/inventory.ts` owns ingredient CRUD, recipes, ledger movements, weighted-average cost, stock validation, and a transaction helper for order deduction.
- `src/server/services/orders.ts` captures recipe requirements during authoritative checkout calculation. `src/server/services/order-workflow.ts` calls the inventory deduction helper inside the existing READY-to-COMPLETED transaction.
- `src/server/actions/inventory.ts` validates form data, enforces OWNER/MANAGER access, calls inventory services, and revalidates inventory, products, POS, orders, dashboard, and kitchen data when affected.
- UI components remain thin and consume safe server projections. Recipe and ingredient cost data never enters the POS or kitchen client payloads.

## Validation and error handling

- Validate UUID references, trimmed names, ingredient unit, finite decimal strings, positive recipe/purchase quantities, signed nonzero adjustment quantities, nonnegative costs, nonnegative counted stock, movement types, and idempotency keys with Zod.
- Services recheck active ingredient/product/add-on references inside transactions. No client-submitted current stock, cost, product price, or recipe total is trusted.
- Return localized errors for duplicate names, invalid units, inactive references, tracked products without recipes, insufficient stock, invalid stock opname, duplicate requests, and stale concurrent updates.
- Map database conflicts to safe user-facing messages. Never expose stack traces or internal database messages.

## Testing and verification

- Unit tests cover recipe/movement input validation, exact weighted-average arithmetic, quantity aggregation, and stock requirement calculation with `Prisma.Decimal`.
- PostgreSQL integration tests cover ingredient CRUD/deactivation/unit guards, recipe CRUD/validation, all movement types, weighted-average purchases, idempotent retries, stock-opname delta, audit records, and concurrent stock decrement.
- Checkout tests prove recipe snapshots are taken from current recipes and survive subsequent recipe/cost edits. Tracked products without recipes fail checkout; untracked products remain unaffected.
- Workflow tests prove successful completion creates correct SALE movements, insufficient stock rolls back order status/stock/movements/audits, and an ingredient deactivated after checkout still allows its saved requirement to be consumed. Concurrent/repeated completion cannot deduct twice.
- Role tests verify that inventory route and mutations are unavailable to CASHIER/KITCHEN and available to OWNER/MANAGER.
- Run unit and PostgreSQL integration tests, lint, typecheck, Prisma validation, production build, and HTTP smoke checks for `/inventory`, `/inventory/ingredients`, and `/inventory/recipes`.

## Exclusions

- Supplier records, purchase orders, invoice capture, batch/lot tracking, expiry dates, stock reservations, and multi-location stock.
- Inventory and profit report dashboards beyond the stock summary and movement history; these belong to Phase 6 reports.
- Inventory deductions for products whose tracking is disabled, and for add-ons without a configured recipe.
- Refunds, return-to-stock from a refunded customer order, and edits to completed financial transactions.
- Automatic unit conversion between grams/kilograms or milliliters/liters.

## Assumptions for review

- Recipe quantities describe one saleable product/add-on unit and use the ingredient's stored unit. Product variants share the base product recipe.
- Inventory is deducted when the order reaches COMPLETED, not when payment is captured or kitchen preparation begins. Stock is not reserved while an order is in progress.
- A missing recipe on a tracked product is a checkout error so sales cannot silently bypass ingredient accounting.
- Purchase movements update weighted-average cost; existing purchase history remains unchanged when a later purchase changes the average.
- Ingredient soft deactivation is sufficient for preserving history; hard deletion is not provided.
