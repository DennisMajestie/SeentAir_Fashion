# Phase 8 — Guest Checkout & Post-Purchase Accounts

**Goal:** a customer can buy with no account, track the order from a link we email them, and
create an account afterwards to claim it.

**Spec:** `../project/16-Guest-Checkout-Specification.md` — read that first. This file is the
build order: exactly which files change, in what sequence, and what proves each step works.

**Scope note:** steps 1 and 2 touch payments and the inventory ledger, so per
`../project/10-Development-Guide.md` they need a **second domain-familiar reviewer** before
merge. That is not optional and it is not satisfied by an automated review.

---

## Ground rules for every step

Applied to each step before it is called done:

1. Migration runs **up, down, and up again** against a real database.
2. `npm run build` clean, `npx jest` green, `npx eslint` no new findings, Prettier clean.
3. New behaviour has unit tests; the concurrency-sensitive parts get an integration test
   against real Postgres (`npm run test:e2e`), following `test/ledger-concurrency.e2e-spec.ts`.
4. Nothing merges that leaves the storefront unable to complete a purchase.

**Hard sequencing rule:** step 1 must not reach production without step 2. Guest ordering with
no tracking link means a customer can pay and then have no way to see their order.

---

## 8.1 Step 1 — Guest ordering

The customer can place and pay for an order with no account. They cannot yet track it.

### Backend

| File | Change |
|---|---|
| `database/migrations/<ts>-GuestCheckout.ts` | **new** — `orders.guest_name`, `guest_email`, `claimed_at`; partial index on `guest_email` |
| `modules/orders/entities/order.entity.ts` | add the three columns |
| `modules/orders/dto/guest-contact.dto.ts` | **new** — `name`, `email`, validated and normalised lowercase |
| `modules/orders/dto/create-order.dto.ts` | add optional `guest`; `shippingAddress` required for retail |
| `modules/orders/orders.controller.ts` | `@Public()` + `@Throttle` on `POST /orders`; user becomes optional |
| `modules/orders/orders.service.ts` | `create()` guest branch; Paystack email resolution |

**The part to get right:** `@Public()` bypasses `JwtAuthGuard` entirely, so `@CurrentUser()`
arrives `undefined` rather than throwing. Every branch in `create()` that reads `user.id`,
`user.role` or `effectiveAccess()` has to handle that. A guest is always
`channel: retail`, `customer: null`, and may never reach the wholesale or staff branches —
those still require a JWT and keep their MOQ and approved-account gates.

`initPaystackPayment` resolves email as
`order.customer?.email ?? order.guestEmail ?? user.email`.

### Tests

- Guest order with valid body → created, `customer` null, `guestEmail` stored lowercased.
- Guest order with no `shippingAddress` → 400.
- `guest` block sent **with** a JWT → 400.
- Guest attempting `channel: wholesale` or passing `customerId` → 403.
- Guest order → Paystack init uses `guestEmail`.
- Authenticated ordering unchanged (existing tests must pass untouched).

### Done when

A guest can complete checkout end to end against live Paystack test keys, the webhook marks
it `PAID`/`ORDER_RECEIVED`, and exactly one set of `SALE` movements is written.

---

## 8.2 Step 2 — Tracking without an account

Ships **with** step 1. This is what makes step 1 safe.

### Backend

| File | Change |
|---|---|
| `modules/orders/entities/order-access-token.entity.ts` | **new** — mirrors `password-reset-token.entity.ts`; SHA-256 hash only |
| `database/migrations/<ts>-OrderAccessTokens.ts` | **new** table |
| `modules/orders/orders.service.ts` | issue token on guest order creation; `verifyTrackingToken()` |
| `modules/orders/orders.controller.ts` | `?token=` on `GET /orders/:id/tracking`, `@Public()` |
| `modules/notifications/notifications.service.ts` | `sendOrderConfirmation()` |
| `modules/orders/orders.service.ts` | call it post-commit on `charge.success` |

