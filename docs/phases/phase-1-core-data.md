# Phase 1 — Core Data Foundation

**Goal:** the data backbone — product catalogue, raw materials, and the inventory movement ledger. **This phase blocks almost everything else; get the ledger design right the first time** (explicit client requirement).

**Frontend:** none yet. Admin screens for catalogue/inventory arrive with the admin dashboard build (after Phase 6 backend, designed via Stitch MCP).

## 1.1 Product Catalogue (backend)

Requirements: `../appendix-requirements/04-Products.md`

- Entities: `Product` (name, description, category, base_price), `ProductVariant` (size, colour, SKU, price_override, image_url, availability_status), `Collection`.
- Endpoints: `GET /products` (public), `GET /products/:id` (public), `POST /products`, `PATCH /products/:id` (**price changes require approval** — wire through the Phase 0 approval service), `GET/POST /products/:id/variants`.
- Image upload to S3-compatible storage.
- Availability: in stock / out of stock / made-to-order; link to production batch(es) (FK lands in Phase 2).

## 1.2 Raw Materials (backend)

Requirements: `../appendix-requirements/03-Raw-Materials.md` and the descope in `13-Suppliers.md`

- Entities: `RawMaterial` (name, unit, current_quantity *derived*, reorder_threshold), `MaterialPurchase` (date, qty, cost, optional free-text note — **no structured supplier field**), `MaterialUsage` (tied to production batch).
- Endpoints: `GET/POST /materials`, `POST /materials/:id/purchase`, `POST /materials/:id/usage`, `GET /materials/low-stock`.
- Low-stock alert logic (threshold comparison; notification delivery matures in later phases).
- **Do NOT build supplier-relationship management** — explicitly descoped by the client.

## 1.3 Inventory Movement Ledger (backend — the architectural backbone)

Requirements: `../appendix-requirements/11-Inventory.md`

- Entity: `InventoryMovement` (variant_or_material_id, type: purchase | production | sale | return | damage | dispatch | adjustment, quantity_delta, actor_id, timestamp, reference_id).
- **Never mutate a stock count directly.** Current quantities are derived/cached from movements; no feature code writes quantity fields.
- Inventory service layer that all other modules must call (sales, returns, production completion, QC disposition).
- Endpoints: `GET /inventory/:variantId/movements`, `POST /inventory/:variantId/movements` (mostly system-generated), `GET /inventory/summary`.
- Visibility categories: raw materials, WIP, finished goods, available/used/sold/damaged/returned/dispatched.

## Acceptance criteria

- [ ] Products/variants/collections CRUD with RBAC per the matrix; price change without approval is rejected server-side.
- [ ] Material purchase and usage each write an `InventoryMovement`; `current_quantity` is derived, verified by integration test.
- [ ] A direct quantity edit path does not exist in the API surface.
- [ ] Low-stock endpoint returns materials under threshold.
- [ ] Every mutating call produces an audit-log entry (cross-cutting assertion).

## Depends on / blocks

- Depends on: Phase 0.
- Blocks: Phases 2–7 (everything sits on catalogue + ledger).
