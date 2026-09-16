# 09. API Specification (v1 — high level)

This is a high-level REST endpoint inventory to guide backend scaffolding. A full OpenAPI/Swagger spec should be generated from this during technical design (NestJS + `@nestjs/swagger`).

## Conventions

- Base path: `/api/v1`
- Auth: Bearer JWT on all endpoints except `/auth/*` and public storefront read endpoints (`GET /products`, etc.)
- All list endpoints support pagination (`?page=&limit=`)
- All mutating endpoints that touch inventory or funds must resolve through the approval/audit layer described in `07-Technical-Architecture.md`

## Auth
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`

## Users & Roles
- `GET /users` (F: Admin)
- `POST /users` (F: Admin)
- `GET /users/:id`
- `PATCH /users/:id/role` (F: Admin)

## Products & Catalogue
- `GET /products` (public)
- `GET /products/:id` (public)
- `POST /products` (Admin/Management)
- `PATCH /products/:id` (Admin/Management — price changes require approval)
- `GET /products/:id/variants`
- `POST /products/:id/variants`

## Manufacturing & Production
- `GET /production-batches`
- `POST /production-batches`
- `PATCH /production-batches/:id/stage`
- `POST /production-batches/:id/cost`
- `POST /production-batches/:id/qc-rejection`

## Raw Materials
- `GET /materials`
- `POST /materials`
- `POST /materials/:id/purchase`
- `POST /materials/:id/usage`
- `GET /materials/low-stock`

## Inventory
- `GET /inventory/:variantId/movements`
- `POST /inventory/:variantId/movements` (system-generated in most cases — sale, return, production completion — rather than manual direct calls)
- `GET /inventory/summary`

## Orders (retail, wholesale, in-store all share this resource, filtered by `channel`)
- `POST /orders`
- `GET /orders`
- `GET /orders/:id`
- `PATCH /orders/:id/status`
- `POST /orders/:id/payment`
- `GET /orders/:id/tracking`

## Wholesale
- `GET /wholesale/pricing`
- `POST /wholesale/accounts`
- `GET /wholesale/accounts/:id`

## Custom Orders (post-MVP)
- `POST /custom-orders`
- `GET /custom-orders/:id`
- `POST /custom-orders/:id/quotation`
- `POST /custom-orders/:id/sample-approval`

## Returns
- `POST /returns`
- `GET /returns`
- `PATCH /returns/:id/resolve`

## Reviews
- `POST /orders/:id/review`
- `GET /products/:id/reviews`
- `PATCH /reviews/:id/status` (moderation — pending Open Question #4)

## Accounting
- `GET /accounting/ledger`
- `GET /accounting/reports/:type` (income | expenditure | investment | loss | profit)

## Logistics
- `POST /deliveries`
- `PATCH /deliveries/:id/status`
- `GET /deliveries/:id/tracking`

## Analytics
- `GET /analytics/dashboard`
- `GET /analytics/best-sellers`
- `GET /analytics/low-stock`

## Partners (post-MVP)
- `GET /partners/:id/dashboard`
- `GET /partners/:id/profit-distributions`

## Approvals & Audit
- `GET /approvals/pending`
- `POST /approvals/:id/decide`
- `GET /audit-log`

## Notifications
- `POST /notifications/send` (internal use, triggered by system events)
