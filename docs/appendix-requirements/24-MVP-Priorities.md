# 24. MVP Priorities

Based on the client's feature-priority table (Section 28 of the review document), classified as follows:

## Must Have Now

- Manufacturing
- Production tracking
- Raw materials
- Inventory
- Product catalogue
- Retail e-commerce
- Wholesale
- Payments
- Order tracking
- Returns
- Accounting
- Logistics
- Marketing
- Analytics
- Staff management
- Approvals/audit trail
- WhatsApp/live chat
- POS/physical sales *(see contradiction note below)*

## Important Later

- Custom/pre-order requests
- Partner/investor portal
- SMS/notifications

## ⚠ Contradiction to resolve before sprint planning

The feature-priority table marks **"POS/physical sales" as Must Have Now**, but the client's direct confirmation on Section 24 (POS / Mall Sales System) marked it **"LATER."** Recommend treating POS as **Later** for MVP scope (deferred spec, per her explicit written answer), and getting written confirmation from her which one is correct before committing sprint capacity either way. See `25-Remaining-Clarification-Questions.md`.

## Suggested MVP build order (proposed, pending client sign-off)

1. Core data foundation: Products, Inventory, Users/Roles
2. Manufacturing & Production tracking + Raw materials
3. Retail e-commerce + Payments (Paystack) + Order tracking
4. Wholesale
5. Accounting
6. Returns + Approvals/audit trail
7. Logistics
8. Analytics dashboard
9. Marketing tools
10. WhatsApp/live chat
11. (Deferred) Custom/pre-order, Partner/investor portal, SMS, POS

> The engineering delivery sequence derived from this is in `../phases/` (Phases 0–7, backend-first).
