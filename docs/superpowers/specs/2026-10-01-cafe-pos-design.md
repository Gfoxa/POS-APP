# Cafe POS Phase 1 Design

## Goal

Start a maintainable cafe POS application with a real PostgreSQL-backed identity layer, role-based authorization, a seeded local database, and a responsive Indonesian dashboard shell.

## Scope

This delivery implements Phase 1 only: project setup, database foundation, authentication and roles, dashboard shell and navigation, and development seed data. Product CRUD, POS transactions, inventory movement, tables, kitchen workflows, customers, cash sessions, expenses, and reports remain later phases.

## Architecture

- Next.js App Router with server rendered route layouts and server-side role checks.
- PostgreSQL access through Prisma ORM and its PostgreSQL driver adapter.
- Auth.js Credentials provider with JWT sessions; password hashes stay in PostgreSQL and are verified server-side.
- Roles are stored as database records and referenced by users, so later permission growth does not require replacing an enum in the database.
- `src/server` owns authentication, authorization, and seed-related business logic; UI components consume typed server data.
- Local demo accounts and sample cafe catalog/ingredient/recipe data are created by an idempotent Prisma seed script. Demo credentials are documented as local-development-only.

## Decisions and assumptions

- No cafe POS repository existed in the current workspace. A new project was created at `/mnt/e/Projects/cafe-pos` at the user's direction; existing repositories were not modified.
- Primary UI language and locale are Indonesian (`id-ID`) and currency is IDR.
- Authentication uses stable Auth.js v4 with Next.js 15.5 LTS for compatible stable releases.
- Production database provisioning is external. `.env.example` documents `DATABASE_URL` and `NEXTAUTH_SECRET`; no credentials are committed.
- Dashboard is a Phase 1 shell with useful seeded operational summary data only where safely available. It will not pretend that unfinished POS flows are functional.

## Phase 1 acceptance

- Strict TypeScript, App Router, Tailwind, ESLint, Prisma/PostgreSQL, Auth.js, and Zod are configured.
- Database schema has UUID identifiers, role/user relations, audit-ready timestamps, and the catalog/inventory structures required by seed data and later phases.
- Demo users can sign in with hashed passwords; unauthorized roles cannot load protected areas through direct requests.
- OWNER, MANAGER, CASHIER, and KITCHEN receive role-appropriate navigation and dashboard access.
- Seed can be run repeatedly without creating duplicate demo data.
- `.env.example` and README document local setup and demo credentials.
- Lint, typecheck, tests, Prisma validation/generation, and production build pass where external database connectivity is not needed.
