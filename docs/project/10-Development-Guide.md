# 10. Development Guide

## Confirmed stack

All user-interaction frontends use **Angular**; the backend uses **Node.js + NestJS**; database is **PostgreSQL**.

## Repository structure (confirmed monorepo direction)

```
/seentair-platform
  /apps
    /storefront          (Angular retail storefront — built later, design via Stitch MCP)
    /wholesale-portal    (Angular, authenticated — later)
    /admin-dashboard     (Angular internal operations app — later)
  /services
    /api                 (core backend — Node.js + NestJS)  ← build first
    /jobs                (background workers)
  /packages
    /shared-types        (shared TypeScript contracts)
    /ui-components       (shared design-system components)
  /docs                  (this documentation set)
```

> **Backend-first note:** `/services/api` (and its PostgreSQL schema) is scaffolded and developed first, per `../phases/`. Angular apps are added when their phase's backend is complete and the Stitch-driven design pass has produced approved screens.

## Branching strategy

- `main` — always deployable, maps to production.
- `develop` — integration branch, maps to staging.
- `feature/<ticket-id>-short-description` — one branch per task, merged into `develop` via pull request.
- `hotfix/<ticket-id>` — branched from `main` for urgent production fixes.

## Commit convention

Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`), so changelogs can be generated automatically.

## Code review requirements

- Minimum 1 approving review before merge to `develop`.
- Any change touching inventory movement, payments, or the approval/audit layer requires review from a second engineer familiar with that domain — these are the highest-risk areas per `07-Technical-Architecture.md`.
- CI must pass (lint, type-check, unit tests) before merge is allowed.

## Coding standards

- TypeScript strict mode across frontend and backend.
- Linting: ESLint + Prettier, shared config in `/packages`.
- **No direct database writes to stock/quantity fields from feature code** — always go through the inventory movement service layer (see `08-Initial-Data-Model.md` notes).
- Environment variables never committed; use `.env.example` as the template.

## Local environment setup (outline)

1. Clone repo, install dependencies per app/service.
2. Copy `.env.example` → `.env` in each app/service, fill in local Paystack test keys, DB connection string.
3. Run database migrations.
4. Seed minimal reference data (roles, a test product, a test user per role) for local development.
5. Start services (`api`, then frontends).

## Definition of Done (per ticket)

- Meets the acceptance criteria in the ticket (sourced from `02-PRD.md` / `../appendix-requirements/`).
- Unit tests added for new logic.
- No new lint/type errors.
- Reviewed and approved per the rules above.
- Deployed to staging and smoke-tested before being marked done.
