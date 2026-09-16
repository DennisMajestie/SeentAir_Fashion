# 03. Raw Materials

> **Scope correction from client:** during review, the client clarified that her earlier mention of "suppliers" referred to **the people/businesses she supplies to** (i.e. her customers), not raw-material suppliers. She does **not** have a stable material supplier and sources from multiple ones interchangeably. As a result, **no dedicated supplier-management module is needed for raw materials** — see `13-Suppliers.md` for the corresponding scope note.

## What should still be tracked

Materials themselves (not supplier identity):
- Record materials (name, type, unit of measure).
- Record material purchases (date, quantity, cost — supplier name not required as a structured field, can be a free-text note if useful).
- Track quantities on hand.
- Track material usage (tied to production where appropriate).
- Track material cost (feeds into production cost — see `02-Manufacturing-Production.md`).
- Show available material at any time.
- Low-stock warnings/alerts.

## Data/entities implied

- `RawMaterial` (name, unit, current quantity, reorder threshold)
- `MaterialPurchase` (material id, date, quantity, cost, optional note)
- `MaterialUsage` (material id, production batch id, quantity used, date)
