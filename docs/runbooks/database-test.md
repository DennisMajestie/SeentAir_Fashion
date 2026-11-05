# Disposable database integration runbook

`npm run test:db --workspace services/api` drops and recreates the `public` schema, applies every TypeORM migration, runs the base/catalogue/shipping seeds twice, checks that public table row counts did not change on the second pass, reports role and permission totals, users per role, product and variant totals, and shipping zone and rate totals, runs the full API Jest suite with all four database gates enabled, and executes the read-only reconcile, hygiene, and ledger-verification tools.

## Safety requirements

- Use a **dedicated local PostgreSQL database** whose name ends in `_test` (for example, `seentair_ci_test`). Never use `seentair_dev`, staging, production, or a restored customer database.
- Put the connection variables in the ignored `services/api/.env.test` file. Do not commit credentials or put them in command arguments.
- Set `DB_DISPOSABLE=true` and `DB_ALLOW_RESET=true` in that file. Both are explicit acknowledgements that the named database can be destroyed.
- Set `DOTENV_CONFIG_PATH=.env.test` in the shell before invoking the command. The runner and all child commands use this file.
- `DATABASE_URL` is rejected. The effective `DB_HOST` must be `localhost`, `127.0.0.1`, or `::1`.
- The runner also checks `current_database()` against `DB_NAME` before dropping the schema. It exits on any failed migration, seed, test, or verification tool.

Example ignored `services/api/.env.test` configuration (fill values locally; do not copy credentials into documentation):

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_local_postgres_role
DB_PASSWORD=
DB_NAME=seentair_ci_test
DB_DISPOSABLE=true
DB_ALLOW_RESET=true
```

In PowerShell, from the repository root:

```powershell
$env:DOTENV_CONFIG_PATH = (Resolve-Path 'services/api/.env.test').Path
npm run test:db --workspace services/api
```

Four DB integration suites are intentionally skipped in ordinary `npm test` runs. `test:db` sets `DB_SEED_TEST`, `DB_RECONCILE_TEST`, `DB_HYGIENE_TEST`, and `DB_VERIFY_LEDGERS_TEST` only after the target checks pass. The base-seed integration test also independently refuses to run unless the process is configured for a local host, an explicit `*_test` database, and no `DATABASE_URL`.

## CI proposal (not enabled by this runbook)

Add a separate CI job using a fresh PostgreSQL 16 service and a database named `seentair_ci_test`. Provide `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_DISPOSABLE=true`, and `DB_ALLOW_RESET=true` as job environment variables, then run:

```yaml
- name: Exercise migrations, repeated seeds, and DB tools
  run: npm run test:db --workspace services/api
```

Keep the existing fast unit-test job. Do not reuse its schema if its tests are run concurrently.

## Report handling

The runner prints table names and row counts, then emits each verification tool's JSON report to stdout. `db:hygiene` is count-oriented and its DB-gated test rejects email/phone-shaped strings and personal-data keys for names, emails, phones, addresses, contacts, and guest identity. `db:reconcile` includes structural counts, aggregates, and hashes for duplicate user/payment keys; `db:verify-ledgers` reports chain status and the first broken row identifier when a chain fails. Do not save or share reports from a non-synthetic database without review and masking.
