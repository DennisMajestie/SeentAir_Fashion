# Phase 5 — Operations

**Goal:** the operational backbone — returns workflow with its time windows, the full accounting ledger and report suite, and GIGL logistics integration. Client UAT checkpoint at the end of this phase.

**Frontend:** returns queue, accounting/reports views and delivery management belong to the admin dashboard (built after Phase 6 backend, Stitch-designed). The storefront's return-request form ships with Phase 3's storefront if that build has started.

## 5.1 Returns workflow (backend)

Requirements: `../appendix-requirements/10-Returns.md`

- Entity: `ReturnRequest` (order_id, variant_id, reason, requested_at, return_deadline, tracking_number, resolution, restocked bool, damaged bool).
- **Windows:** request within **12 hours** of receipt (enforced server-side — reject late requests, pending exact rule confirmation); physical return completed within **24 hours** of the request.
- Eligibility: all products **except custom/special orders**.
- Return travels via logistics company; tracking/parcel ID recorded.
- Disposition through the inventory ledger: restocked → `return` movement in; damaged → flagged, no restock.
- Endpoints: `POST /returns`, `GET /returns`, `PATCH /returns/:id/resolve`.

## 5.2 Accounting (backend)

Requirements: `../appendix-requirements/12-Accounting.md`

- Entities: `LedgerEntry` (type: sale | expense | purchase | payroll | tax, amount, category, date, reference_id), `FinancialReport` (type, period, generated_data).
- Replaces manual accounting entirely: sales, expenses, purchases, supplier payments in aggregate, production costs, COGS (from Phase 2 cost data), payroll, taxes, profit, loss.
- **Flexible report suite** — income, expenditure, investment, loss, profit — build a reporting module, not a fixed small set. Heavy generation goes through the job queue.
- **No customer credit** — nothing to build for customer debt.
- Endpoints: `GET /accounting/ledger`, `GET /accounting/reports/:type`.
- Fund movements are approval-gated (Phase 0 service) and audited.

## 5.3 Logistics (backend)

Requirements: `../appendix-requirements/14-Logistics.md`

- Entities: `DeliveryLeg` (order_id, carrier, leg_number, status, tracking_ref) — multi-leg deliveries supported; `DeliveryPricing` (weight, destination/zone, cost).
- Delivery price = **weight + location**.
- **GIGL integration first**, built as a **pluggable carrier adapter** so future carriers slot in without frontend changes.
- Methods to represent: dispatch riders (local), logistics companies, transport companies, interstate, international.
- Endpoints: `POST /deliveries`, `PATCH /deliveries/:id/status`, `GET /deliveries/:id/tracking`.
- Delivery status changes drive order-tracking events (Phase 3).

## Acceptance criteria

- [ ] Return requested within 12h accepted; after 12h rejected — integration-tested.
- [ ] Custom orders cannot be returned.
- [ ] Restock vs damaged dispositions both flow through logged inventory movements.
- [ ] Sales/purchases/production costs generate ledger entries; all five report types produce output.
- [ ] GIGL adapter creates a delivery and reflects status/tracking updates; a second mock carrier can be swapped in behind the adapter interface.
- [ ] Client UAT checkpoint completed.

## Depends on / blocks

- Depends on: Phase 3 (returns/accounting reference orders & payments), Phase 2 (COGS inputs).
- Blocks: Phase 6 analytics (profit/loss data).
