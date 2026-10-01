# Cafe POS Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the project foundation, database schema, authentication and role checks, Indonesian dashboard shell, and repeatable development seed data.

**Architecture:** Next.js App Router hosts server-rendered pages and server-side access checks. Auth.js Credentials uses JWT sessions and Prisma-backed users/roles; Prisma 7 talks to PostgreSQL through `pg` adapter. Role names are stored as strings so roles can be added without a database enum migration; application permission mappings still define access. Seed and permission logic stay outside UI components.

**Tech Stack:** Next.js 15.5.27, React 19, TypeScript, Tailwind CSS 4, PostgreSQL, Prisma ORM 7.10.0, Auth.js 4.24.15, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-cafe-pos-design.md` (derived from the user's supplied cafe POS requirements; this plan implements only Phase 1).

## Global Constraints

- Use Next.js with App Router, TypeScript strict mode, Tailwind CSS, PostgreSQL, Prisma, Auth.js, and Zod.
- Use UUID primary keys, decimal database types for money, and timestamps where appropriate.
- Keep server-side authorization mandatory; do not trust client navigation visibility.
- Use Indonesian (`id-ID`) for the primary interface and format currency as IDR.
- Keep Phase 1 to setup, schema, authentication, roles, dashboard shell, navigation, and seed data.
- Never commit secrets; demo credentials are for local development only.

## Review Focus

- Unauthenticated direct requests to protected routes must redirect to login; test both signed-out and wrong-role behavior.
- Invalid or unknown credentials must fail without revealing whether an email exists; test credential verification.
- Role changes must affect authorization on a fresh session; test the role-to-route permission map and session claim handling.
- Repeated seed execution must remain safe; test deterministic seed helpers and unique keys.
- Missing database environment configuration must produce a useful server error and never expose a stack trace to the UI; verify env parsing behavior.

---

### Task 1: Scaffold and project tooling

**Files:** generated Next.js scaffold; `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, Tailwind/PostCSS config, `.gitignore`, `.env.example`, `vitest.config.mts`, `compose.yaml`.

- [x] Scaffold Next.js App Router with strict TypeScript, Tailwind, and ESLint.
- [x] Add minimal dependencies: Prisma 7 PostgreSQL adapter/client, Auth.js, Zod, bcryptjs, Vitest, and `tsx` for seed execution.
- [x] Add `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:seed`, and `build` scripts.
- [x] Verify dependency installation and starter checks.

### Task 2: Database foundation and sample data

**Files:** `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`, `prisma/seed.ts`, `src/lib/db/prisma.ts`, `src/server/auth/password.ts`, `src/server/seed/catalog.ts`, tests for password and seed helpers.

- [x] Write tests for password hashing/verification and deterministic sample-data construction; run them to confirm failure.
- [x] Add the specified domain schema foundations with UUID ids, relations, indexes, timestamps, and Decimal money fields.
- [x] Implement a singleton Prisma client using `PrismaPg` and a repeatable seed for roles, four demo users, sample catalog, ingredients, recipes, tables, and opening stock movements.
- [x] Generate Prisma Client and validate the schema without requiring a live database.
- [x] Run unit tests for password behavior and deterministic seed data; static review confirms seed writes use unique upserts and idempotency keys.
- [ ] Verify migrations and seed execution against a live PostgreSQL instance (Docker/PostgreSQL are unavailable in this environment).

### Task 3: Authentication and access control

**Files:** `src/lib/auth/config.ts`, `src/lib/auth/guards.ts`, `src/lib/permissions/roles.ts`, `src/lib/permissions/navigation.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/*`, `src/app/(protected)/layout.tsx`, tests for permissions/password helpers.

- [x] Write failing tests for allowed routes and denied role access.
- [x] Configure Auth.js Credentials sign-in against seeded users and hashed passwords, JWT session claims, and secure cookie settings.
- [x] Add server-side role guards and a localized login form with Zod validation and user-safe error messages.
- [x] Equalize unknown/inactive credential checks with a dummy bcrypt hash; test valid, invalid, unknown, inactive, and malformed credential cases.
- [x] Revalidate active account status before redirecting from login and render a safe protected-page message when the database is unavailable.
- [x] Verify authorization helpers, login route compilation, lint, and type checking.

### Task 4: Dashboard shell, navigation, and documentation

**Files:** `src/app/(protected)/dashboard/page.tsx`, `src/app/(protected)/workspace/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/layout/*`, `src/components/auth/*`, `README.md`.

- [x] Build responsive Indonesian sidebar/topbar navigation filtered by role and a dashboard backed by database queries.
- [x] Add logout and authenticated user display; protected pages remain server gated.
- [x] Document architecture, prerequisites, env vars, migration/seed commands, checks, build, deployment setup, and local demo accounts.
- [x] Run `npm run lint`, `npm run typecheck`, `npm test`, Prisma validation/generation, and `npm run build`; fix failures before reporting.

### Review follow-up

- [x] Address reviewer findings for credential timing, disabled-account redirect loops, database outage rendering, and extensible role storage.
- [x] Re-run lint, typecheck, unit tests, schema validation, migration consistency, and production build.
