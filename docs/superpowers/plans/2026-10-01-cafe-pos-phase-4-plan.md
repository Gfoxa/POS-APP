# Cafe POS Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement table service, item-quantity splits for unpaid dine-in drafts, kitchen display polling, and safe order preparation/completion transitions.

**Architecture:** Add a small table-group relation and active flag to `CafeTable`, then keep table invariants in `tables`/`table-orders` services and order status changes in a dedicated workflow service. Server actions authorize and validate every mutation; `/tables`, `/kitchen`, and the POS consume narrow server projections.

**Tech Stack:** Existing Next.js App Router, TypeScript, PostgreSQL, Prisma, Auth.js, Zod, React Server Actions, Vitest. Do not add dependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-cafe-pos-phase-4-design.md`

## Global Constraints

- Keep business logic in server services; UI components submit validated actions.
- Use server-side role checks for every route and mutation.
- Use PostgreSQL transactions for table assignment, draft splitting, merges, order transitions, and matching audit records.
- Never edit/delete paid order items or payments; `REFUNDED` remains unreachable until a refund payment flow exists.
- A DINE_IN POS order must have a valid available/occupied table group; TAKEAWAY has no table.
- Use selected item quantities to split unpaid drafts; the source and new draft both retain at least one item.
- If a draft has a discount, remove it before splitting; discounts can then be applied independently to each ticket.
- Kitchen updates are limited to CONFIRMED → PREPARING → READY; OWNER/CASHIER completes READY orders.
- Kitchen reads expose order/item notes and table label only, without payment, customer contact, or cashier details.
- Refresh kitchen orders with `router.refresh()` every five seconds; do not add WebSockets.
- Phase 4 completion does not deduct inventory.
- Keep UI text in Indonesian and currency display in Indonesian rupiah.
- Repository files are currently untracked with no baseline commits; do not create a broad initial commit that captures unrelated existing files.

## Review Focus

- Two simultaneous POS saves must not attach new orders to a reserved/cleaning/inactive table: integration test the conditional table claim and rollback.
- A stale or concurrent kitchen click must not skip/duplicate a transition or its audit log: integration test two updates from the same expected status.
- Splitting malformed, excessive, empty, paid, or discounted drafts must leave both orders and audit logs unchanged: test invalid and rollback cases.
- Merged table cycles, nested merges, invalid members, and active-order unmerge must be rejected without changing group assignments: integration test each invariant.
- KITCHEN must not receive customer/payment/cashier fields and cannot call table/POS mutations: test route/action authorization and query projection.

---

### Task 1: Pure table validation and order transition policy

**Files:**
- Create: `src/server/tables/validation.ts`
- Create: `src/server/tables/validation.test.ts`
- Create: `src/server/orders/workflow.ts`
- Create: `src/server/orders/workflow.test.ts`

**Interfaces:**
- `tableInputSchema`: `{ id?: UUID; name: trimmed nonempty string <= 40; capacity: integer 1..30; isActive?: boolean }`.
- `tableIdSchema`: UUID.
- `tableStatusInputSchema`: `{ tableId: UUID; operation: "RESERVE" | "RELEASE" | "START_CLEANING" | "MARK_AVAILABLE" }`.
- `mergeTablesInputSchema`: `{ primaryTableId: UUID; memberTableIds: UUID[1..10] }`, with distinct member IDs and primary excluded.
- `splitDraftInputSchema`: `{ orderId: UUID; lines: [{ orderItemId: UUID; quantity: integer 1..100 }] }`, with no duplicate order item IDs.
- `canTransitionOrder(from, to, actorRole) -> boolean`: policy table permits OWNER/KITCHEN `CONFIRMED→PREPARING`, OWNER/KITCHEN `PREPARING→READY`, OWNER/CASHIER `READY→COMPLETED`; no other transition.

- [x] Write tests for input trimming/bounds, duplicate merge members, split duplicate IDs/fractional/zero quantities, allowed role transitions, and rejected skips/backwards/refund transitions.
- [x] Run `npm test -- --reporter=dot src/server/tables/validation.test.ts src/server/orders/workflow.test.ts`; both suites failed because the new modules did not exist.
- [x] Implement the Zod schemas and pure transition policy with the exact signatures above.
- [x] Rerun the focused tests (8/8) and full suite (41 passed, 6 skipped).

### Task 2: Persist table activity and merge membership

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_phase4_table_groups/migration.sql`
- Modify: `src/generated/prisma/**` through `npm run db:generate`

