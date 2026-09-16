# Phase 0 — Foundation (Sprint 0)

**Goal:** everything later phases depend on: resolved blockers, working repo/CI, the NestJS API skeleton, and the auth/roles/audit foundation that every other module builds on.

**Frontend:** none in this phase (backend-first). No Stitch design work yet.

## 0.1 Resolve High-priority Open Questions

From `../project/03-Open-Questions.md` — must not slip past Sprint 0 planning:
- **#1** POS priority contradiction (LATER vs Must Have Now)
- **#6** Currency confirmation (₦ Naira assumed) — before payment integration
- **#7** NDPR compliance — before data model finalization

Log answers with dates in the Open Questions file.

## 0.2 Repository & tooling

- Scaffold the monorepo per `../project/10-Development-Guide.md` (`apps/`, `services/api`, `services/jobs`, `packages/shared-types`, `packages/ui-components`, `docs/`).
- TypeScript strict mode; shared ESLint + Prettier config in `/packages`.
- CI pipeline: lint, type-check, unit + integration tests on PR; auto-deploy `develop` → Staging, `main` → Production (manual gate). See `../project/12-Operations-Deployment-Guide.md`.
- `.env.example` templates per service; secrets never committed.
- Dev/Staging/Production environment definitions.

## 0.3 Backend deliverables (NestJS + PostgreSQL)

1. **API skeleton** — NestJS app at `services/api`, base path `/api/v1`, global validation pipe, pagination convention (`?page=&limit=`), OpenAPI/Swagger generation.
2. **Database foundation** — PostgreSQL connection, migration tooling, seed script (roles, one test user per role).
3. **Auth module** — `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`; JWT-based sessions.
4. **Users & Roles module** — `User`, `Role`, `Permission` entities (access levels F/V/A/O/–); endpoints `GET/POST /users`, `GET /users/:id`, `PATCH /users/:id/role`.
5. **RBAC enforcement layer** — guard/decorator enforcing the matrix in `../project/05-Role-Permission-Matrix.md` server-side on every endpoint. Least-privilege default: new accounts start View-only.
6. **Audit-log foundation (cross-cutting — build now, UI in Phase 6)** — `AuditLogEntry` (actor, action, before/after state JSON, timestamp) written automatically via interceptor/trigger, never manually per feature. Retrofitting this later is error-prone.
7. **Approval-request foundation** — `ApprovalRequest` entity + service so later phases (price changes, purchasing, production, funds) can gate at the API layer. Full workflow/UI in Phase 6.
8. **Configuration service** — currency/locale as configuration, not hardcoded (pending OQ #6).

## Acceptance criteria

- [ ] CI green on a trivial PR; staging deploy works end-to-end.
- [ ] A seeded user per role can log in and receives a JWT.
- [ ] An endpoint annotated for a role correctly rejects other roles (integration-tested).
- [ ] Any mutation through the audited interceptor produces an `AuditLogEntry` automatically.
- [ ] High-priority open questions have logged answers (or an explicit client-approved deferral).

## Depends on / blocks

- Depends on: nothing.
- Blocks: **every other phase** (auth, RBAC, and audit are cross-cutting).