The token is returned **once**, in the create response, and emailed. It is not single-use —
the customer reopens the link — and expires 90 days after delivery.

The tracking response reuses the existing **customer** audience projection, so staff notes and
internal states are already stripped.

### Tests

- Correct token → customer projection returned.
- Wrong, expired or missing token → **404, not 403** (do not confirm the order exists).
- Token for order A used against order B → 404.
- Confirmation email sent once on `charge.success`, contains a working link.
- Webhook retry does not send a second email.

### Done when

A guest completes checkout, receives the email, opens the link on a different device with no
session, and sees their order.

---

## 8.3 Step 3 — Email verification

New capability, on existing SMTP plumbing. Nothing claims orders until this lands.

| File | Change |
|---|---|
| `modules/users/entities/user.entity.ts` | `email_verified_at` |
| `modules/auth/email-verification-token.entity.ts` | **new**, same pattern as password reset |
| `database/migrations/<ts>-EmailVerification.ts` | **new** |
| `modules/auth/auth.service.ts` | issue on register; `verifyEmail()` |
| `modules/auth/auth.controller.ts` | `POST /auth/verify-email`, `POST /auth/resend-verification` (both `@Public`) |

Existing accounts are **backfilled as verified** — we are not locking out current customers.

### Tests

- Register → token issued, email sent, `email_verified_at` null.
- Valid token → set; token single-use; expired token → 400.
- Unverified account can still sign in and shop (verification gates *claiming*, not access).

---

## 8.4 Step 4 — The claim

| File | Change |
|---|---|
| `modules/orders/orders.service.ts` | `claimGuestOrders(userId, email)` — attach unclaimed orders matching the verified address |
| `modules/auth/auth.service.ts` | call it on successful verification |
| `apps/storefront/.../checkout.page.ts` | drop the inline account step; guest fields only |
| `apps/storefront/.../order.page.ts` | read `?token=`; show the account invitation |

Claiming sets `customer_id` and `claimed_at` in one transaction, and skips any order already
claimed.

### Tests

- Verify with a matching email → order attached, appears in history, `claimed_at` set.
- Register + verify with a matching email for an **already claimed** order → not re-attached.
- Two guest orders, same email → both attach on one verification.
- Unverified registration → nothing attached, tracking link still works.

---

## 8.5 Step 5 — Expiry job

Unpaid guest orders are unbounded once creation is public.

`services/jobs` is still a stub and BullMQ/Redis is not set up. **Recommendation:
`@nestjs/schedule` inside the API** — one cron, no new infrastructure. Standing up Redis for a
single nightly sweep is not justified yet; revisit when notifications or reports need a queue.

- Expire `AWAITING_PAYMENT` orders older than 24h → `CANCELLED`.
- Never touches a paid order. Writes no inventory movements (nothing was ever reserved).
- Logged, and counted in the admin dashboard.

---

## Acceptance criteria

1. A guest buys, pays and is emailed a working tracking link — no account at any point.
2. Closing the tab after payment loses nothing; the email is the durable route.
3. Creating an account with the same address, once verified, attaches the order.
4. An unverified account attaches nothing.
5. Authenticated and wholesale checkout are behaviourally unchanged.
6. One set of `SALE` movements per paid order, under concurrent webhook delivery.
7. Unpaid guest orders do not accumulate.

## Depends on

- Phase 3 (orders, payments, tracking) — done.
- SMTP configured. Dev falls back to a logged link; **production needs real credentials**
  before step 2 ships, or guests get no tracking link at all.
- Open Question #7 (NDPR) for guest-data retention — does not block the build.

## Risks

| Risk | Handling |
|---|---|
| Public write endpoint abused | Tighter throttle (10 per 10 min per IP); expiry job clears litter |
| Claim-by-email hijack | Step 3 gates it; steps 1–2 are safe without it because nothing claims yet |
| Oversell window widens | Accepted — `STOCK_EXCEPTION` already handles it, will fire more often |
| Payment path regression | Second reviewer; existing payment tests must pass untouched |