**Interfaces:**
- Add `CafeTable.isActive Boolean @default(true)`.
- Add nullable `CafeTable.mergedIntoId String? @db.Uuid` and self-relation `mergedInto` / `mergedTables`; deleting a primary table is restricted while merged members exist.
- Add indexes on `[isActive, status]` and `[mergedIntoId]`.
- Existing `TableStatus` and `Order.tableId` remain the state/assignment sources.

- [x] Update Prisma schema with the fields, self-relation, and indexes.
- [x] Create migration `20261001150000_phase4_table_groups`; inspect nullable self-FK, default-true activity field, and indexes.
- [x] Run `npm run db:validate` and `npm run db:generate`.
- [x] Apply migration to local PostgreSQL through the documented direct-driver fallback and record its SHA-256 checksum in `_prisma_migrations`.
- [x] Verify five seeded tables remain active/available; run `npm run db:validate`, typecheck, and full unit suite (41 passed, 6 skipped).

### Task 3: Table service and group invariants

**Files:**
- Create: `src/server/services/tables.ts`
- Create: `src/server/services/tables.integration.test.ts`
- Consume: `src/server/tables/validation.ts`

**Interfaces:**
- `listTables()` returns active table roots with members, summed group capacity, derived display status, active orders, and order item counts.
- `saveTable(input, actorId)` creates or updates a table; it rejects duplicate names, inactive group members, and unsafe capacity/name changes.
- `setTableOperation(input, actorId)` conditionally reserves/releases/starts cleaning/marks available; availability requires no DRAFT/CONFIRMED/PREPARING/READY order in the group.
- `moveOrderToTable(orderId, destinationRootId, actorId)` moves only nonterminal DINE_IN orders to an available/occupied group, updates source/destination occupancy consistently, and audits the old/new group.
- `mergeTables(input, actorId)` sets each member's `mergedIntoId` to the root atomically; only active, unmerged, AVAILABLE/OCCUPIED members are accepted.
- `unmergeTable(memberTableId, actorId)` clears the self-reference only when the full group has no active orders and no RESERVED/CLEANING member.
- Every successful mutation writes an `AuditLog` record in the same transaction.

- [x] Add PostgreSQL integration tests for create/update, duplicate names, reserve/release/clean/available invariants, move active order and reject completed/takeaway moves, merge/unmerge capacity and group projection, active-order unmerge rejection, audit writes, and concurrent reservation.
- [x] Run `TABLE_INTEGRATION_TESTS=true npm test -- --reporter=dot src/server/services/tables.integration.test.ts`; suite failed because the new service module did not exist.
- [x] Implement service methods with conditional row updates and transactions; keep errors typed/user safe.
- [x] Rerun table integration tests (5/5), typecheck, and full suite (41 passed, 11 skipped).

### Task 4: Dine-in assignment and draft bill splitting

**Files:**
- Create: `src/server/services/table-orders.ts`
- Create: `src/server/services/table-orders.integration.test.ts`
- Modify: `src/server/orders/validation.ts`
- Modify: `src/server/services/orders.ts`

**Interfaces:**
- Add optional `tableId: UUID | null` to `SaveDraftInput`; validation requires a table for new/edited DINE_IN POS drafts and forbids it for TAKEAWAY.
- Consume `SplitDraftInput`/`splitDraftInputSchema` from `src/server/tables/validation.ts` (Task 1).
- `saveTableDraft(input: SaveDraftInput, actorId)` validates the table root/group state, saves/updates the draft, assigns root `tableId`, and marks the group OCCUPIED atomically.
- `splitDraftOrder(input: SplitDraftInput, actorId)` moves selected integer quantities from a source DRAFT to one new DRAFT on the same root table. It rejects paid/non-dine-in orders, discounted source orders, duplicate lines, quantities beyond source quantity, and an empty source result. Source/new snapshots and both audit entries commit atomically.
- Moving an already assigned active order is handled by `moveOrderToTable` from Task 3; draft POS table selection uses the same group validity rules.
- Checkout revalidates catalog references/prices and table state, preserves `tableId`, and rejects a table that became unavailable after draft save.
- Cancelling the final active order does not silently mark the physical table clean; table state remains for an explicit table operation.

