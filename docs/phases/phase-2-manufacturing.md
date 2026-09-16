# Phase 2 — Manufacturing

**Goal:** production batches through their stages, cost tracking, and QC rejection handling — all feeding the inventory ledger.

**Frontend:** none yet. The production Kanban board ships with the admin dashboard (Stitch-designed, later).

## 2.1 Production batches (backend)

Requirements: `../appendix-requirements/02-Manufacturing-Production.md`

- Entity: `ProductionBatch` (product_id, quantity, stage, planned_date, completed_date).
- Stages: **Production Planned → Cutting → Sewing → Finishing → Quality Control → Completed** — store as configurable/customizable stage list (client wants terms adjustable to real factory-floor language).
- Endpoints: `GET/POST /production-batches`, `PATCH /production-batches/:id/stage`.
- **Production start requires approval** (Phase 0 approval service) — approval-gated at the API layer.
- Batch completion writes a `production`-type `InventoryMovement` increasing finished goods (E2E-critical scenario).
- Material consumption per batch via `MaterialUsage` (Phase 1) decrements raw-material stock through the ledger.

## 2.2 Production cost tracking (backend)

- Entity: `ProductionCost` (batch_id, material_cost, sewing_cost, branding_cost, packaging_cost).
- Production cost = raw material + sewing + branding + packaging — recordable per batch (or estimated per product) so real cost is visible to management.
- Endpoint: `POST /production-batches/:id/cost`.
- Feeds COGS in Phase 5 accounting.

## 2.3 QC rejection handling (backend)

- Entity: `QCRejection` (batch_id, reason **required**, disposition: `burned` | `repaired_restocked`, date).
- Reason code drives disposition: defective/bad product → **burned** (permanent write-off movement, type `damage`); simple factory error → **repaired & restocked** (movement back into stock).
- Endpoint: `POST /production-batches/:id/qc-rejection`.
- Both paths write inventory movements + audit entries; disposition tracked for reporting.

## Acceptance criteria

- [ ] Batch lifecycle walks through all stages; stage list is configurable.
- [ ] Starting production without an approved `ApprovalRequest` is rejected server-side.
- [ ] Completing a batch increases finished-goods inventory via a logged movement (integration test).
- [ ] QC rejection without a reason is rejected; `burned` permanently removes stock, `repaired_restocked` returns it — both via the ledger.
- [ ] Cost components recorded per batch and retrievable for management.

## Depends on / blocks

- Depends on: Phases 0–1 (catalogue, materials, ledger, approvals).
- Blocks: Phase 5 accounting (COGS) and analytics production-status views (Phase 6).
