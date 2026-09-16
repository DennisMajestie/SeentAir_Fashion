# 06. UX/UI Requirements

> **Note (phased approach):** frontend implementation is deferred until the backend phases are complete. UI design will be driven via the **Google Stitch MCP** using the brief in `15-Design-Specification.md`. This document remains the requirements baseline every design must satisfy.

## Guiding principle

> "Customers can shop without struggling, while the owner can see what is happening in the business without needing to be physically present."

Every screen should be evaluated against this: does it reduce friction for a customer, or increase visibility for the owner? If it does neither, question its priority.

## Reference point: Temu (for order tracking only)

The client referenced Temu specifically for the **order-tracking experience** — clear, real-time visibility into where an order is — not the overall Temu shopping experience or aesthetic. Don't over-index on Temu-style discounts/gamification unless separately requested.

## Design principles

1. **Mobile-first.** Customers currently interact via WhatsApp and social media; the retail and wholesale experiences must work comfortably on a phone.
2. **Low-friction checkout.** Full payment upfront (no part-payments), so checkout should be a short, clear, single pass — not a multi-step form.
3. **Status always visible.** Order status (Received → Processing → Shipped → Delivered → Returned) should be visible without the customer needing to ask.
4. **Role-appropriate dashboards.** Internal admin screens should surface only what that role needs (see `05-Role-Permission-Matrix.md`) — a warehouse worker's screen should look different from an accountant's.
5. **One-glance owner dashboard.** The Business Owner/Admin's home screen should answer, at a glance: sales today, profit/loss, low-stock alerts, production status, and anything pending approval.

## Key screen inventory (MVP)

### Retail Storefront
- Product discovery/browse & search
- Product detail (variant selection: size/colour)
- Cart & checkout (Paystack)
- Order confirmation
- Order tracking page
- Post-delivery review submission
- Return request form

### Wholesale Portal
- Wholesale product catalogue with tiered pricing
- Bulk order form / reorder shortcut
- Order & invoice history
- Order tracking
- (Post-MVP) Custom design submission form

### Admin / Operations Dashboard
- Owner home dashboard (sales, profit/loss, alerts, approvals pending)
- Production board (batches by stage — Kanban-style fits well here)
- Raw material inventory & low-stock alerts
- Product catalogue management
- Order management (all channels, filterable)
- Returns queue
- Accounting/reports view
- Staff & role management
- Approval queue (pending purchases, price changes, fund movements)
- Audit log viewer

### Deferred (Post-MVP)
- Partner/Investor dashboard (per confirmed flow in `../appendix-requirements/17-Partners-Investors.md`)
- Custom/pre-order management screens
- POS/mall interface

## Notification touchpoints

- Order status changes → in-platform + SMS (delivery-specific) / WhatsApp (post-MVP for SMS specifically, per priority table)
- Return request approved/rejected → in-platform + customer's preferred channel
- Pending approval → in-platform alert to Management/Owner

## Accessibility & localization

- Currency formatting pending confirmation (see `03-Open-Questions.md` #6) — build currency as a configurable value, not hardcoded.
- Support common Nigerian mobile network conditions: design for low-bandwidth resilience (compressed images, lightweight pages).
