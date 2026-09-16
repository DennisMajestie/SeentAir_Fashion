# Seentair Limited Platform

Central business system for Seentair Limited — a Nigerian streetwear/clothing manufacturer (single factory) — connecting manufacturing, inventory, sales (retail + wholesale), e-commerce, accounting, logistics, analytics, and partner/investor visibility. Replaces manual, paper-based operations.

**Client:** Seentair Limited — Okereke Ndubuka Cynthia. Requirements approved 2026-09-09; engineering revision 2026-09-15.

## North star (tie-breaker for every decision)

> "Customers can shop without struggling, while the owner can see what is happening in the business without needing to be physically present at the factory."

## Confirmed engineering stack

- **Backend:** Node.js + **NestJS** (core API), background workers (BullMQ on Redis)
- **Database:** **PostgreSQL**
- **Frontends:** **Angular** for all user-interaction surfaces — Retail Storefront, Wholesale Portal, Admin/Operations Dashboard
- **Payments:** Paystack (confirmed). **Logistics:** GIGL first, behind a pluggable adapter. **Storage:** S3-compatible object storage. **SMS/WhatsApp:** Termii or Twilio (TBD)
- TypeScript strict mode everywhere; ESLint + Prettier shared config

## Development strategy & status (updated 2026-09-15)

1. **Backend: Phases 0–7 ALL COMPLETE** — 14 NestJS modules, 62 unit tests, 7 migrations, live smoke-tested per phase. See `docs/phases/`.
2. **Frontends: all three Angular apps functional** (`apps/storefront`, `apps/wholesale-portal`, `apps/admin-dashboard`) — task-oriented baselines wired to the live API. Each app has its own node_modules (not in the npm workspace).
3. **Remaining:** cinematic storefront design pass via Google Stitch MCP (brief in `docs/project/15-Design-Specification.md` §15.5; MCP not yet connected), production keys (Paystack, GIGL, Termii), POS planning stage, high-priority Open Questions (`docs/project/03-Open-Questions.md`), initial git commit (repo initialized, nothing committed).

## Architectural principles (non-negotiable, from client requirements)

1. **Single source of truth.** One Core API + one database serve all channels (retail, wholesale, in-store, admin). No channel-specific silos.
2. **Inventory is event-sourced.** Never mutate a stock count directly — always write an `InventoryMovement` record and derive current quantity. No direct DB writes to quantity fields from feature code.
3. **Approval gating is server-side.** Price changes, purchasing, production starts, and fund movements without approval state are rejected at the API layer, not just hidden in the UI.
4. **Everything writes to the audit log** — via trigger/interceptor, never manual per-feature calls.
5. **Currency and locale are configuration**, not hardcoded (₦ Naira assumed, pending Open Question #6).
6. RBAC enforced server-side on every endpoint. Partner/Investor role must never reach customer-facing surfaces or raw customer PII.

## Key business rules (quick reference)

- Wholesale MOQ = 20 units; multiple price tiers (criteria TBD — Open Question #2)
- No part-payments on ordinary orders; full payment upfront
- Returns: request within 12h of receipt, complete within 24h; custom orders excluded
- Production stages: Planned → Cutting → Sewing → Finishing → QC → Completed
- Production cost = raw material + sewing + branding + packaging
- QC rejects: defective → burned; minor factory error → repaired & restocked (reason code required)
- No supplier-relationship management (descoped); no customer credit; no historical data migration
- Profit split (post-MVP partner portal): 40% reinvestment / 40% dividends / 20% reserve; 1,000,000 shares, 60% founder / 40% partners

## Repository structure (planned monorepo)

```
/apps
  /storefront          Angular retail storefront (design via Stitch MCP — later)
  /wholesale-portal    Angular, authenticated (later)
  /admin-dashboard     Angular internal ops app (later)
/services
  /api                 Core backend — Node.js + NestJS  ← BUILD FIRST
  /jobs                Background workers
/packages
  /shared-types        Shared TypeScript contracts
  /ui-components       Shared design-system components
/docs                  This documentation set
```

## Documentation map

- `docs/00-README.md` — full document map and reading order
- `docs/phases/` — **the build plan**: phase-by-phase deliverables, backend-first
- `docs/project/` — Project Bible, PRD, architecture, data model, API spec, role matrix, QA, ops, design spec
- `docs/appendix-requirements/` — the approved module-by-module client requirements (**authoritative source of truth**; if the PRD ever disagrees with the appendix, the appendix wins)
- `docs/project/03-Open-Questions.md` — 7 unresolved items; High-priority ones (#1 POS priority, #6 currency, #7 NDPR) must be resolved before/during Sprint 0

## Conventions

- Branches: `main` (production) / `develop` (staging) / `feature/<ticket>-desc` / `hotfix/<ticket>`
- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`)
- Changes touching inventory movements, payments, or approvals/audit require a second domain-familiar reviewer
- Env vars never committed; `.env.example` is the template
