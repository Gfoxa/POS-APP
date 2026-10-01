# Cafe POS Phase 3 Design

## Goal

Deliver a usable cashier flow for building, holding, resuming, discounting, and paying cafe orders, then provide order history and a printable receipt. All prices and totals are calculated on the server with exact decimal arithmetic.

## Confirmed scope

- POS product search and category filtering, variant/add-on selection, quantity changes, item notes, customer association, and takeaway/dine-in order type.
- Persisted draft orders support hold and resume.
- Order-wide and product-specific percentage/fixed discounts are represented by the existing `Discount` model. Owners/managers manage discount rules; authorized cashiers can apply active rules.
- Checkout supports cash, QRIS, debit, credit card, and other; cash supports tendered amount and change.
- Payment and checkout state commit atomically. A successful checkout creates one charge payment and advances the order from `DRAFT` to `CONFIRMED` in the same transaction. Phase 4 owns preparation and completion transitions so kitchen work can happen after checkout.
- Orders can be listed and receipts viewed/printed.
- No inventory deduction in this phase; that belongs to Phase 5.

## Architecture

- Server-rendered pages load active POS products and orders; focused client components manage cart interaction and submit validated server actions.
- `src/server/services/orders.ts` owns draft creation/update, repricing, checkout, order listing/detail, and receipt data. `src/server/services/order-calculation.ts` owns deterministic money calculations and has no database dependency.
- Zod schemas validate all submitted IDs, quantities, text, discount choices, and payment inputs. Client totals are previews only; checkout reloads current catalog and discount data before computing authoritative totals.
- Prisma transactions persist order items, item/add-on price/name snapshots, tax/discount/service snapshots, payment, audit entry, and the order status transition atomically.
- No payment gateway is integrated; non-cash payment methods are recorded as tendered at the counter, optionally with a reference number.

## Financial rules

- Use `Prisma.Decimal` for persisted amounts and integer minor units / `BigInt` for pure calculation; round percentage outputs half-up to two decimal places.
- Subtotal is the sum of `(selected variant price or product base price + selected add-on prices) × quantity`.
- At most one active discount is applied per order. Product-scope discounts apply only to matching product lines; order-scope discounts apply to the eligible order subtotal. A fixed discount is capped at its eligible base, and `maxAmount` caps either discount when present.
- Tax is 11% (the example rate in the original product brief) of subtotal after discount. Service charge is 0% until configurable settings are implemented.
- Payment `amount` records the amount applied to the order (the exact total). Cash tender and change are stored separately so sales reports do not count returned change as revenue.
- Receipt snapshots preserve the discount label, tax/service rates and amounts, item names, variant/add-on names, and unit prices used at checkout.

## Persistence changes

- Add a migration adding `Order.discountName` nullable snapshot and `Payment.tenderedAmount` / `Payment.changeAmount` decimal fields. Existing records remain valid with nullable/defaulted fields.
- Reuse existing `Order`, `OrderItem`, `OrderItemAddon`, `Discount`, and `Payment` models and relations. No order or payment is hard-deleted by Phase 3 actions.

## Authorization and failure behavior

- OWNER, MANAGER, and CASHIER can use POS, view orders they are allowed to access, and check out. Server actions always call route authorization.
- Only OWNER and MANAGER can create/update/deactivate discounts.
- Kitchen role does not access POS/order pages in this phase.
- A stale or inactive product, variant, add-on, customer, or discount fails checkout with a user-safe message. Underpayment, invalid tender, duplicate checkout, or a non-draft checkout fails without partial writes.
- An order that has a payment is never returned to draft or hard-deleted. Refunds and preparation-state handling remain in later phases.

## Validation plan

- Unit tests cover line/subtotal arithmetic, product/order discounts, caps, tax, service charge, exact rounding, tender validation, and change.
- PostgreSQL integration tests cover draft creation/update, hold/resume, stale catalog pricing, duplicate/invalid checkout, and atomic order/payment/audit persistence.
- Role tests cover cashier POS access, kitchen denial, and owner/manager-only discount management.
- Run lint, typecheck, full tests, database integration tests, Prisma validation, and production build.

## Assumptions and open questions

- The 11% tax comes from the original worked example; service charge starts at zero because the brief gives no rate. Both rates are stored on each order so later settings can change future orders without rewriting history.
- Dine-in checkout does not assign a table in this phase; table selection and table state belong to Phase 4.
- The cashier records confirmation of QRIS/card settlement at the counter; no external acquiring service or automated reconciliation is part of this phase.
- None identified that block this phase.
