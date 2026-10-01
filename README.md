# Kopi Sore POS

A modular point of sale system for a cafe. This repository delivers **Phases 1–7**: role-based authentication, catalog and cashier workflows, table service, kitchen display, recipe-based inventory, customer and finance operations, reporting, user administration, cafe settings, and audit history.

## Features in Phases 1–5

- Next.js App Router, TypeScript strict mode, Tailwind CSS, and responsive Indonesian interface.
- PostgreSQL schema managed with Prisma migrations; UUID keys and decimal types are used for financial and inventory quantities.
- Auth.js Credentials sign-in with bcrypt password hashes, secure session cookies, session expiry, and database backed role checks.
- Roles: OWNER, MANAGER, CASHIER, and KITCHEN. Route permissions are checked on the server; menu visibility is only a usability layer.
- Seed data for all roles, cafe categories, products, variants, add-ons, ingredients, recipes, tables, and auditable opening stock movements.
- OWNER and MANAGER catalog CRUD for categories, products, product variants, and add-ons, with server-side validation and audit events.
- Product search and filtering, soft deactivation for referenced catalog entries, and historical-reference checks before deletion.
- Touch-friendly cashier POS with product search, category filtering, variants, add-ons, item/order notes, customer selection, and dine-in/takeaway orders.
- Persisted DRAFT orders can be held, resumed, updated, or cancelled. Checkout reloads live menu data and saves item, variant, add-on, discount, tax, and price snapshots.
- Percentage and fixed discounts for orders or individual products; owners/managers manage discount rules and cashiers can apply active rules.
- Exact server-side IDR calculations, 11% tax, 0% service charge, cash change, and QRIS/debit/card/other payment recording.
- Payment and DRAFT-to-CONFIRMED transition commit in one transaction; duplicate checkout is rejected.
- Order history, role-scoped cashier views, and an 80 mm print-friendly receipt.
- Table management with reservations, cleaning states, merge/unmerge groups, active order moves, and capacity totals.
- Dine-in drafts require a selectable active table group; takeaway orders do not use a table. Table assignment is revalidated inside the checkout transaction.
- Cashiers can split unpaid dine-in drafts by item quantity. Each ticket keeps its own item, variant, add-on, and note snapshots; a discount must be removed before splitting.
- Dedicated order workflow guards CONFIRMED → PREPARING → READY → COMPLETED transitions by role and expected current status. Authorized owners and managers can fully refund an active paid order in a transaction; the original charge is retained, cash refunds require an open locked cashier session, and a refund payment plus reasoned audit event are added.
- Kitchen display polls every five seconds and returns only order number, preparation status, item details/notes, and table label. It excludes payment, customer contact, cashier identity, and financial totals.
- Table and order workflow operations write audit records in the same database transaction.
- Dashboard reads orders, revenue, top products, payment methods, and low stock from PostgreSQL.
- Zod validation for submitted authentication credentials and safe, user-facing error states.

## Phase 5 inventory

- OWNER and MANAGER can manage ingredients, minimum stock, activation, product recipes, add-on recipes, and stock movements.
- Ingredient quantities use explicit units (g, kg, ml, l, or piece); no automatic unit conversion occurs.
- Purchases, adjustments, waste, stock opname, returns, and order sales update the ingredient balance and append an inventory ledger record in one transaction. Purchases maintain a four-decimal weighted-average cost.
- Checkout stores immutable per-order-item ingredient, quantity, unit, name, and cost snapshots. Later menu or ingredient changes do not rewrite a confirmed ticket.
- Tracked products without a recipe cannot be checked out. Untracked products and add-ons without recipes do not deduct ingredients.
- READY-to-COMPLETED deducts the saved recipe requirements atomically with order status, audit records, and stock movements; insufficient stock leaves the order and every ingredient unchanged.
- CASHIER and KITCHEN cannot access inventory pages or inventory-cost projections.

## Phases 6–7 operations and hardening

- Customer records support search, contact details, notes, and soft deactivation. Visits, lifetime spending, and last visit derive from completed orders; inactive customers remain attached to order history and are omitted from POS selection.
- OWNER and MANAGER can record expenses. Cash expenses are assigned to an open cashier session so they are counted in that drawer exactly once.
- Cashiers can open and close their own sessions. Cash payments are linked to the session under a row lock; concurrent open attempts are prevented by a PostgreSQL partial unique index. Closing records opening cash, cash sales, refunds, assigned cash expenses, expected cash, actual cash, and the variance atomically.
- Reports include Jakarta-local date presets and custom ranges for sales, product units and revenue, payment movements, current stock, inventory movements, low stock, COGS, expenses, refunds, and estimated profit. Report queries share a repeatable-read database snapshot and financial reports are restricted to OWNER and MANAGER.
- Owners can create, update, and deactivate users. Passwords are hashed; account forms never return password hashes; the last active owner cannot be removed.
- Cafe identity, tax, and service charge are configurable by OWNER. Checkout recalculates using saved settings and writes the applied rates to each order, so historical receipts retain their original rates.
- Audit history records successful login/logout and sensitive catalog, order, inventory, customer, finance, settings, and user changes. OWNER and MANAGER can review paginated audit entries.

## Architecture

```text
src/
  app/                 App Router pages, layouts, and auth handler
  components/          Auth, catalog, POS, tables, kitchen, inventory, receipt, and shared application shell
  lib/auth/            Auth.js configuration and server guards
  lib/db/              Prisma client lifecycle
  lib/permissions/     Role and navigation policy
  server/auth/         Password hashing and verification
  server/seed/         Repeatable development catalog
  server/services/     Dashboard, catalog, customer, finance, report, settings, user, audit, inventory, and order operations
  generated/prisma/    Generated Prisma Client (ignored by Git)
prisma/                PostgreSQL schema, migrations, and seed script
docs/superpowers/      Phase 1 design and implementation plan
```

