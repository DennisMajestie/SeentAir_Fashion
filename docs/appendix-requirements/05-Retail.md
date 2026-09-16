# 05. Retail

## Customer-facing shopping flow

```
Discover products → View product info → Select size/colour/variant →
Add to cart → Checkout → Pay online → Receive confirmation →
Track order → Receive updates → Request return (if applicable) →
Leave a review (added by client)
```

## Notes

- The retail experience should be simple and should encourage more purchases.
- **Reviews:** client explicitly added that customers should be able to leave a review after receiving their product(s). Build this as a post-delivery review flow, tied to order/product.
- Online payment provider: **Paystack** (see `08-Orders-Payments.md`).

## Data/entities implied

- `Review` (order id, product id, customer id, rating, comment, created_at)
