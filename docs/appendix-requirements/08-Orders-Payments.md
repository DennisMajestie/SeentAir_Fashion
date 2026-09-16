# 08. Orders & Payments

## Rules

- **No part-payments for ordinary orders.** Orders must be fully paid before proceeding through the applicable sales process. (Note: custom/pre-order flow is the exception — it has its own payment-then-sample-then-production sequence, see `07-Custom-Pre-Order.md`.)
- **Online payments:** Paystack.
- **Offline sales:** recorded manually into the system. Offline payment methods include cash, POS, and bank transfer.
- All sales channels (online + offline/in-store) must ultimately feed into the **central business system** — no channel should operate in isolation.

## Data/entities implied

- `Payment` (order id, method: paystack | cash | pos | bank_transfer, amount, status, recorded_by [for offline], date)
- `Order` (channel: online | in-store | wholesale | custom, payment status, fulfillment status)
