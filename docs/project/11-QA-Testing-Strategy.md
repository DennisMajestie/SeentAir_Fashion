# 11. QA & Testing Strategy

## Testing levels

1. **Unit tests** — business logic in isolation (e.g. production cost calculation, MOQ eligibility check, profit-distribution math).
2. **Integration tests** — API endpoints against a real test database, including permission enforcement per `05-Role-Permission-Matrix.md`.
3. **End-to-end (E2E) tests** — critical user journeys through the UI (see below; applies once frontends exist).
4. **User Acceptance Testing (UAT)** — with the client, before each major release, mirroring the same YES/CHANGE/NOT SURE review pattern already used successfully during requirements sign-off.

## Critical scenarios requiring E2E coverage

- **Full retail purchase:** browse → cart → checkout → Paystack payment → order confirmation → status updates → delivery → review.
- **Wholesale bulk order:** MOQ enforcement, tiered pricing, invoice generation.
- **Inventory integrity:** a sale correctly decrements available stock via a logged movement, never a direct field edit; a return correctly restocks (or flags as damaged) via the same mechanism.
- **Production → inventory flow:** completing a production batch correctly increases finished-goods inventory.
- **Approval gating:** attempting a price change, fund movement, or purchase without approval must be rejected by the API, not just hidden in the UI.
- **Audit trail completeness:** every stock/fund-affecting action produces a corresponding audit log entry — test this as a cross-cutting assertion, not per-feature.
- **Returns window enforcement:** request logged within 12 hours of delivery is accepted; after 12 hours is rejected (pending exact enforcement rule confirmation).
- **Role boundary:** Partner/Investor role cannot reach retail/wholesale customer-facing endpoints or raw customer PII.

> During the backend-first phases, the scenarios above are covered at the **API integration-test level**; E2E UI coverage is added when the corresponding Angular frontend ships.

## Test data & environments

- Staging should use anonymized or synthetic data — no real customer PII copied from production once real data exists.
- Paystack test/sandbox keys in all non-production environments.

## UAT process (recommended)

Reuse the same client review format that worked for requirements sign-off: for each release candidate, provide the client a short list of what was built, ask for YES / CHANGE / NOT SURE per feature, and log her answers the same way `../appendix-requirements/` was produced. This keeps her engagement pattern consistent across the whole project.

## Regression protection

Any bug found in production involving inventory, payments, or the audit trail must get a regression test added before the fix is merged — these are the domains where the client has been most explicit about correctness (movement history, no unauthorized fund/stock changes).