- [x] Add integration tests for assigning available and occupied groups, rejecting RESERVED/CLEANING/inactive groups, TAKEAWAY without a table, DINE_IN without a table, and rollback when table claim fails.
- [x] Add split tests for selected quantities/add-ons/notes, same-table assignment, exact resulting quantities, source/new audit records, and unchanged DB state after each rejected split condition.
- [x] Run `ORDER_INTEGRATION_TESTS=true npm test -- --reporter=dot src/server/services/table-orders.integration.test.ts src/server/services/orders.integration.test.ts` and confirm missing behavior fails.
- [x] Implement transactional table assignment/splitting and preserve existing Phase 3 full-payment checkout behavior.
- [x] Rerun the focused integration tests; all pass (12 workflow/order checks; table assignment/split 5 checks).

### Task 5: Dedicated order workflow service

**Files:**
- Create: `src/server/services/order-workflow.ts`
- Create: `src/server/services/order-workflow.integration.test.ts`
- Consume: `src/server/orders/workflow.ts`
- Modify: `src/server/services/tables.ts` only through exported transaction helper if needed.

**Interfaces:**
- `transitionOrder(orderId, expectedStatus, nextStatus, actorId, actorRole)` validates `canTransitionOrder`, conditionally updates the exact current status, sets `completedAt` only on COMPLETED, and audits within one transaction.
- On READY → COMPLETED, if every order across the merged table group is terminal, atomically set all group members to CLEANING. No table state change for takeaway orders.
- `listKitchenOrders()` returns only CONFIRMED/PREPARING/READY orders and the safe item/table projection defined in the spec.

- [x] Add integration tests for CONFIRMED→PREPARING→READY→COMPLETED, rejected skips/backwards/REFUNDED, illegal role attempts, audit atomicity, single winner for concurrent transitions, and table group cleaning after the last completed order.
- [x] Add a projection test proving `listKitchenOrders()` omits payment, customer contact, cashier identity, and totals.
- [x] Run `ORDER_INTEGRATION_TESTS=true npm test -- --reporter=dot src/server/services/order-workflow.integration.test.ts`; confirm missing exports fail.
- [x] Implement guarded transitions with conditional `updateMany`; make stale/concurrent transitions user-safe.
- [x] Rerun workflow integration tests; all pass.

### Task 6: Server actions and role-checked routes

**Files:**
- Create: `src/server/actions/tables.ts`
- Create: `src/server/actions/order-workflow.ts`
- Create: `src/server/services/tables-access.test.ts`
- Modify: `src/lib/permissions/navigation.ts`
- Modify: `src/app/(protected)/orders/page.tsx`

**Interfaces:**
- Table actions require `tables` access; workflow actions require the corresponding `kitchen` or `tables` route access before calling services.
- Every FormData is parsed with the Task 1 schemas; local preview actor resolution follows `src/server/actions/orders.ts`.
- Revalidate `/pos`, `/tables`, `/kitchen`, `/orders`, `/dashboard` as affected by the mutation.
- Mark `tables` and `kitchen` implemented only when their pages exist; order history displays table/group and current status.

- [x] Add tests for OWNER/CASHIER table actions, OWNER/KITCHEN kitchen transitions, and cross-role denial.
- [x] Run focused access tests and confirm they fail before route wiring.
- [x] Add actions that authorize, validate, call services, return localized action state, and revalidate paths.
- [x] Update navigation availability and order history.
- [x] Rerun access tests plus `npm run typecheck`.

### Task 7: POS table selection and split-draft interface

