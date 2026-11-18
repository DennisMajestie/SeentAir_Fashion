# 26. Purchasing "0 records" — root cause

**Checked:** 2026-11-19 against the production database (read-only).

The purchasing screen was correct: there is no purchase data in production to list.

| Table | Rows |
| --- | --- |
| `raw_materials` | 0 |
| `material_purchases` | 0 |
| `inventory_movements` (`item_type='material'`) | 0 |
| `products` | 19 |
| `product_variants` | 59 |
| `orders` | 13 |
| `inventory_movements` (all) | 62 (variant production/sale/adjustment only) |

All migrations are applied, including `AddSupportWhatsappUrl` and the loyalty/payroll
migrations, so this is not a schema or API failure. The admin feed and mapping were
verified locally against a seeded database with 4 purchase rows — those rows appeared
correctly with totals and material names.

## Cause

Raw materials were never created in production, so no purchases or material stock
movements could be recorded. The "0 records / 0 total spent" display was truthful;
there was no data-entry path followed for materials during initial setup.

## Remediation (needs owner sign-off)

1. Collect the real purchase records (invoices/receipts: material, quantity, cost,
   supplier, purchase date) from the owner.
2. Create the `raw_materials` rows first, then the `material_purchases` rows and the
   matching append-only `inventory_movements` (`movement_type='purchase'`) — never
   write stock quantities directly.
3. Reconcile dashboard/analytics spend with the purchases list after import, and run
   `npm run db:reconcile` / `npm run db:verify-ledgers`.
4. Do not invent figures: these are financial records. The admin now surfaces an
   explicit error if the purchase feed ever fails, so a future 0 will not silently
   hide a broken API.
