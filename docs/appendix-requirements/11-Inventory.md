# 11. Inventory

## Why it matters

Client confirmed inventory is one of the most important parts of the system.

## Required visibility

- Raw materials
- Production / work-in-progress (WIP)
- Finished goods
- Available stock
- Stock used
- Stock sold
- Damaged/rejected items
- Returned items
- Dispatched items

## Key requirement: movement history, not just a number

The client explicitly wants a **reliable history of inventory movements** — every addition, removal, transfer, and adjustment should be logged with who/what/when — rather than the system simply overwriting a single stock count. This is a foundational architecture decision: inventory should be event-sourced or at minimum fully audit-logged, not just a mutable quantity field.

## Data/entities implied

- `InventoryItem` (product/material id, current quantity)
- `InventoryMovement` (item id, type: purchase | production | sale | return | damage | dispatch | adjustment, quantity delta, actor, timestamp, reference — links to `19-Approvals-Audit-Trail.md`)
