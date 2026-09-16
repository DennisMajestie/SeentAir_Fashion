# Phase 7 — Engagement (Post-MVP, "Important Later")

**Goal:** the deferred modules, scheduled after MVP launch. Order within this phase is flexible; each item is independent unless noted.

## 7.1 WhatsApp / Live chat

Requirements: `../appendix-requirements/20-Communication.md`, `21-Integrations.md`

- In-platform messages + WhatsApp + live chat, centered on orders and delivery.
- Provider adapters server-side (Termii or Twilio TBD — confirm for Nigerian delivery reliability).

## 7.2 SMS notifications

- SMS specifically for **delivery/location updates** (client-confirmed use case).
- Sent via the job queue; provider behind an adapter.

## 7.3 Custom / Pre-order requests

Requirements: `../appendix-requirements/07-Custom-Pre-Order.md`

- Entities: `CustomOrderRequest` (sizes, colours, quantity, location, fabric_quality, description, desired_date, status), `Quotation` (manual amount, approved_by), `SampleApproval`.
- Flow: submit → business review → feasibility/cost → quotation → buyer accepts → payment → confirmation → **sample production → buyer approves sample (hard gate)** → full production → fulfilment → delivery.
- Design approval authority: **Manager**. Quotation: manual entry (fabric, quantity, style-based) — no automated pricing formula.
- Custom orders are excluded from returns. Sample-cost billing pending OQ #3.
- Endpoints: `POST /custom-orders`, `GET /custom-orders/:id`, `POST /custom-orders/:id/quotation`, `POST /custom-orders/:id/sample-approval`.
- Wholesale portal gains the custom design submission form.

## 7.4 Partner / Investor portal

Requirements: `../appendix-requirements/17-Partners-Investors.md` (fully specified — OQ #5 asks whether to pull it forward)

- Entities: `Partner` (equity_percentage, invested_amount), `ProfitDistribution` (period, total_profit, reinvestment, dividend_pool, reserve, per_partner_breakdown).
- **Profit split: 40% reinvestment / 40% dividends / 20% reserve. 1,000,000 shares: 60% founder/CEO, 40% partners, paid by equity %.** Quarterly.
- Dashboard flow: Login → Business Overview → Investment Info → Performance → Inventory Visibility → Accounts/Reports → Profit Sharing.
- **Hard boundary:** Partner/Investor role never reaches customer-facing surfaces or raw customer PII.
- Endpoints: `GET /partners/:id/dashboard`, `GET /partners/:id/profit-distributions`.
- Frontend: read-mostly portal (Stitch design pass, restrained/professional).

## 7.5 POS / Mall sales system (pending OQ #1 resolution)

Requirements: `../appendix-requirements/22-POS-Mall-Sales-System.md`

- Connects to: inventory, products, orders (`channel=in_store`), payments, customer info, accounting, analytics — all through the same Core API.
- Exact screens/hardware **intentionally deferred to a dedicated planning stage** regardless of the priority-contradiction outcome. Do not spec now.

## Acceptance criteria (per item shipped)

- [ ] Custom order full production cannot start before buyer sample approval (server-side gate).
- [ ] Profit-distribution math unit-tested against the 40/40/20 + equity model.
- [ ] Partner role blocked from customer-facing endpoints and PII (E2E-critical role-boundary scenario).
- [ ] SMS/WhatsApp delivered via queue with provider failure handling.

## Depends on

- MVP complete (Phases 0–6). Partner portal additionally depends on Phase 5 accounting (profit data).
