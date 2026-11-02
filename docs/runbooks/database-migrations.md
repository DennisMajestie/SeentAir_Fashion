# Database migrations

Applies to the Seentair Core API in `services/api`. Schema changes go through TypeORM migrations only: both `src/database/data-source.ts` and `src/app.module.ts` set `synchronize: false`.

## Non-negotiables

- Use expand / backfill / contract. Add the new shape first, deploy code that writes both shapes, backfill, then remove the old shape in a later release.
- Prefer additive changes. A migration should do one concern; do not combine a schema change, a backfill, and a destructive cleanup in one file.
- Never edit a migration that has run in any shared environment. Add a new migration instead.
- Backfills must be deterministic, resumable, and idempotent. Bound them with a `WHERE` clause and rehearse them at production-like row counts.
- Do not put seed or demo data in migrations. A reference row is allowed only when the application cannot start without it; document why in the migration.
- Destructive steps wait at least one release after the code stops using the old shape, and require a verified backup plus an approved restore plan.
- Migrations run inside a transaction by default. Do not disable that without explicit review; operations such as `CREATE INDEX CONCURRENTLY` need a separately reviewed plan.
- Never print, paste, or commit connection strings, passwords, tokens, or customer data. Refer to environment variable names only.

## Environments

| Environment | Data | What may run | Guardrails |
|---|---|---|---|
| Local disposable | Synthetic seed data | All migrations, including destructive rehearsals | Recreate the database from scratch after destructive tests; never point at a shared host |
| Staging | Restored from a masked production backup | Migration rehearsal, reconcile, hygiene, ledger verification | Same PostgreSQL major version as production; mask PII before restore; no writes beyond the migration under test |
| Production | Live data | Approved additive/backfill migrations; destructive migrations only after the release rule above | Verified backup, restore test, maintenance window, named approver, read-only reconcile before/after |

Connection settings come from `DATABASE_URL`, or `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`; `DB_SSL` overrides SSL inference. Seeding additionally uses `ALLOW_SEED`, `SEED_USER_PASSWORD`, and `ALLOW_REMOTE_SEED`; those are local/staging tools and must not be enabled in production. `ALLOW_PROD_READONLY` applies only to read-only verification tools, never to migrations.

## Deployment path

- CI (`.github/workflows/ci.yml`) starts a clean PostgreSQL service and runs `npm run api:migrate`.
- The root `npm start` runs `migration:run` and then starts the API. The API's own `npm start` does **not** run migrations.
- No API hosting configuration is committed in this repository. Confirm the actual production start command before relying on automatic migration; if the host runs the API start command directly, migrations must be a separate, approved release step.

## Migration classes in this repository

Schema-only (additive): table/column/index creation, enum value additions, constraint additions that validate existing rows.

Data-changing: backfills, row inserts, or updates to existing rows. Rehearse with production-like counts and record before/after row counts.

Destructive: deleting rows, dropping tables/columns, or rebuilding a type in a way that cannot preserve all states. These require backup and restore rehearsal.

Known risky migrations:

- `1789520000000-Phase9AdminGaps.ts` — data-changing: backfills audit and inventory hash chains and installs hash triggers.
- `1789525000000-EmailVerification.ts` — data-changing: marks every existing user as email-verified.
- `1789530000000-ProductCategories.ts` — data-changing: backfills `categories` from existing product category strings.
- `1789560000000-CollapseDuplicateProducts.ts` — destructive: hard-coded UUID updates and product deletes; `down` re-inserts simplified rows, not the original records.
- `1789570000000-CollapseRemainingDuplicateProducts.ts` — destructive: same pattern for one remaining product.
- `1789580000000-CollapseDuplicateProductsByName.ts` — destructive and irreversible: derives duplicate products at runtime, repoints variants, deletes product rows; `down` is intentionally empty, so restore from backup.
- `1789600000000-CreatePlatformSettings.ts` — data-changing: inserts the singleton settings row.
- `1789700000000-AddOrderNumberToOrders.ts` — data-changing: backfills every order number in one statement.

Special cases:

- `1789521000000-PaymentIdempotencyStockException.ts` rebuilds the order status and payment status enums. `down` refuses while any order is in `stock_exception`, `cancelled`, or `refunded`; resolve those rows first.
- `1789591000000-AddCustomersModuleEnum.ts` adds an enum value; `down` is a documented no-op.
- `1789650000000-AddReservedCustomerCouponStatus.ts` adds an enum value; `down` throws because PostgreSQL cannot remove it without rebuilding the type.

## Authoring a migration

1. Write the expand step: nullable column, new table, or additive index.
2. Write the backfill as a separate, bounded, idempotent migration. Use stable ordering and `ON CONFLICT`/`WHERE` guards where appropriate.
3. Deploy application code that can read both shapes.
4. Add the contract step in a later release: set `NOT NULL`, add the final constraint, drop the old column/table.
5. Test `up` and `down` on a disposable database with realistic data. If `down` cannot be faithful, make it throw with an explanation and document the backup-restore path.

## Pre-flight checklist

- [ ] Target environment and connection source confirmed; no credentials echoed.
- [ ] Application version and migration list reviewed together.
- [ ] Backup taken; backup ID and time recorded.
- [ ] Restore of that backup tested on a scratch database.
- [ ] Read-only reconcile baseline captured and saved.
- [ ] Pending migrations listed and classified (schema-only / data-changing / destructive).
- [ ] Table sizes, lock risk, and expected duration estimated.
- [ ] Maintenance window and freeze on concurrent deploys agreed.
- [ ] Rollback or restore owner named and available.

Useful commands:

```bash
npm run typeorm -- migration:show
npm run api:migrate
npm run migration:revert --workspace services/api
```

Run commands from the repository root with environment variables already set in the shell. Do not put values in command history or documentation.

## Execution and verification

1. Run the migration once. Stop on the first failure; do not retry blindly.
2. Inspect the `migrations` table and the failing statement before deciding whether to roll forward or restore.
3. Run the read-only reconcile immediately after migration and compare with the pre-flight JSON. Investigate every unexpected delta.
4. Run ledger verification for inventory and audit hash chains.
5. Smoke-test the application: login, catalogue read, order read, inventory read. On production, keep the smoke test read-only.
6. Record the result in the run log and remove the maintenance window only after sign-off.

## Rollback

- Prefer a forward fix. Reverting a data-changing migration can be more dangerous than completing it.
- Use `migration:revert` one migration at a time only when that `down` has been rehearsed on a restored copy.
- If `down` throws or is empty, restore the verified backup. This is the required path for `CollapseDuplicateProductsByName`.
- Do not revert `PaymentIdempotencyStockException` while new order states exist.
- After a restore, rerun reconcile and ledger verification, then document the incident and the exact restore point.

## Run record

| Date | Environment | Migration(s) | Class | Rehearsal duration | Rows before / after | Backup ID | Result | Approver | Notes |
|---|---|---|---|---|---|---|---|---|---|
| YYYY-MM-DD | local / staging / production | timestamp-name | schema / data / destructive | | | | PASS / FAIL / ROLLED BACK | | |
