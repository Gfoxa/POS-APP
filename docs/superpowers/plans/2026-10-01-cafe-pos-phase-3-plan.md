# Cafe POS Phase 3 Implementation Plan

> **For agentic workers:** Use inline execution with TDD, one task at a time. Keep progress in `.superpowers/sdd/2026-10-01-cafe-pos-phase-3/progress.md`.

**Goal:** Implement usable POS cart, saved draft orders, discounts, deterministic totals, transactional payments, order history, and printable receipts.

**Architecture:** Keep the POS UI as a client cart backed by role-guarded server actions and PostgreSQL draft orders. A pure calculator handles exact money; order services reload current catalogue data and persist snapshots. Checkout writes totals, payment, audit log, and `CONFIRMED` state in one Prisma transaction.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Prisma 7, PostgreSQL, Auth.js, Zod, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-cafe-pos-phase-3-design.md` and Phase 3 in the user's cafe POS brief.

## Global Constraints

- Only OWNER, MANAGER, and CASHIER may use POS/order actions; only OWNER and MANAGER manage discount rules.
- Every mutation is server-authorized and Zod-validated; client totals are previews, never trusted.
- All persisted prices use Prisma Decimal. Pure calculations use integer cents / BigInt, with percentage rounding half-up.
- Persisted drafts support hold/resume; successful checkout is atomic and moves DRAFT to CONFIRMED.
- Tax rate is 11%; service charge is 0% until settings exist; each order stores the applied rates and amounts.
- Do not delete financial orders/payments; inventory deduction remains Phase 5, table assignment and preparation workflow Phase 4.

## Review Focus

- Decimal and percentage edge cases, including a half-cent result, cannot introduce floating-point drift.
- Client-forged product, variant, add-on, discount, customer, order, or payment values are ignored or rejected by server reloading and validation.
- Two simultaneous checkout submissions cannot create duplicate charge payments or complete the order twice.
- Invalid, inactive, expired, wrong-scope, or ineligible-product discounts cannot change totals.
- Cash underpayment and non-cash over/under payment leave order, payment, and audit records untouched.

### Task 1: Exact order calculations and validation

**Files:**
- Create: `src/server/orders/calculation.ts`
- Create: `src/server/orders/calculation.test.ts`
- Create: `src/server/orders/validation.ts`
- Create: `src/server/orders/validation.test.ts`

**Interfaces:**
- Produces pure `calculateOrderTotals(input)` for line subtotal, capped order/product discount, 11% tax, 0% service charge, and total using integer cents / BigInt.
- Produces Zod schemas for draft cart lines, discount definitions, and checkout method/tender/reference inputs.

- [x] Write failing tests for the brief's Rp100,000 − Rp10,000 + 11% tax = Rp99,900 example, add-ons/quantity multiplication, product-only eligibility, fixed/percentage caps, half-up rounding, zero service charge, underpayment, cash change, and non-cash exact tender.
- [x] Verify the tests fail for missing functions.
- [x] Implement the calculator and Zod schemas.
- [x] Verify focused tests pass; refactor only after green.

### Task 2: Database snapshots and transactional order services

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_phase3_order_checkout/migration.sql`
- Create: `src/server/services/orders.ts`
- Create: `src/server/services/orders.integration.test.ts`
- Consume: `src/server/orders/calculation.ts` and validation schemas from Task 1.

**Interfaces:**
- `saveDraftOrder(input, actorId)` creates or replaces a DRAFT order and its item/add-on snapshots after reloading active catalogue records.
- `cancelDraftOrder(orderId, actorId)` transitions only unpaid drafts to CANCELLED.
- `checkoutOrder(input, actorId)` atomically reloads a DRAFT, validates selected discount and tender, persists recalculated totals/snapshots, creates one Payment and audit record, and advances to CONFIRMED.
- `getOrderForReceipt(orderId)` returns persisted order/payment/item snapshots.

