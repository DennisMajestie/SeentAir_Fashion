# 27. Local API + smoke-test runbook

Repeatable local verification for the core API (no production credentials needed).
All commands run from `services/api` unless stated otherwise. Never commit `.env`.

## 1. Prerequisites

- Node 22+ and a local PostgreSQL on `localhost:5432`.
- `npm install` in `services/api` (and in each app under `apps/` for frontend checks).
- A `.env` with at least: `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
  `DB_NAME`, `JWT_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `SEED_USER_PASSWORD`
  (>= 12 chars), `CURRENCY_CODE`, `CURRENCY_SYMBOL`, `LOCALE`.
  `DB_NAME` should be a disposable local database (e.g. `seentair_dev` / `seentair_test`).

## 2. Prepare the database (once, then after code updates)

```bash
$env:NODE_ENV = 'development'
$env:ALLOW_SEED = 'true'
npm run migration:run      # required: a stale DB gives 500s like "column ... does not exist"
npm run seed               # seeded logins: owner@seentair.test, customer@seentair.test
npm run seed:catalogue     # products, variants, stock movements
```

The seed password for **all** seeded users is the value of `SEED_USER_PASSWORD` in `.env`.

If a stale schema error appears (e.g. `support_whatsapp_url`), re-run `npm run migration:run`
before debugging application code.

## 3. Find a stocked variant and a customer id

```sql
SELECT v.id, v.sku, COALESCE(SUM(m.quantity_delta), 0)::int AS stock
FROM product_variants v
LEFT JOIN inventory_movements m
       ON m.item_type = 'variant' AND m.item_id = v.id
GROUP BY v.id, v.sku
HAVING COALESCE(SUM(m.quantity_delta), 0) >= 2
ORDER BY stock DESC
LIMIT 1;

SELECT id, email FROM users WHERE email = 'customer@seentair.test';
```

A made-to-order variant has no stock and will fail the order gate — pick one with `stock >= 2`.

## 4. Start the API

```bash
npm run build
npm start                  # listens on http://localhost:3000/api/v1
```

Keep this terminal open; stop the process when done.

## 5. Run the smoke test

PowerShell (reads the password from `.env` without echoing it):

```powershell
$seedPass = ((Get-Content .env | Where-Object { $_ -match '^SEED_USER_PASSWORD=' }) -split '=', 2)[1]
$env:SMOKE_API_BASE            = 'http://localhost:3000/api/v1'
$env:SMOKE_ADMIN_EMAIL         = 'owner@seentair.test'
$env:SMOKE_ADMIN_PASSWORD      = $seedPass
$env:SMOKE_VARIANT_ID          = '<stocked variant uuid from step 3>'
$env:SMOKE_CUSTOMER_ID         = '<customer uuid from step 3>'
$env:SMOKE_CUSTOMER_EMAIL      = 'customer@seentair.test'
$env:SMOKE_CUSTOMER_PASSWORD   = $seedPass
# optional: $env:SMOKE_RUN_WHOLESALE = 'true'   # creates a throwaway buyer account
npm run test:smoke
```

Expected: `SMOKE OK`. The wholesale line prints `SKIP ...` unless `SMOKE_RUN_WHOLESALE=true`.
With no `SMOKE_*` variables at all the script prints `SKIP` and exits 0, so it is safe in CI.

The retail leg covers: create order → offline payment → order `payment_status=paid` →
statuses processing/shipped/delivered → stock movement written → customer return request →
staff resolution → order `returned` and a second ledger movement restoring stock.

## 6. Unit checks (no server needed)

```bash
npx jest --silent                              # API unit suites
npm run lint
npx tsc --noEmit -p tsconfig.build.json
# in each of apps/storefront, apps/admin-dashboard, apps/wholesale-portal:
npx ng test --watch=false --reporters=dots
npx ng build
```

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `HTTP 500 ... column X does not exist` | Run `npm run migration:run`. |
| `Insufficient stock for SKU` | Choose another variant from step 3. |
| `shippingAddress is required` / order has no customer | Set `SMOKE_CUSTOMER_ID`; the script already sends an address. |
| Return request rejects | Use the customer login from step 5 and ensure the order was created with that customer id. |
| `401` on login | Check `SEED_USER_PASSWORD`; seeded accounts never use 2FA. |
| External DB URL was ever pasted in chat | Rotate that password immediately; never reuse it for local tests. |
