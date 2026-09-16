# Phase 6 — Governance & Insight

**Goal:** surface the governance foundations built in Phase 0 (approvals workflow, audit trail) as full features, plus the analytics dashboard and marketing tools. Final MVP UAT checkpoint. After this phase's backend, the **admin dashboard frontend** is designed (Stitch MCP, task-oriented) and built.

## 6.1 Approvals workflow (backend completion)

Requirements: `../appendix-requirements/19-Approvals-Audit-Trail.md`

- Complete the Phase 0 `ApprovalRequest` service into a full workflow: request → pending queue → approve/reject by Management or Business Owner/Admin → action unblocked/blocked.
- Approval required for: **purchasing, production, price changes, moving funds**, and any material/product removal, transfer, give-away, or disposal — unauthorized versions must be **impossible, not just logged**.
- Regular staff cannot self-approve.
- Endpoints: `GET /approvals/pending`, `POST /approvals/:id/decide`.

## 6.2 Audit trail (reporting layer)

- Audit writing has existed since Phase 0; this phase adds the query/reporting surface: `GET /audit-log` (filter by actor, action, module, date).
- Cross-cutting test: every stock/fund-affecting action has a corresponding entry.

## 6.3 Analytics dashboard (backend)

Requirements: `../appendix-requirements/16-Analytics.md`

- Aggregation/reporting layer over existing entities — no new core entities.
- Data points: total sales, revenue, profit/loss, best sellers, slow movers, low stock, production status, inventory status, product profitability, sales by channel, marketing source performance, partner info (where permitted).
- Endpoints: `GET /analytics/dashboard`, `GET /analytics/best-sellers`, `GET /analytics/low-stock`.
- Owner "one-glance" dashboard data: sales today, profit/loss, low-stock alerts, production status, pending approvals.

## 6.4 Marketing tools (backend)

Requirements: `../appendix-requirements/15-Marketing.md`

- Entities: `Campaign` (name, type, start/end, linked promotions), sale-channel attribution on orders.
- Capabilities: campaigns, promotions, channel/source attribution per sale, customer recommendations, loyalty, product visibility/boosting, performance analysis.

## 6.5 Admin dashboard frontend (after backend — Stitch MCP design pass, task-oriented)

Screens per `../project/06-UX-UI-Requirements.md`: owner home dashboard, production Kanban board, raw-material inventory + alerts, catalogue management, order management (all channels, filterable), returns queue, accounting/reports, staff & role management, approval queue, audit log viewer. Visually distinct from the cinematic storefront.

## Acceptance criteria

- [ ] Price change/fund movement/purchase without approval rejected by the API (E2E-critical).
- [ ] Approval queue lists pending items; decisions are audited and gate the underlying action.
- [ ] Audit log queryable with filters; cross-cutting completeness assertion passes.
- [ ] Dashboard endpoints return correct aggregates against seeded data.
- [ ] Every order carries a sales-channel attribution.
- [ ] Client UAT checkpoint completed.

## Depends on / blocks

- Depends on: Phases 0–5 (aggregates need real data flows).
- Blocks: MVP launch; Phase 7 items layer on top.
