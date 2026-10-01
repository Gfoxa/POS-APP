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

- Node.js 22 or newer for the application and Capacitor 8 CLI.
- Android Studio 2025.2.1 or newer with Android SDK Platform 36 and Build Tools 36.1.0.
- JDK 21 selected as the Gradle runtime. Android Studio 2026.1 may bundle Java 25, which is too new for the generated Gradle 8.14.3 wrapper.
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

## Android tablet debug app

The Android app is a Capacitor WebView shell around the existing POS. The Next.js server and PostgreSQL stay on the computer; the APK contains neither database credentials nor Auth.js secrets. Keep the computer, database, and POS server running while testing. The tablet and computer must use the same private Wi-Fi network. This debug build uses local HTTP and is for trusted-network testing only.

### Prepare the computer

1. In Windows PowerShell, run `ipconfig` and note the IPv4 address for the active Wi-Fi adapter (for example, `192.168.1.25`). Do not use `localhost` or `127.0.0.1` in the APK.
2. In `.env`, set `NEXTAUTH_URL` to the computer's LAN origin, such as `http://192.168.1.25:3000`. Keep the existing `NEXTAUTH_SECRET` private, then restart the Next.js server so Auth.js uses the new origin.
3. Start PostgreSQL and apply any pending migrations. If using the included Docker Compose service, PostgreSQL remains bound to the computer's loopback interface; do not expose port 5432 to the network.

   ```powershell
   docker compose up -d db
   npm run db:deploy
   npm run db:seed
   ```

4. Start Next.js bound to all computer network interfaces:

   ```powershell
   npm run dev -- --hostname 0.0.0.0
   ```

5. If Windows Firewall blocks the tablet, allow TCP port 3000 only on the Private profile. Run PowerShell as Administrator for this temporary rule, then remove it after testing:

   ```powershell
   New-NetFirewallRule -DisplayName "Kopi Sore POS local test" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   ```

   After testing, remove the temporary rule:

   ```powershell
   Remove-NetFirewallRule -DisplayName "Kopi Sore POS local test"
   ```

### Build and install the APK

1. Install project dependencies from Windows PowerShell with Node.js 22 or newer:

   ```powershell
   npm ci
   ```

2. Set the same LAN origin for Capacitor and sync the Android project. This writes the origin into an ignored generated Android config asset, not into tracked source:

   ```powershell
   $env:ANDROID_POS_URL = "http://192.168.1.25:3000"
   npx cap sync android
   ```

   Replace the example address with the current Wi-Fi IPv4 address. Re-run this sync and rebuild the APK if that address changes.

3. In Android Studio, open the repository's `android` folder. Set **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK** to JDK 21. Select the debug build variant, then choose **Build → Build Bundle(s) / APK(s) → Build APK(s)**. The command-line equivalent from PowerShell is:

   ```powershell
   $env:JAVA_HOME = "C:\path\to\your\jdk-21"
   $env:Path = "$env:JAVA_HOME\bin;$env:Path"
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   Set-Location android
   .\gradlew.bat assembleDebug
   ```

   Set `JAVA_HOME` to your installed JDK 21 directory. The command-line build must use JDK 21 too; Android Studio's Gradle JDK selection only applies inside the IDE.

   The debug APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`. Only the debug manifest allows HTTP; the main and release manifests keep cleartext traffic disabled. Do not publish or distribute this debug APK.

4. Install by USB with ADB, or copy the APK to the tablet and open it there:

   ```powershell
   & "$env:ANDROID_HOME\platform-tools\adb.exe" install -r .\app\build\outputs\apk\debug\app-debug.apk
   ```

5. Open **Kopi Sore POS** and sign in with the local demo OWNER account listed above. Use normal authentication; keep `LOCAL_PREVIEW=false`.

### Troubleshooting

- **The app cannot connect:** confirm both devices are on the same Wi-Fi, the computer server is still running, and the tablet can open `http://<computer-LAN-IP>:3000` in its browser.
- **The server is not reachable:** restart Next.js with `--hostname 0.0.0.0`; check the Windows Firewall Private-profile rule and router client isolation.
- **The app opens the wrong computer or a stale address:** update `NEXTAUTH_URL` in `.env`, restart Next.js, set the new `ANDROID_POS_URL`, run `npx cap sync android`, rebuild, and reinstall the APK.
- **Login does not work:** make sure `NEXTAUTH_URL` and `ANDROID_POS_URL` use exactly the same origin, including `http` and port `3000`, then restart Next.js and rebuild the APK.
- **The computer/server/database is off:** the tablet app depends on all three being available and does not support offline transactions.

`ANDROID_POS_URL` accepts only an origin-only HTTP(S) URL; localhost, loopback, wildcard hosts, credentials, paths, queries, and fragments are rejected. Capacitor 8 requires Node.js 22 or newer. Keep the APK and test network private because this is a debug-only HTTP setup.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string used by Prisma. |
| `NEXTAUTH_SECRET` | Secret used to sign and encrypt Auth.js session tokens. Use a unique random value outside local development. |
| `NEXTAUTH_URL` | Canonical application URL used by Auth.js, such as `http://localhost:3000`; use the computer LAN origin for tablet testing. |
| `ANDROID_POS_URL` | Optional HTTP(S) origin embedded by Capacitor into the local debug app during `npx cap sync android`. |
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
