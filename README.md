# Seentair Platform

Central business system for Seentair Limited — fashion manufacturing & commerce. See [CLAUDE.md](CLAUDE.md) for the project guide and [docs/00-README.md](docs/00-README.md) for the full documentation map.

## Structure

```
/apps/storefront       Angular retail storefront (functional baseline; cinematic Stitch design pass pending)
/apps/wholesale-portal Angular wholesale portal (tier pricing, bulk orders, invoices, custom designs)
/apps/admin-dashboard  Angular internal operations app (dashboard, approvals, production, orders, returns, audit)
/services/api          Core backend — NestJS + PostgreSQL (Phases 0–7 complete)
/services/jobs         Background workers (BullMQ) — stub
/packages/shared-types Shared TypeScript contracts
/docs                  Full project documentation (phases, PRD, data model, API spec…)
```

## Quick start

```bash
# Backend
npm install
cp services/api/.env.example services/api/.env   # then edit values
createdb seentair_dev                            # local PostgreSQL 16
npm run api:migrate
npm run api:seed
npm run api:dev                                  # http://localhost:3000/api/v1  (Swagger at /docs)

# Frontends (each has its own node_modules; run from its folder)
cd apps/storefront && npx ng serve               # http://localhost:4200
cd apps/wholesale-portal && npx ng serve --port 4201
cd apps/admin-dashboard && npx ng serve --port 4202
```

Seeded test accounts (dev only, password `Password123!`): `owner@`, `manager@`, `sales@`, `inventory@`, `production@`, `finance@`, `partner@`, `wholesaler@`, `customer@` — all `…seentair.test`. Storefront customers can also self-register.

## Status

Backend Phases 0–7 complete (see `docs/phases/`). All three Angular frontends functional. Remaining: cinematic storefront design pass (Google Stitch MCP), Paystack/GIGL/Termii production keys, POS planning (Open Question #1), and the other high-priority open questions in `docs/project/03-Open-Questions.md`.
