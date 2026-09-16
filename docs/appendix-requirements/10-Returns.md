# 10. Returns

## What must be recorded per return

- Which order was returned
- Which product was returned
- Why it was returned (reason)
- What happened to the returned item
- Whether it goes back into inventory
- Whether it is damaged/rejected
- What resolution was given

## Confirmed policy details (from clarification round)

- **Return request window:** must be raised within **12 hours** of receiving the order.
- **Return completion window:** the physical return should happen within **24 hours** of the request.
- **Eligibility:** any product can be returned **except special/custom design orders** (see `07-Custom-Pre-Order.md` — these are excluded since they're made-to-spec).
- **Return logistics:** the item is sent back via a logistics company, and a tracking number/parcel ID is shared with the business.

## Data/entities implied

- `ReturnRequest` (order id, product id, reason, requested_at, return_deadline, tracking_number, resolution, restocked: bool, damaged: bool)
