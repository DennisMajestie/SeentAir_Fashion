# API Alignment Audit — Vessa Dashboard → Sentair API

Vessa is the new Seentair dashboard. Its `core/*-api.service.ts` layer calls one API at `/api/v1`, matching Sentair's global prefix. This report maps each Vessa service call to the Sentair backend and flags what's missing.

## Endpoint alignment

| Vessa service | Vessa call | Sentair endpoint | Status |
|---|---|---|---|
| CatalogueApiService | `GET /products?page&limit` | `GET /products` | ✓ |
| | `GET /products/:id` | `GET /products/:id` | ✓ |
| | `GET /products/:id/variants` | `GET /products/:id/variants` | ✓ |
| | `GET /categories` | `GET /categories` | ✓ |
| | `GET /collections` | `GET /collections` | ✓ |
| CustomersApiService | `GET /customers?page&limit&kind&tag` | **none** | ✗ MISSING |
| | `GET /customers/:id` | **none** | ✗ MISSING |
| OrdersApiService | `GET /orders?page&limit&channel&status` | `GET /orders` | ✓ |
| | `GET /config/public` | `GET /config/public` | ✓ |
| | `GET /orders/:id` | `GET /orders/:id` | ✓ |
| | `GET /orders/:id/tracking` | `GET /orders/:id/tracking` | ✓ |
| | `PATCH /orders/:id/status` | `PATCH /orders/:id/status` | ✓ |
| InventoryApiService | `GET /inventory/summary?page&limit&itemType` | `GET /inventory/summary` | ✓ |
| | `GET /inventory/digest/:itemType/:itemId` | `GET /inventory/digest/:itemType/:itemId` | ✓ |
| | `GET /inventory/:itemId/movements?page&limit&itemType` | `GET /inventory/:itemId/movements` | ✓ |
| | `GET /inventory/counts?page&limit` | `GET /inventory/counts` | ✓ |
| | `POST /inventory/counts` | `POST /inventory/counts` | ✓ |
| MaterialsApiService | `GET /materials?page&limit` | `GET /materials` | ✓ |
| | `GET /materials/purchases` | `GET /materials/purchases` | ✓ |
| | `GET /materials/low-stock` | `GET /materials/low-stock` | ✓ |
| | `GET /materials/valuation` | `GET /materials/valuation` | ✓ |
| | `GET /materials/:id` | `GET /materials/:id` | ✓ |
| SuppliersApiService | `GET /materials/suppliers?page&limit` | `GET /materials/suppliers` | ✓ |
| | `GET /materials/suppliers/:id` | `GET /materials/suppliers/:id` | ✓ |
| HelpApiService | `GET /help/articles` | `GET /help/articles` | ✓ |
| | `GET /help/tickets?page&limit&status` | `GET /help/tickets` | ✓ |
| | `POST /help/tickets` | `POST /help/tickets` | ✓ |
| | `PATCH /help/tickets/:id/status` | `PATCH /help/tickets/:id/status` | ✓ |
| AnalyticsApiService | `GET /analytics/dashboard?range&from&to` | `GET /analytics/dashboard` | ✓ |
| | `GET /analytics/best-sellers?limit&direction` | `GET /analytics/best-sellers` | ✓ |
| | `GET /analytics/low-stock?variantThreshold` | `GET /analytics/low-stock` | ✓ |
| Auth (signin section) | `POST /auth/login` etc. | `POST /auth/login` etc. | ✓ |

## Payload shape notes

| Vessa model | Sentair equivalent | Note |
|---|---|---|
| `ApiOrder.customer: {id, name, email, phone?}` | `customerName/customerEmail/customerPhone` (string fields, no id) | ⚠ Customer id not exposed on the order |
| `ApiOrder.deliveryMethod`, `deliveryFee`, `shippingAddress.{state,city,line,phone}` | `deliveryMethod`, `deliveryFee`, `shippingAddress` | ✓ |
| `ApiOrder.items[].variant.{sku, size, colour, imageUrl, product}` | `OrderDetailItemDto.{sku, size, colour, imageUrl, productName}` | ✓ |
| `ApiOrder.status` incl. `awaiting_stock` | `OrderStatus` + `CUSTOMER_AWAITING_STOCK` | ✓ (aliased) |
| `AnalyticsDashboard` | `analytics.service.ts` `dashboard()` | ✓ — salesToday, profitLoss, salesByChannel, marketingSourcePerformance, pendingApprovals, metrics, series, statusBreakdown, trends all returned |
| `ApiProduct.sizeClass` | Product entity `sizeClass` | ✓ (column + coercion added this session) |

## What's missing (in priority order)

1. **Customers endpoints — not implemented at all.** `GET /customers` (with page/limit/kind/tag filters) and `GET /customers/:id`. Vessa's `customers.ts`, `shoppers.ts`, `stockists.ts`, `cs-data.ts`, and `customer-detail-drawer.ts` all call these. No controller exists for customers in Sentair's API.

2. **Order customer id.** Vessa's `ApiOrder.customer` includes `id`; Sentair's `OrderDetailDto` returns denormalized `customerName/customerEmail/customerPhone` with no customer reference id.

3. **Warehouse sections (future).** Vessa `warehouses/locations.ts`, `warehouses/transfers.ts`, `warehouses/counts.ts` — Sentair has inventory counts/movements but no location/transfer endpoints.

## Immediate fix

Add a `customers` module (controller `customers` + service + dto) exposing:

```
GET  /customers?page&limit&kind&tag
GET  /customers/:id
```

Backed by the existing customers/users table so the customers dashboard sections can load. Everything else Vessa needs is already on Sentair's API.

## Deploy note

API changes deploy automatically to `seentair-backend.onrender.com` on push to `main`. The FCT state-label fix (`matchState("FCT: Abuja")`) and delivery/VAT settings are already live on main.
