# 06. Wholesale & Bulk Buyers

## Eligibility

- A customer becomes a wholesale/bulk buyer by being able to meet the **minimum order quantity (MOQ)**.
- **Confirmed MOQ: 20 units.**
- There are **multiple wholesale price levels/tiers** (client confirmed "Yes" — exact tier structure/criteria is not yet defined, see `25-Remaining-Clarification-Questions.md`).

## Capabilities for wholesale/bulk buyers

- Access wholesale products/prices.
- Place bulk orders.
- Reorder products.
- View order information.
- Track orders.
- View relevant invoices/payment information.
- Submit special/custom design requests (see `07-Custom-Pre-Order.md`).
- Receive quotations where necessary.
- Leave a review (client added this here too, same as retail).

## Data/entities implied

- `WholesaleAccount` (customer id, tier, approved MOQ status)
- `PriceTier` (tier name, discount or fixed price rules) — pending exact tier definition
