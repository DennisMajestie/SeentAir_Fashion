# 09. Order Tracking

## Reference point

Client cited **Temu** specifically as inspiration for the **order-tracking experience** — not to copy Temu generally, but to give customers the same level of clear visibility into their own order status.

## Confirmed customer-facing journey

```
Order Received → Processing/Packaging → Shipped/Waybill →
At Customer Location/Delivered → Returned (if applicable) →
Review (optional, added by client)
```

## Notifications

- Customers should be able to see order status themselves in the platform at any time.
- Important updates communicated through the platform.
- **SMS** specifically for delivery/location-related updates.

## Data/entities implied

- `OrderStatusEvent` (order id, status, timestamp)
- Ties into `Review` entity from `05-Retail.md` (optional post-delivery review)
