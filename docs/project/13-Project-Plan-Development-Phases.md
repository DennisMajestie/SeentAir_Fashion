# 13. Project Plan / Development Phases

This plan sequences MVP delivery based on `../appendix-requirements/24-MVP-Priorities.md` and dependency order (you can't track inventory before you have products; you can't take payments before you have orders, etc.).

> **Detailed per-phase briefs live in `../phases/`** — one file per phase, backend deliverables first. This file is the summary and dependency map.

## Delivery strategy

- **Backend first:** each phase delivers tested NestJS API + PostgreSQL functionality before its UI.
- **Frontend follows via Stitch:** Angular frontends are designed through the Google Stitch MCP (brief in `15-Design-Specification.md`) and implemented once the underlying backend phase is stable.

## Phase summary

| Phase | Name | Focus | Detail |
|---|---|---|---|
| 0 | Foundation (Sprint 0) | Open questions, repo/CI, environments, auth/users/roles/permissions, audit-log foundation | `../phases/phase-0-foundation.md` |
| 1 | Core Data Foundation | Product catalogue & variants, raw materials, inventory movement ledger | `../phases/phase-1-core-data.md` |
| 2 | Manufacturing | Production batches, stage tracking, cost tracking, QC rejection handling | `../phases/phase-2-manufacturing.md` |
| 3 | Retail Commerce | Orders, Paystack, order tracking, reviews; storefront frontend | `../phases/phase-3-retail-commerce.md` |
| 4 | Wholesale | Wholesale accounts, tiered pricing, bulk ordering, invoices; portal frontend | `../phases/phase-4-wholesale.md` |
| 5 | Operations | Returns workflow, accounting ledger & reports, GIGL logistics | `../phases/phase-5-operations.md` |
| 6 | Governance & Insight | Approvals workflow, audit trail UI, analytics dashboard, marketing tools | `../phases/phase-6-governance-insight.md` |
| 7 | Engagement (Post-MVP) | WhatsApp/live chat, SMS, custom orders, partner portal, POS | `../phases/phase-7-engagement-post-mvp.md` |

## Cadence recommendation

2-week sprints, with a client review/UAT checkpoint (per `11-QA-Testing-Strategy.md`) at the end of Phases 3, 5, and 6 at minimum — these are the points where the client will most want to see and confirm real functionality.

## Dependency notes

- **Phase 1 blocks almost everything else** — prioritize getting inventory ledger design right before building on top of it.
- Phase 3 (Payments) blocks Phase 4 (Wholesale uses the same payment path) and Phase 5 (Returns reference payments).
- Phase 6 (Approvals/Audit) should have its **foundation** built in Phase 0, even though full UI comes later — retrofitting audit logging after the fact is much more error-prone.
