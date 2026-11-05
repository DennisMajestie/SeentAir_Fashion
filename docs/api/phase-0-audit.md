# Phase 0 foundation audit

This is a repository-level audit, not a deployment certification. Runtime acceptance still requires the disposable-database procedure in [the database test runbook](../runbooks/database-test.md) and confirmation of the deployment environment.

## Evidence and status

| Phase 0 area | Evidence in the repository | Status / next action |
|---|---|---|
| API and PostgreSQL foundation | NestJS API, shared DB connection resolver, TypeORM CLI data source, `synchronize: false`, timestamped migrations | Implemented; verify migrations on an empty disposable database with `test:db`. |
| Seed lifecycle and local reference data | Base, catalogue, and shipping seeds; explicit seed opt-in, local-host guard, required local seed password, and cleanup in `finally` | Implemented; `test:db` runs each seed twice and compares public table counts. |
| Auth, roles, permissions, and audit | Auth/users/roles modules, permission matrix, audit interceptor and entities, access-control tests | Source and unit-test coverage exist; CI currently runs the unit suite but does not publish a separate DB-backed RBAC/audit acceptance run. |
| CI quality gates | `.github/workflows/ci.yml` runs install, build, unit tests, and migrations against PostgreSQL 16 | Does not currently run lint or the repeated-seed/database-tool workflow. A dedicated CI job is proposed in the database test runbook, not enabled here. |
| Staging/production deployment | Deployment guidance exists in the operations and migration runbooks | No hosting/deploy workflow is committed; verify the real start/migration commands with the platform owner. |
| Phase 0 open questions | `docs/project/03-Open-Questions.md` tracks business decisions | Confirm the owner-approved resolution or deferral is recorded for the required Phase 0 items before treating the phase as signed off. |

## Database verification output contracts

- `db:reconcile`: public table counts; order/payment aggregates; order-item and inventory summaries; foreign-key orphan counts; duplicate-key summaries. Duplicate user-email and payment-reference values are hashed.
- `db:hygiene`: test-user and privileged-role counts, category spelling variants, shipping-state summaries, guest-email collision counts, image/stock gaps, stale unpaid-order counts, and refresh-token counts. It does not emit raw email addresses or phone numbers.
- `db:verify-ledgers`: inventory and audit chain totals, valid/broken counts, head hash, and first broken row metadata when applicable.

Use the JSON output emitted by `test:db` as the verification evidence for the dedicated synthetic database. Do not commit live or unmasked database output; the current local development database is not a disposable target.

## Complete migration inventory

The 41 migration files currently in `services/api/src/database/migrations` classify as 33 schema-only, 5 data-changing, and 3 destructive. Schema-only files:

- `1789507522182-InitialSchema.ts`, `1789508080687-Phase1CoreData.ts`, `1789508617431-Phase2Manufacturing.ts`, `1789509044710-Phase3RetailCommerce.ts`, `1789509756279-Phase4Wholesale.ts`, `1789510425553-Phase5Operations.ts`, `1789510970493-Phase6GovernanceInsight.ts`, `1789513494771-Phase7Engagement.ts`, `1789516423660-Phase8SecurityHardening.ts`
- `1789518774867-PasswordReset.ts`, `1789519737452-TwoFactorAuth.ts`, `1789521000000-PaymentIdempotencyStockException.ts`, `1789522000000-DeliveryNote.ts`, `1789523000000-GuestCheckout.ts`, `1789524000000-OrderAccessTokens.ts`, `1789526000000-WholesaleApplicationDetails.ts`, `1789527000000-ProductIsBestseller.ts`, `1789528000000-ProductSale.ts`, `1789529000000-OrderDeliveryPreference.ts`
- `1789540000000-ReviewCustomerIdNullable.ts`, `1789550000000-ProductPrimaryImage.ts`, `1789590000000-CreateWishlistItems.ts`, `1789591000000-AddCustomersModuleEnum.ts`, `1789592000000-CreateCustomers.ts`, `1789610000000-CreateCheckoutShipping.ts`, `1789620000000-CreateCoupons.ts`, `1789630000000-AddCouponsEnabled.ts`, `1789640000000-CreateShippingQuotes.ts`, `1789650000000-AddReservedCustomerCouponStatus.ts`
- `1789710000000-AddActorToOrderStatusEvents.ts`, `1789720000000-CreateInventoryStockCounts.ts`, `1789730000000-CreateHelpTickets.ts`, `1789740000000-TrackConfirmedProductionCostComponents.ts`

Data-changing:

- `1789520000000-Phase9AdminGaps.ts` — backfills audit and inventory hash chains and installs hash triggers.
- `1789525000000-EmailVerification.ts` — marks existing users as email-verified.
- `1789530000000-ProductCategories.ts` — backfills category rows from product category strings.
- `1789600000000-CreatePlatformSettings.ts` — inserts the platform settings row.
- `1789700000000-AddOrderNumberToOrders.ts` — backfills order numbers.

Destructive:

- `1789560000000-CollapseDuplicateProducts.ts` — updates and deletes duplicate product rows; rollback does not reconstruct the original records.
- `1789570000000-CollapseRemainingDuplicateProducts.ts` — updates and deletes the remaining duplicate product row.
- `1789580000000-CollapseDuplicateProductsByName.ts` — repoints variants and deletes duplicate products; `down` is empty, so recovery requires a backup restore.

`1789521000000-PaymentIdempotencyStockException.ts` rebuilds enums, and `1789591000000-AddCustomersModuleEnum.ts` / `1789650000000-AddReservedCustomerCouponStatus.ts` have constrained or non-restoring `down` behavior; see the migration runbook before rollback.

## Migration and deployment evidence

- Both the TypeORM CLI data source and the Nest TypeORM configuration set `synchronize: false`; no `migrationsRun: true` or boot-time migration is configured in the API module.
- API scripts are `migration:run` and `migration:revert`; root `api:migrate` delegates to `migration:run`. Root `npm start` explicitly runs the migration before starting the API, while the API workspace `npm start` only starts the compiled server.
- `.github/workflows/ci.yml` starts PostgreSQL, runs build, tests, and `api:migrate`; it does not run lint or `test:db`.
- The root start command is capable of running migrations in any environment that invokes it. No committed host deployment configuration establishes whether production uses that command, so the actual non-local deployment path remains unverified.

## Remaining acceptance checks

1. Run `test:db` on an explicitly disposable local database and retain only its sanitized pass/fail/count output.
2. Run the existing full build and unit-test commands; run the API lint command and record any existing failures separately from changed-file lint.
3. Confirm deployment behavior and the Phase 0 business-question decisions with their owners before marking the phase fully accepted.
