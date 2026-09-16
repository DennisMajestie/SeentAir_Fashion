# 07. Custom / Pre-Order & Special Design Requests

## Confirmed end-to-end flow

```
Buyer submits request/design
  → Business reviews
  → Business determines feasibility/cost
  → Quotation issued
  → Buyer accepts quotation
  → Buyer makes payment
  → Payment confirmation
  → Sample production
  → Buyer approves sample  (gate before full production)
  → Production
  → Fulfilment
  → Delivery
```

> Note: the sample-production and buyer-approval steps were added by the client during review — **full production must not begin until the buyer has approved the sample**.

## Information required from the buyer at submission

- Size(s)
- Colour(s)
- Quantity
- Delivery location
- Fabric quality
- Name/description of the design
- Desired delivery date/timeline

## Approval & pricing

- **Design approval authority:** Manager.
- **Quotation method:** manual, based on fabric quality/type, quantity, and style/sewing complexity. (No automated pricing formula yet — build for a manual quote-entry step.)

## Data/entities implied

- `CustomOrderRequest` (buyer id, sizes, colours, quantity, location, fabric quality, description, desired date, status)
- `Quotation` (request id, amount, approved_by, created_at)
- `SampleApproval` (request id, sample status, buyer approved y/n, date)
