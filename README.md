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
# Set ALLOW_SEED=true and a private SEED_USER_PASSWORD (12+ chars) in services/api/.env
npm run api:seed
npm run api:dev                                  # http://localhost:3000/api/v1  (Swagger at /docs)

# Frontends (each has its own node_modules; run from its folder)
cd apps/storefront && npx ng serve               # http://localhost:4200
cd apps/wholesale-portal && npx ng serve --port 4201
cd apps/admin-dashboard && npx ng serve --port 4202
```

Seeded test accounts (development only): `owner@`, `manager@`, `sales@`, `inventory@`, `production@`, `finance@`, `partner@`, `wholesaler@`, `customer@` — all `…seentair.test`. Their password is the locally configured `SEED_USER_PASSWORD`; do not commit it or use a production credential. Storefront customers can also self-register.

## Database integrity checks

Read-only checks for a restored or local database:

```bash
npm run db:reconcile --workspace services/api
npm run db:hygiene --workspace services/api
npm run db:verify-ledgers --workspace services/api
```

`db:reconcile` reports table counts, order/payment totals, inventory balances, FK orphans and duplicate keys. `db:hygiene` reports count-only cleanup signals (test users, privileged accounts, category spelling variants, unknown shipping states, image/stock gaps, stale unpaid orders, refresh tokens). `db:verify-ledgers` verifies the inventory and audit hash chains through the same service logic the API uses.

For a restored staging copy, restore the dump into an isolated local database and point the `DB_*` variables in `services/api/.env` at that copy. Run migrations first if the dump predates the current schema, then run the three checks. Never point these commands at live staging or production; `ALLOW_PROD_READONLY=true` is only for an isolated production snapshot when `NODE_ENV=production`, and it does not make writes safe.

To start the disposable DB for `npm run test:db --workspace services/api`, start local PostgreSQL 16, create a fresh database named `seentair_ci_test` (for example with `createdb seentair_ci_test`), and configure its local connection in the ignored `services/api/.env.test`; set `DB_DISPOSABLE=true` and `DB_ALLOW_RESET=true`, then set `DOTENV_CONFIG_PATH` to that file before running the command. The runner drops and recreates that database's `public` schema, applies migrations, runs all three seeds twice, then runs the DB-gated test suites and verification tools. It refuses `DATABASE_URL`, non-local hosts, names without the `_test` suffix, or missing reset acknowledgements. Never use a development or shared database for this command; see [the database test runbook](docs/runbooks/database-test.md).

## Status

Backend Phases 0–7 complete (see `docs/phases/`). All three Angular frontends functional. Remaining: cinematic storefront design pass (Google Stitch MCP), Paystack/GIGL/Termii production keys, POS planning (Open Question #1), and the other high-priority open questions in `docs/project/03-Open-Questions.md`.