- [x] Write opt-in PostgreSQL integration tests for create/update/hold/resume, inactive/stale catalogue data, duplicate checkout, cancellation, and atomic payment/order/audit results.
- [x] Verify database tests fail because order services/schema changes are missing.
- [x] Add nullable `Order.discountName`, `Payment.tenderedAmount`, and `Payment.changeAmount` snapshot fields with migration SQL; implement transactional services.
- [x] Apply migration to local PostgreSQL, run integration tests, and verify no duplicate payments or partial writes.

### Task 3: Discount management and route policy

**Files:**
- Modify: `src/lib/permissions/roles.ts`, `src/lib/permissions/navigation.ts`, `src/lib/permissions/roles.test.ts`
- Create: `src/server/actions/discounts.ts`
- Create: `src/app/(protected)/discounts/page.tsx`
- Create: `src/components/pos/discount-form.tsx`
- Test: `src/server/orders/validation.test.ts` and discount integration coverage.

**Interfaces:**
- OWNER/MANAGER create, edit, activate/deactivate discount rules. CASHIER can list active valid rules for POS but cannot mutate them.
- Product discounts require one existing product; order discounts have no product. Percentage values are in 0–100%; fixed values and optional max amounts use exact decimal validation.

- [x] Add failing role tests for cashier POS/order access, kitchen denial, and owner/manager-only discount mutation.
- [x] Verify expected red results.
- [x] Add server-guarded discount management and active-discount service reads.
- [x] Verify permission, validation, and database behavior.

### Task 4: POS cart, draft hold/resume, and checkout UI

**Files:**
- Create: `src/app/(protected)/pos/page.tsx`
- Create: `src/components/pos/pos-workspace.tsx`
- Create: `src/components/pos/cart.tsx`
- Create: `src/server/actions/orders.ts`
- Modify: `src/lib/permissions/navigation.ts`, `src/components/layout/app-shell.tsx`, `src/app/globals.css`

**Interfaces:**
- POS loads active products grouped by category with variants/add-ons, eligible discounts, customers, and the cashier's DRAFT orders.
- Cart submits line identifiers/quantities/notes plus order type, customer, optional discount, and draft ID; server actions call Task 2 services.
- Cash checkout accepts tender and calculates change; QRIS/debit/credit/other require exact tender and may include a reference.

- [x] Add tests for POS route availability and server action authorization/validation.
- [x] Implement touchscreen-friendly search, category filter, item selection, variant/add-on picker, cart edits, customer/type/discount selection, hold/resume, and checkout form.
- [x] Verify draft state rehydrates from PostgreSQL and checkout displays authoritative server totals/change.

### Task 5: Orders, receipt, documentation, and verification

**Files:**
- Create: `src/app/(protected)/orders/page.tsx`
- Create: `src/app/(protected)/orders/[orderId]/receipt/page.tsx`
- Create: `src/components/pos/receipt.tsx`
- Modify: `src/lib/permissions/navigation.ts`, `README.md`

- [x] Write tests for malformed order UUIDs, role-gated order/receipt access, and snapshot receipt content.
- [x] Implement recent order history and print-friendly Indonesian IDR receipt from saved snapshots.
- [x] Update README phase/status, checkout rules, migration command, and test instructions.
- [x] Run lint, typecheck, all unit tests, PostgreSQL integration tests, Prisma validation, and production build.
- [x] Fresh review and fix any Critical/Important findings with tests (atomic checkout, cart idempotency, conditional draft locking, hold reset, integer quantity guard, and exact fractional IDR display).

## Decisions already accepted

- Checkout commits `CONFIRMED` with its payment; Phase 4 owns kitchen status transitions and `COMPLETED`.
- Product-specific and order-wide discounts both write a single order-level discount amount/name snapshot; order line and add-on name/price snapshots remain unchanged for an auditable receipt.
- Cash payment `amount` is the exact amount applied to the order; `tenderedAmount` and `changeAmount` record what the cashier received and returned.
