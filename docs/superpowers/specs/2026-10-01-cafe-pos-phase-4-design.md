# Cafe POS Phase 4 Design

## Goal

Add dine-in table operations and a kitchen display while preserving Phase 3's payment and order snapshots. Cashiers can assign dine-in orders to tables, split unpaid checks by item quantity, and close tables after service. Kitchen staff can progress paid orders through preparation using a dedicated order workflow service.

## Evidence from the current repository

- `prisma/schema.prisma` already defines `CafeTable`, `TableStatus`, `OrderStatus`, and nullable `Order.tableId`.
- `src/server/services/orders.ts` already creates and pays orders transactionally, but it currently does not assign tables and does not provide preparation status changes.
- `src/server/actions/orders.ts` owns validated cashier mutations; route guards and `canAccessRoute` enforce role access on the server.
- `src/lib/permissions/roles.ts` grants table access to OWNER/CASHIER and kitchen access to OWNER/KITCHEN, consistent with the original role matrix.
- `src/server/seed/catalog.ts` supplies five local cafe tables. No table/kitchen pages or services exist yet.
- The current payment model and checkout require a full payment for one order. Completed financial orders and payments must not be rewritten.

## Scope

### Tables

- Add table list/create/update and operational actions using the existing table model, with Zod validation and server authorization.
- Show table name, capacity, current state, active order count, and active orders.
- Let POS select a table for dine-in orders. A dine-in order must reference an available, occupied, or explicitly joined table group; takeaway orders cannot reference a table.
- Allow OWNER/CASHIER to move an active dine-in order to another available/occupied table group. Preserve completed orders on their historical table and audit each move.
- Reserve only an available table group. Reservations can be released back to available; cleaning tables can only return to available through the clean/close action. A table becomes occupied when a dine-in draft is attached; occupied state is cleared by the close workflow after its active orders finish.
- Complete an order from READY. When every active order on the table is completed, move the table to CLEANING. A cashier or owner marks it AVAILABLE after cleaning.
- Support physical table merging as a reversible group: one primary table and one or more member tables. Active orders retain their actual table assignment; new orders select the primary group. The group capacity is the sum of member capacities. Merged members cannot be reserved or selected independently.
- Allow unmerge only when all orders in the group are terminal and the tables are not reserved or cleaning.
- Support splitting only unpaid DRAFT orders. Move selected item quantities into a new draft on the same table, copying item/add-on identifiers and notes. The source and new draft must both retain at least one item. Checkout revalidates and reprices both drafts using the Phase 3 rule. Both tickets are priced as independent orders. If the source has a discount, the cashier must remove it before splitting and can apply a valid discount separately to each resulting ticket; this prevents duplicating an order-wide fixed discount. Paid orders cannot be split.
- Do not delete tables with linked orders; deactivate or rename them instead. This preserves order history.

### Order lifecycle and kitchen display

- Keep checkout's existing `DRAFT → CONFIRMED` transition.
- Implement only these transitions in this phase:

  ```text
  DRAFT → CANCELLED
  CONFIRMED → PREPARING → READY → COMPLETED
  ```

- `REFUNDED` remains unreachable until a refund flow can create a refund payment. Paid orders cannot be cancelled without a refund record. This phase does not modify or delete payments.
- Put transition rules in a dedicated order workflow service. Each update checks the expected current status in the database and writes its audit log in the same transaction.
- OWNER/KITCHEN can move CONFIRMED → PREPARING → READY from the kitchen display; the first action is labeled “Terima & mulai” because the workflow has no separate accepted status. OWNER/CASHIER can mark READY → COMPLETED from table/order operations. Every route and server action checks authorization.
- The kitchen display shows only order number, table/group label, age, item/variant/add-on quantities, and notes; it does not expose customer contact, cashier details, payment, or financial totals.
- Refresh the kitchen display every five seconds with `router.refresh()` and revalidate after mutations. WebSockets are out of scope.
- No inventory deduction is triggered by completion; inventory remains Phase 5.

## Architecture

