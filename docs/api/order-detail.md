# Order detail API

`GET /orders/:id/detail` returns a stable, display-oriented snapshot of one
order: the human-readable order number, buyer and delivery details, line items,
totals, and the status timeline.

## Access

- An authenticated caller must have access to the order under the existing
  retail/wholesale order permission rules.
- A customer with own-order access can only read their own order.
- A guest may pass the order's tracking token as `?token=...`.
- When both a session and a guest token are supplied, the session is
  authoritative; the token never widens the session's permissions.
- Missing, expired, or unrelated guest tokens return `404`.

## Customer and staff projection

Both audiences receive their authorized order's basic details, line items,
shipping address, and status timeline. Customer projections omit fulfilment
notes, stock shortfalls, status-event notes, actor identifiers, and internal
payment/stock-exception events. A stock exception is shown as
`awaiting_stock`, consistent with the tracking endpoint.

Staff projections also include fulfilment staging fields, stock shortfalls,
and status-event notes and actor attribution.

## Example response

```json
{
  "id": "0b491dff-9704-4c33-9a7f-ae5d4ecb2bcf",
  "orderNumber": "SO-1001",
  "channel": "retail",
  "status": "processing",
  "paymentStatus": "paid",
  "totalAmount": 17000,
  "deliveryFee": 1200,
  "deliveryMethod": null,
  "shippingAddress": {
    "state": "Abia",
    "city": "Aba",
    "line": "1 Market Road",
    "phone": "08000000000"
  },
  "guestName": null,
  "guestEmail": null,
  "customerName": "Ada Buyer",
  "customerEmail": "ada@example.test",
  "customerPhone": null,
  "customerNote": null,
  "items": [
    {
      "id": "item-uuid",
      "productName": "Classic Tee",
      "sku": "TEE-BLK-M",
      "size": "M",
      "colour": "Black",
      "quantity": 2,
      "unitPrice": 8500,
      "lineTotal": 17000
    }
  ],
  "events": [
    {
      "status": "order_received",
      "createdAt": "2026-10-27T16:30:00.000Z"
    }
  ],
  "deliveredAt": null,
  "createdAt": "2026-10-27T16:00:00.000Z",
  "updatedAt": "2026-10-27T16:30:00.000Z"
}
```

The order number is allocated by the database sequence and formatted as
`SO-<number>` in this response. The UUID `id` remains the resource identifier
for API routes and existing links.
