# Phase 4 — Wholesale

**Goal:** wholesale accounts, tiered pricing, MOQ enforcement, bulk ordering and invoice history — reusing the shared order/payment path from Phase 3.

**Frontend:** the authenticated **wholesale portal** follows the backend; designed via Stitch MCP but task-oriented — it should **not** inherit the cinematic storefront treatment (see `../project/15-Design-Specification.md` §15.4).

## 4.1 Wholesale accounts & pricing (backend)

Requirements: `../appendix-requirements/06-Wholesale.md`

- Entities: `WholesaleAccount` (user_id, tier_id, approved_moq_status), `PriceTier` (name, rule_description — **criteria pending OQ #2**; build tier assignment as manual/admin-set until resolved).
- **MOQ = 20 units** — eligibility and per-order enforcement server-side.
- Multiple price tiers supported; tiered price resolution when a wholesale account queries the catalogue.
- Endpoints: `GET /wholesale/pricing`, `POST /wholesale/accounts`, `GET /wholesale/accounts/:id`.

## 4.2 Bulk ordering (backend)

- Bulk orders through the shared `/orders` resource with `channel=wholesale`; same full-payment-upfront rule; same inventory-movement mechanics.
- Reorder capability (re-create a previous order).
- Order & invoice/payment history per account.
- Wholesale reviews (same review mechanism as retail — client added it for both).

## 4.3 Wholesale portal frontend (after backend stable — Stitch MCP design pass)

- Screens: tiered-price catalogue, bulk order form / reorder shortcut, order & invoice history, order tracking. (Custom design submission form is post-MVP — Phase 7.)
- Optimize for task completion and clarity, not cinematic styling.

## Acceptance criteria

- [ ] Order below MOQ from a wholesale account is rejected server-side (E2E-critical scenario).
- [ ] Tiered pricing correctly applied per account tier; tier assignment is admin-controlled pending OQ #2.
- [ ] Invoice/payment history retrievable per account.
- [ ] Reorder reproduces a prior order at current tier pricing.

## Depends on / blocks

- Depends on: Phase 3 (shared order/payment path).
- Blocks: nothing hard; wholesale analytics land in Phase 6.