- `src/server/services/tables.ts` owns table CRUD, reservation/cleaning/availability, group merge/unmerge, order assignment, and draft bill splitting. It performs database work inside transactions and records sensitive operations in `AuditLog`.
- `src/server/services/order-workflow.ts` owns allowed status transitions and their audit records; it does not recalculate payment totals or mutate order items.
- `src/server/actions/tables.ts` and `src/server/actions/order-workflow.ts` parse FormData with Zod, obtain the actor from the session, check route/role access, invoke services, and revalidate affected routes.
- `/tables` provides table/group operations and active order controls. `/kitchen` provides the focused preparation queue. POS gains table selection and a split-draft action.
- Prisma changes add `CafeTable.isActive` and the minimum self-relation needed to represent a primary table and its merged members. Order status values and the existing `Order.tableId` relation are reused.
- Read queries for KDS return a purpose-built narrow projection. Business rules stay in server services rather than UI components.

## State and consistency rules

- Table assignments, order draft splits, group changes, order transitions, table state updates, and audit entries are transactional.
- Concurrency uses conditional `updateMany`/row claims for current table/order state. A stale action returns a user-safe conflict instead of overwriting a newer state.
- A table cannot become AVAILABLE while it has any DRAFT, CONFIRMED, PREPARING, or READY order.
- A table group cannot be merged if a member is RESERVED or CLEANING, or already belongs to another group. Available and occupied tables may be merged. Group changes preserve the original `Order.tableId` for historical accuracy.
- Splitting a draft uses integer item quantities, cannot create an empty ticket, and cannot change paid orders. Both resulting drafts commit together with audit records.
- Kitchen transitions are idempotency-safe: only the expected prior status can be changed, so concurrent taps cannot skip or duplicate a transition.

## Authorization

- OWNER/CASHIER: tables and dine-in order assignments, table service completion, and split draft operations.
- OWNER/KITCHEN: kitchen queue and PREPARING/READY transitions.
- OWNER/CASHIER: READY → COMPLETED through table/order service flow.
- MANAGER is not granted table or kitchen access because the supplied role matrix omits those modules.
- OWNER retains all access. KITCHEN cannot access POS, payments, order history, table management, or customer information.

## Error handling

- Return localized errors for occupied/reserved/cleaning table conflicts, invalid merges, stale table/order state, invalid split quantities, discounted draft split, forbidden transitions, and attempts to modify paid orders.
- No internal database errors or stack traces reach clients.
- Keep cancellation limited to unpaid DRAFT orders. Handle paid-order refunds in a future refund-capable phase.

## Testing and verification

- Unit tests: allowed order transitions, role/route permissions, table group invariants, split quantity validation, split discount rule, and service-level input validators.
- PostgreSQL integration tests: table reservation/open/close, concurrent table assignment, merge/unmerge, active-order guards, split rollback/audit, transition history, concurrent transition attempts, and role-safe kitchen projections.
- UI smoke checks: table selection in POS, split draft, role-specific navigation/actions, five-second kitchen refresh behavior, and kitchen action feedback.
- Run lint, typecheck, all unit tests, PostgreSQL integration tests, Prisma validation, production build, and HTTP smoke checks.

## Explicit exclusions

- Refund execution and `REFUNDED` transitions, partial payments, split tenders, and payment gateways.
- Ingredient deduction, stock checks, inventory transactions, and COGS.
- WebSocket kitchen updates, table reservations with customer/time metadata, and staff assignment.
- Editing item contents or amounts after payment.

## Assumptions for review

- “Split bill” means selected item quantities move to another unpaid draft before checkout. Each resulting order receives its own payment and receipt.
- Discounts are not automatically carried across a split. The cashier removes the source discount before splitting and reapplies eligible rules per resulting order.
- A merged table group has one primary table for new orders; existing orders preserve their table IDs.
- Completion means served/closed by owner or cashier; kitchen staff stop at READY.
- Refund behavior will be implemented with an actual refund payment record in a later phase rather than exposing a status-only refund action.
