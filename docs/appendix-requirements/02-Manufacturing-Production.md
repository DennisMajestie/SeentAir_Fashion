# 02. Manufacturing & Production

## Production model

- Production runs in **batches**.
- Batch quantity is influenced mainly by **previous sales** and **current orders**.

## Production stages (confirmed, adjustable to real factory floor terms)

```
Production Planned → Cutting → Sewing → Finishing → Quality Control → Completed
```

The system should let staff see which stage each batch is currently at.

## Cost tracking

Production cost = **raw material cost + sewing cost + branding cost + packaging cost**. The system should let these four cost components be recorded/estimated per product or per batch so real production cost is visible to management.

## Rejects / QC failures

Handling depends on the reason for rejection:
- **Defective / bad product** → burned (write-off, removed from stock permanently).
- **Simple factory error** (e.g. cosmetic, fixable) → repaired and put back into stock.

The system should capture the **rejection reason** as a required field, since it determines which of the two paths above is taken, and should track disposition (burned vs. repaired-and-restocked) for reporting.

## Data/entities implied

- `ProductionBatch` (product, quantity, stage, planned date, completed date)
- `ProductionCost` (batch or product id, material cost, sewing cost, branding cost, packaging cost)
- `QCRejection` (batch/unit reference, reason, disposition: burned | repaired_restocked)