UI components render and gather input. Server guards decide access, and server services own database operations. Financial calculations live in pure server/order modules, and the POS only presents a live preview that checkout recalculates from PostgreSQL.

## Requirements

- Node.js 20.19 or newer (Node 20.20.2 is used for the current build environment).
- npm 10 or newer.
- Docker Compose for the included local PostgreSQL service, or a PostgreSQL 15+ database you manage.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local env file and change the example database password and Auth.js secret:

   ```bash
   cp .env.example .env
   ```

   Generate `NEXTAUTH_SECRET` with `openssl rand -base64 32`. Keep `.env` local; it is ignored by Git.

3. Start PostgreSQL with Docker Compose:

   ```bash
   docker compose up -d db
   ```

   The service only binds to `127.0.0.1`. If PostgreSQL is already running, update `DATABASE_URL` and skip this step.

4. Create the schema and seed the local development data:

   ```bash
  npm run db:migrate
   npm run db:seed
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`.

### Local preview without login

To use the app without a login during local development, set `LOCAL_PREVIEW="true"` in `.env` and restart `npm run dev`. This uses the seeded OWNER account for local actions and skips authentication only when `NODE_ENV` is not `production`. PostgreSQL must be running for operational pages. Production always requires normal authentication.

Prisma Client generation runs after `npm install`; regenerate it with `npm run db:generate`. `npm run db:validate` checks the schema without connecting to PostgreSQL. Migration and seed commands require a valid `DATABASE_URL`.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string used by Prisma. |
| `NEXTAUTH_SECRET` | Secret used to sign and encrypt Auth.js session tokens. Use a unique random value outside local development. |
| `NEXTAUTH_URL` | Canonical application URL used by Auth.js, such as `http://localhost:3000`. |
| `POSTGRES_USER` | Local Compose database user. |
| `POSTGRES_PASSWORD` | Local Compose database password. Change the example value. |
| `POSTGRES_DB` | Local Compose database name. |
| `POSTGRES_PORT` | Local Compose host port; defaults to `5432`. |

## Demo accounts

The seed script creates these **local development only** credentials. Change or remove them before deploying, and never seed demo accounts into a production database.

| Role | Email | Password |
|---|---|---|
| OWNER | `owner@cafe.local` | `CafeOwner2026!` |
| MANAGER | `manager@cafe.local` | `CafeManager2026!` |
| CASHIER | `cashier@cafe.local` | `CafeCashier2026!` |
| KITCHEN | `kitchen@cafe.local` | `CafeKitchen2026!` |

## Database operations

- `npm run db:validate` — validate the Prisma schema.
- `npm run db:generate` — generate Prisma Client.
- `npm run db:migrate` — create/apply a development migration.
- `npm run db:deploy` — apply committed migrations in a deployment environment.
- `npm run db:seed` — create or update local development seed records.

Phase 4 table groups are added by migration `20261001150000_phase4_table_groups`; Phase 5 inventory and recipe snapshots are added by `20261001160000_phase5_inventory`; Phase 6 adds customer activation, cafe settings, single-open cashier sessions, session-linked expenses and payments in `20261001170000_phase6_operations`, `20261001171000_cash_expense_link`, and `20261001172000_payment_cash_session`. These are additive migrations. The usual `npm run db:deploy` deployment step applies pending migrations before the updated application starts. The open-session index is a PostgreSQL partial index and is maintained by the migration.

The seed uses deterministic unique keys and creates opening inventory movements once. Re-running it updates demo data without duplicating opening stock transactions.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run db:validate
npm run build
```

The unit suite covers role permissions, password hashing, IDR formatting, catalog/order validation, exact order calculations, and deterministic sample data. Run PostgreSQL integration suites after local setup:

```bash
CATALOG_INTEGRATION_TESTS=true npm test -- src/server/services/catalog.integration.test.ts
ORDER_INTEGRATION_TESTS=true npm test -- src/server/services/orders.integration.test.ts src/server/services/discounts.integration.test.ts
TABLE_INTEGRATION_TESTS=true npm test -- src/server/services/tables.integration.test.ts
ORDER_INTEGRATION_TESTS=true npm test -- src/server/services/table-orders.integration.test.ts src/server/services/order-workflow.integration.test.ts src/server/services/orders.integration.test.ts
PHASE6_INTEGRATION_TESTS=true npm test -- src/server/services/customers.integration.test.ts src/server/services/finance.integration.test.ts src/server/services/reports.integration.test.ts src/server/services/settings.integration.test.ts src/server/services/users.integration.test.ts
ORDER_INTEGRATION_TESTS=true npm test -- src/server/services/order-workflow.integration.test.ts
```

## Production build and deployment

```bash
npm run build
npm run start
```

Deploy to a Node.js host with a supported PostgreSQL service. Configure `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` in the deployment environment, then run `npm run db:deploy` as a release step before starting the new application version. Use HTTPS in production. Local demo users and sample inventory are not production data. Configure database backups and restricted database credentials in the hosting platform.

## Development phases

1. Foundation, database, authentication, roles, dashboard shell, and seed data — complete.
2. Categories, products, variants, and add-ons — complete.
3. POS, cart, saved drafts, discounts, tax, payments, orders, and receipts — complete.
4. Tables, kitchen display, and order workflow — complete.
5. Ingredients, recipes, inventory movements, waste, and stock opname — complete.
6. Customers, expenses, cash sessions, and reports — complete.
7. User administration, cafe settings, audit coverage, security hardening, and production checks — complete.
