# Cafe POS Phases 6–7 Implementation Plan

> Execute inline against the existing `work/phase-1` workspace. The user's original product brief is the binding specification; preserve its Indonesian UI, IDR decimal rules, role policies, existing local preview, and no-commit ruling.

## Goal
Complete the remaining operations and production-readiness modules: customer management, expenses, cash sessions, operational/financial reports, user administration, cafe settings, and audit visibility. Preserve the existing order, inventory, auth, and role boundaries.

## Architecture
Use current App Router server pages/actions, Zod input schemas, server-only service modules, Prisma/PostgreSQL transactions, `requireRouteAccess`, `CatalogActionState`, existing styling conventions, and explicit projections. Keep financial and report arithmetic in Prisma.Decimal. Add additive migrations only. Dashboard/report time windows use Asia/Jakarta boundaries.

## Tasks

### Task 1 — Domain rules and validation
- Add customer, expense, cash-session, report-window schemas/calculations and deterministic pure tests.
- Define expense fields and safe date range validation; use Decimal strings.
- Define cash session expected cash as opening cash + cash CHARGE payments paid in session − cash REFUND payments and cash expenses recorded in the session.
- Define customer totals from completed orders, keeping aggregate data authoritative rather than trusting client counters.

### Task 2 — Customer management
- Add server service/actions, protected `/customers` page, search/create/update/deactivate behavior (soft inactive field if needed), order-derived visits/spending/last visit, and optional POS selection refresh.
- CASHIER may view/create/edit customers; MANAGER/OWNER may do the same. Validate unique phone/email and preserve linked orders.

### Task 3 — Expenses and cash sessions
- Add expense listing/creation and cash-session open/close services/actions/pages.
- Enforce OWNER/MANAGER expense permissions, cashier session ownership, one open session per cashier via a partial unique PostgreSQL index, and transactional close totals.
- Add audit events and role/action tests.

### Task 4 — Reports and dashboard
- Add date preset/custom range query helpers for Jakarta time.
- Add sales, product, payment, inventory, and estimated-profit report projections/pages. Profit and cost fields are server-authorized for OWNER/MANAGER only.
- Include cash expenses and avoid floating point calculations; test report math and boundaries.
- Add useful dashboard revenue/orders/AOV updates as needed.

### Task 5 — User administration, settings, and audit visibility
- Add owner-only user create/update/deactivate with password hashing and role validation; never expose hashes.
- Add cafe settings persistence for name, address, phone, tax and service rates, with server-side validation/audit. Apply settings to receipt/tax only where safe and compatible; record any deferred integration decision.
- Add owner/manager audit-log page with pagination and safe metadata projection; record successful login/logout and relevant mutations.

### Task 6 — Security and production hardening
- Review every new server action/page for authorization-before-data access, Zod parsing, safe errors, input/date limits, and no client secrets/cost leakage.
- Add direct-call authorization tests and integration tests for transactions, idempotency/session uniqueness, expense/cash totals, customer aggregates, report permissions, and audit behavior.
- Update navigation availability and README setup/features.

### Task 7 — Full verification and review
- Run db validate/generate, typecheck, lint, focused PostgreSQL integration suites, full test suite, production build, and local HTTP smoke checks.
- Apply migration additively without database reset; retain local preview.
- Request one fresh whole-change review; fix Critical/Important findings and rerun affected suites.

## Business/security constraints
- Do not use JavaScript floating point for money.
- Completed payments and expenses are immutable history; correct them with compensating records if/when supported.
- Never hard-delete financial history or users who own records; deactivate instead.
- OWNER full access; MANAGER reports except users/settings changes; CASHIER customers/POS/orders/tables and own cash session only; KITCHEN kitchen only.
- No login bypass outside explicit local preview mode.
- No commits; repository baseline is untracked and prior ruling forbids a broad initial commit.