**Files:**
- Modify: `src/server/services/orders.ts` POS bootstrap query
- Modify: `src/app/(protected)/pos/page.tsx`
- Modify: `src/components/pos/pos-workspace.tsx`
- Modify: `src/components/pos/discount-form.tsx` only if needed for split editing
- Modify: `src/server/actions/orders.ts`

**Interfaces:**
- POS bootstrap includes only active table roots/members with display state and capacity.
- POS requires a table selection for DINE_IN, clears it for TAKEAWAY, persists table selection on hold/checkout, and displays occupied/reserved/cleaning states.
- An unpaid dine-in draft offers a split action selecting existing item quantities; discounted drafts show the remove-discount requirement before split.
- Successful split refreshes held orders and keeps the current order selected; errors preserve the cashier's cart.

- [x] Add server-side bootstrap/service tests for table group listing and split result state before UI changes.
- [x] Implement table selector and split controls in the cashier workspace, retaining keyboard/touch operation and exact monetary totals.
- [x] Run targeted POS/service tests and `npm run typecheck`.

### Task 8: Table management UI

**Files:**
- Create: `src/app/(protected)/tables/page.tsx`
- Create: `src/components/tables/table-workspace.tsx`
- Create: `src/components/tables/table-form.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Owner/cashier see table groups, capacity, state, active orders, and item counts.
- Forms/actions create and edit table name/capacity, reserve/release, start cleaning/mark available, merge, and unmerge.
- READY orders expose a “Selesaikan pesanan” action; completed table groups expose cleaning/availability controls.
- Destructive state changes require clear feedback and server-side service validation.

- [x] Add route/service projection tests for empty/populated table states, group capacity/display, invalid-action feedback, and no-table access for unauthorized roles.
- [x] Implement accessible, touch-friendly table controls following existing catalog styles.
- [x] Run focused service/route tests and `npm run typecheck`; smoke-check authenticated-route redirects and generated routes in the local production server.

### Task 9: Kitchen display and polling

**Files:**
- Create: `src/app/(protected)/kitchen/page.tsx`
- Create: `src/components/kitchen/kitchen-display.tsx`
- Create: `src/components/kitchen/order-card.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Server page calls `requireRouteAccess("kitchen")` and `listKitchenOrders()`.
- Client display refreshes the server projection every 5 seconds with `router.refresh()` and stops its timer on unmount.
- CONFIRMED orders show “Terima & mulai”, PREPARING shows “Tandai siap”, READY stays visible until owner/cashier completes it elsewhere.
- Order cards display Indonesian order age, table/group, item variants/add-ons, and notes with large status controls.

- [x] Add server projection tests for status-specific queue records, empty queue, and privacy-safe fields.
- [x] Implement polling and action feedback without adding dependencies.
- [x] Run focused kitchen tests and `npm run typecheck`; polling interval and status transitions were verified by code/build and integration tests.

### Task 10: Documentation, full verification, and review

**Files:**
- Modify: `README.md`
- Modify: `.superpowers/sdd/2026-10-01-cafe-pos-phase-4/progress.md`
- Modify: this plan's final verification checkboxes.

- [x] Document Phase 4 features, table split/discount behavior, kitchen roles, order transition rules, migration, and test commands.
- [x] Run `npm run lint` and `npm run typecheck`.
- [x] Run `npm test -- --reporter=dot`.
- [x] Run `TABLE_INTEGRATION_TESTS=true npm test -- --reporter=dot src/server/services/tables.integration.test.ts`.
- [x] Run `ORDER_INTEGRATION_TESTS=true npm test -- --reporter=dot src/server/services/table-orders.integration.test.ts src/server/services/order-workflow.integration.test.ts src/server/services/orders.integration.test.ts`.
- [x] Run `npm run db:validate` and `npm run build`.
- [x] Smoke-check `/pos`, `/tables`, `/kitchen`, `/orders`; verify generated route coverage and unauthenticated redirects. Interactive browser operations are covered at service level and await local signed-in use.
- [x] Request a fresh whole-phase review and fix all Critical/Important findings with regression tests; follow-up review found no remaining Critical/Important findings.
