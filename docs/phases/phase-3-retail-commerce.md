# Phase 3 — Retail Commerce

**Goal:** the full retail sales path on the backend — orders, Paystack payments, customer-facing order tracking, and post-delivery reviews. First client UAT checkpoint at the end of this phase.

**Frontend:** this is the first phase with a customer-facing surface. Once the backend is stable, the **retail storefront design pass runs via the Google Stitch MCP** using the cinematic brief in `../project/15-Design-Specification.md` (mannequin scroll narrative → Shop the Look), then the Angular `apps/storefront` implementation follows.

## 3.1 Orders (backend)

Requirements: `../appendix-requirements/05-Retail.md`, `08-Orders-Payments.md`

- Entities: `Order` (customer_id, channel: retail | wholesale | custom | in_store, status, payment_status), `OrderItem` (variant_id, quantity, unit_price).
- One shared `/orders` resource for all channels, filtered by `channel` — no channel silos.
- Endpoints: `POST /orders`, `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/status`.
- A confirmed sale writes a `sale`-type `InventoryMovement` (decrement) — never a direct field edit.

## 3.2 Payments (backend)

- Entity: `Payment` (order_id, method: paystack | cash | pos | bank_transfer, amount, status, recorded_by, date).
- **No part-payments on ordinary orders** — full payment required before the order proceeds; enforced server-side.
- **Paystack integration** (server-side keys only; webhook handling with failure alerting). Currency from configuration (OQ #6).
- Offline payments (cash/POS/bank transfer) recorded manually into the same central record.
- Endpoint: `POST /orders/:id/payment`.

## 3.3 Order tracking (backend)

Requirements: `../appendix-requirements/09-Order-Tracking.md` (Temu-grade visibility — tracking only, not aesthetics)

- Entity: `OrderStatusEvent` (order_id, status, timestamp).
- Customer-facing states: **Order Received → Processing/Packaging → Shipped/Waybill → At Customer Location/Delivered → Returned (if applicable) → optional Review**.
- Endpoint: `GET /orders/:id/tracking`. Status changes emit in-platform notifications (SMS deferred to Phase 7).

## 3.4 Reviews (backend)

- Entity: `Review` (order_id, variant_id, customer_id, rating, comment, status: pending | published — moderation pending OQ #4).
- Post-delivery only: tied to delivered orders.
- Endpoints: `POST /orders/:id/review`, `GET /products/:id/reviews`, `PATCH /reviews/:id/status`.

## 3.5 Storefront frontend (after backend stable — Stitch MCP design pass)

- Run Stitch design brief (§15.5) → review against acceptance criteria (§15.6) → implement Angular `apps/storefront`.
- Screens: cinematic landing, browse/search, product detail (size/colour), cart, Paystack checkout, confirmation, tracking, review submission, return request form.
- Mobile-first, low-bandwidth resilient, `prefers-reduced-motion` fallback; animation never blocks shopping.

## Acceptance criteria

- [ ] Full retail purchase path passes integration tests: order → Paystack (sandbox) payment → confirmation → status updates → delivered → review.
- [ ] Unpaid or partially-paid ordinary orders cannot progress (server-side).
- [ ] Sale decrements stock via a logged movement (E2E-critical inventory-integrity scenario).
- [ ] Paystack webhook failure raises an alert.
- [ ] Storefront (when built) meets design acceptance criteria §15.6 and works on mobile.
- [ ] Client UAT checkpoint completed (YES/CHANGE/NOT SURE format).

## Depends on / blocks

- Depends on: Phases 0–1 (Phase 2 not strictly required but recommended for stocked goods).
- Blocks: Phase 4 (wholesale reuses the payment path) and Phase 5 (returns reference payments).
