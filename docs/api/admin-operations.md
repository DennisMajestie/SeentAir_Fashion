# Admin operations API

These endpoints back the admin dashboard's material purchase history, stock
counts, help center, and internal help tickets. All endpoints require a
bearer-authenticated staff session unless otherwise noted by the application.

## Material purchase history

`GET /materials/purchases?page=1&limit=50` returns `{ data, total }`, newest
purchases first, including each purchase's material. Requires
`RAW_MATERIALS/VIEW`. Purchases continue to be recorded through the existing
`POST /materials/:id/purchase` flow, which requires `RAW_MATERIALS/FULL` and an
approved purchasing request. This is not a purchase-order or supplier
management workflow.

## Inventory counts

- `GET /inventory/counts?page=1&limit=50` returns `{ data, total }` with
  recorded count lines. Requires `INVENTORY/VIEW`.
- `POST /inventory/counts` records one or more items in one stock count.
  Requires `INVENTORY/FULL`.

The request body is:

```json
{
  "items": [
    {
      "itemType": "variant",
      "itemId": "variant-uuid",
      "countedQuantity": 12,
      "approvalRequestId": "optional-approved-stock-disposal-request-uuid"
    }
  ]
}
```

The API locks affected ledger items, saves the system and physical quantities,
and records each nonzero difference as an inventory adjustment. A decrease
requires an approved `STOCK_DISPOSAL` request. Duplicate items in one count and
zero-delta ledger movements are rejected or omitted, respectively.

## Help center and staff tickets

- `GET /help/articles` returns read-only help articles. Requires
  `COMMUNICATION/VIEW`. Articles are curated summaries with source references
  to repository documentation.
- `GET /help/tickets?page=1&limit=50` returns `{ data, total }`. Requires
  `COMMUNICATION/VIEW`.
- `POST /help/tickets` creates an `open` ticket. Requires `COMMUNICATION/FULL`.
- `PATCH /help/tickets/:id/status` accepts `open`, `in_progress`, or `resolved`.
  Requires `COMMUNICATION/FULL`.

Ticket creation and status changes are attributed to the authenticated staff
member.

## Checkout and platform settings

The dashboard settings screen uses the existing checkout settings endpoints;
it does not add a separate configuration store. Reads and writes require
`LOGISTICS/FULL` under the current controller policy. Changes must include a
reason and are audited. This policy applies to reads as well as writes.

Warehouse transfers are not part of this implementation.
