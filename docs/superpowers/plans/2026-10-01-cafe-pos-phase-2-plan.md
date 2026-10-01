# Cafe POS Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver database-backed category, product, variant, and add-on CRUD for owners and managers.

**Architecture:** Keep pages server-rendered, use server actions for mutations, and put Zod validation and Prisma operations in server-side catalog modules. Mutations include audit events and use database transactions when changing relations; referenced financial records cannot be deleted.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Prisma 7, PostgreSQL, Auth.js, Zod, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-cafe-pos-design.md` and the Phase 2 scope in the user's cafe POS brief.

## Global Constraints

- Only OWNER and MANAGER can access catalog routes or mutations; enforce authorization on the server.
- Validate every mutation with Zod; use Decimal for price values and never use floating point for money.
- Keep business logic outside UI components and return user-safe errors for duplicate keys, invalid references, and referenced records.
- Preserve the Indonesian visual system and IDR formatting already used in the app.
- Do not add dependencies or begin Phase 3.

## Review Focus

- Cashier and kitchen users requesting catalog pages or actions receive no access.
- Duplicate SKU/category/add-on names and malformed prices return actionable errors without partial writes.
- Deleting products/add-ons referenced by orders is blocked; category deletion is blocked while products reference it.
- Variant edits/deletes preserve order snapshots through existing database relations.
- Add-on product associations update atomically and cannot attach inactive or missing records.

### Task 1: Catalog validation and services

**Files:** `src/server/catalog/validation.ts`, `src/server/services/catalog.ts`, tests under `src/server/catalog/`.

- [x] Write failing tests for category/product/variant/add-on input rules, including exact decimal price values, duplicate-sensitive fields, and ID validation.
- [x] Implement schemas and catalog service functions for listing and mutation operations. Audit catalog changes transactionally; convert Prisma uniqueness/FK errors to typed safe errors.
- [x] Run catalog tests, typecheck, and lint.

### Task 2: Category management

**Files:** `src/app/(protected)/categories/page.tsx`, category form/list components, `src/server/actions/catalog.ts`, route permission and navigation files.

- [x] Expose `/categories` only to OWNER and MANAGER.
- [x] Implement create, edit, active/inactive toggle, and delete when no products reference the category.
- [x] Verify validation, authorization, transaction/audit behavior, and database-backed CRUD against local PostgreSQL.

### Task 3: Product, variant, and add-on management

**Files:** `/products`, `/products/new`, `/products/[productId]`, and `/addons` server pages; focused product/variant/add-on forms, catalog server actions/services, route permission and navigation files.

- [x] Implement product search/filter and create/edit/activate/deactivate/delete, including category, SKU, description, image URL, base price, and stock tracking.
- [x] Implement product-scoped variant CRUD with exact decimal prices.
- [x] Implement add-on catalog CRUD and product association management; block deletion when order history references an add-on.
- [x] Verify CRUD and relationship behavior against local PostgreSQL, including duplicate SKU, invalid category, protected role, and historical-reference cases.

### Task 4: Phase 2 verification and documentation

- [x] Run lint, typecheck, the complete test suite, Prisma validation, and production build.
- [x] Confirm local PostgreSQL contains the new catalog changes and update README phase/status instructions.
- [x] Review the route permissions and all server mutation entry points for authorization and validation.

## Review follow-up

- Preserve submitted values after server action validation/database errors so React's form reset does not discard cashier/manager input.
- Retain existing add-on associations to a product if it is later deactivated, while preventing new links to inactive products.
- Validate product status mutations with Zod, normalize repeated search params, and return 404 for malformed product UUIDs.
- Emit explicit old/new price audit metadata for variant and add-on price changes.
- Variant deletion intentionally preserves order item snapshots; the variant foreign key uses `SetNull`.
