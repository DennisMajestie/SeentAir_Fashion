# 16 — Guest Checkout & Post-Purchase Account Creation

**Status:** draft for review — no code written yet
**Owner:** engineering
**Decisions needed from:** Seentair Limited (see §10)

---

## 1. Goal

Let a customer buy without creating an account, then invite them to create one **after**
payment, when they want to track the order they have just paid for.

Today the storefront asks for name, email, phone **and a password** before it will take an
order. For someone buying a single item that is a sign-up flow wearing a checkout's clothes,
and it is the largest avoidable drop-off in the funnel.

**What the customer sees after this change**

| Step | Now | After |
|---|---|---|
| 1 | Cart | Cart |
| 2 | **Create account / sign in** | Delivery details (name, email, address) |
| 3 | Delivery details | Pay (Paystack) |
| 4 | Pay (Paystack) | Confirmation — *"create an account to track your orders"* |

The account step does not disappear; it moves to where the motivation is.

## 2. Non-goals

- Not removing accounts. Wholesale, staff and partner access are unchanged and still
  require authentication.
- Not changing pricing, the inventory ledger, the approval rules or the order lifecycle.
- Not building a guest "order history" — a guest has one order at a time, reachable by link.
- Not touching the Paystack HMAC verification, the amount check or the reference format.

## 3. What currently blocks it

Grounded in the code as it stands:

| # | Blocker | Where |
|---|---|---|
| 1 | `JwtAuthGuard` is global; only the Paystack webhook is `@Public` in the orders controller | `app.module.ts:72`, `orders.controller.ts` |
| 2 | The buyer's identity comes from the JWT, never the request body | `orders.service.ts` `create()` |
| 3 | There is nowhere to put a guest's email or name on an order | `entities/order.entity.ts` |
| 4 | Paystack needs an email to initialise, resolved from `order.customer?.email ?? user.email` — both account fields | `orders.service.ts` `initPaystackPayment()` |
| 5 | Reading an order is scoped to `order.customer?.id === user.id` | `orders.service.ts` `findById()` |
| 6 | `shippingAddress` is `@IsOptional()` on the server | `dto/create-order.dto.ts` |

**What already works in our favour**

- `Order.customer` is already `User | null` — ownerless orders are an existing, supported
  shape (in-store walk-ins), so admin screens, analytics and the ledger already handle them.
- `initPaystackPayment` already accepts an `emailOverride`, added with the receipt work.
- `tracking()` already splits its payload by audience, so a customer-safe projection exists.
- `password_reset_tokens` is a proven single-use, hashed, expiring token pattern to copy.

## 4. Data model

One migration. Additive; no column is dropped or retyped.

### 4.1 `orders` — guest contact

```
guest_name        varchar(160)  NULL   -- who to address the parcel and the email to
guest_email       varchar(320)  NULL   -- Paystack receipt + the key the claim matches on
claimed_at        timestamptz   NULL   -- when a registration attached this order
```

`guest_email` is stored **lowercased and trimmed** so matching is exact. Index it:

```
CREATE INDEX IDX_orders_guest_email ON orders (guest_email) WHERE guest_email IS NOT NULL;
```

**Invariant:** an order has a `customer_id` **or** a `guest_email`, never neither. A staff
in-store order is the one exception and keeps today's behaviour (both null).

### 4.2 `order_access_tokens` — tracking without an account

Mirrors `password_reset_tokens` exactly: only the SHA-256 hash is stored, so a database
leak exposes no usable link.

```
id          uuid PK
order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE
token_hash  varchar NOT NULL
expires_at  timestamptz NOT NULL
created_at  timestamptz NOT NULL DEFAULT now()
```

Unlike a reset token this is **not single-use** — the customer will open their tracking link
repeatedly. It expires on a long horizon (proposed: 90 days after delivery).

### 4.3 `users` — email verification

Required to make the claim safe (§7).

```
email_verified_at timestamptz NULL
```

Plus `email_verification_tokens`, identical in shape to `password_reset_tokens`.

## 5. API

### 5.1 `POST /orders` — accept guests

Stays one endpoint. When the request carries no JWT, the body must carry a `guest` block.

```jsonc
{
  "items": [{ "variantId": "…", "quantity": 1 }],
  "shippingAddress": {
    "state": "Lagos", "city": "Yaba",
    "line": "12 Herbert Macaulay Way", "phone": "+2348000000000",
    "landmark": "opposite the filling station"   // optional
  },
  "guest": { "name": "Ada Obi", "email": "ada@example.com" },  // guest only
  "source": "instagram"                                        // optional
}
```

Rules:

- `shippingAddress` becomes **required for retail orders** (guest or authenticated). It is
  optional today, which lets an unroutable order reach the pack-out desk. Staff in-store
  orders stay exempt.
- `guest` is rejected when a JWT is present; the account is the source of truth.
- A guest order is always `channel: retail`. Wholesale keeps its MOQ and approved-account
  gate and still requires authentication.
- Prices are repriced from the catalogue as today. Nothing about pricing trusts the client.

**Response** adds the tracking token once, and only on creation:

```jsonc
{ "id": "…", "totalAmount": 185000, "trackingToken": "…" }
```

### 5.2 `POST /orders/:id/payment` — guest path

`initPaystackPayment` resolves the email as
`order.customer?.email ?? order.guestEmail ?? user.email`. The existing `emailOverride`
behaviour is unchanged.

A guest calling this must present the tracking token (§5.3), so a stranger cannot start a
payment against someone else's order.

### 5.3 `GET /orders/:id/tracking` — guest path

Accepts `?token=…` when there is no JWT. The token is hashed and compared against
`order_access_tokens`. On success the caller gets the **customer** projection — the same one
an authenticated customer receives, with staff notes and internal states already stripped by
the existing audience split.

### 5.4 `POST /auth/register` — claim on sign-up

Unchanged signature. After a successful registration **and email verification** (§7), attach
every unclaimed order whose `guest_email` matches, setting `customer_id` and `claimed_at`.

### 5.5 Rate limits

The global limit is 300 req/min, which is right for authenticated traffic and loose for a
public write. Proposed for unauthenticated `POST /orders`: **10 per 10 minutes per IP**.

## 6. The confirmation email

**This is not optional, and it is the part that makes the whole design safe.**

The Paystack callback returns the *browser*. People close tabs, lose signal, or pay on a
phone and read email on a laptop. The webhook is the source of truth; the success page is a
courtesy. If the success page is the only route to the order, a paying customer can end up
with no way to see what they bought — the exact anxiety this feature is meant to relieve,
turned against us.

So on `charge.success`, alongside the existing work, send the guest an email containing:

1. Order reference, items, total, delivery address.
2. **A tracking link that works with no account** — `/orders/:id?token=…`.
3. The account invitation, mirroring the success page.

## 7. The claim, and why verification gates it

The mechanism is simple: the order already carries the email, so registering with that email
attaches it.

**The hole:** matching on email alone means anyone can register with a stranger's address and
inherit their order history and home address. Since guest emails are unverified at checkout,
an attacker only needs to guess that a given address shopped with us.

**The gate:** orders attach only after the registering user proves control of the address.

```
register → verification email → click → email_verified_at set → claim runs
```

Until then the account exists and works; the orders simply are not attached, and the tracking
link keeps working. No verification flow exists today, but SMTP is already wired for password
reset, so this is new code on proven plumbing — **not** new infrastructure.

## 8. Operational consequences

| Issue | Today | After | Proposal |
|---|---|---|---|
| Unpaid orders | Bounded — you need an account to make one | Unbounded, public | Expire `AWAITING_PAYMENT` after 24h via a scheduled job |
| Stock | Checked at creation, never reserved | Same, but the window widens | Accept for now; `STOCK_EXCEPTION` already handles the aftermath and will simply fire more often |
| PII | Behind accounts | Guest name, email, address on ownerless orders | Covered by the NDPR retention answer — Open Question #7 |

The expiry job is the first real use for `services/jobs`, which is still a stub.

## 9. Delivery order

Each step ships and is useful on its own.

1. **Guest ordering** — migration §4.1, `POST /orders` guest block, `shippingAddress`
   required, Paystack email resolution, tighter rate limit.
2. **Tracking without an account** — `order_access_tokens`, `?token=` on tracking,
   the confirmation email. *Guest checkout should not go live without this.*
3. **Email verification** — `email_verified_at`, verification tokens and flow.
4. **The claim** — attach on verified registration, plus the success-page invitation.
5. **Expiry job** — unpaid order cleanup in `services/jobs`.

Steps 1–2 unlock the revenue. Steps 3–4 make the account offer safe. Step 5 is hygiene.

## 10. Decisions needed

1. **How much should a tracking link reveal?** A no-login link is a link anyone holding it
   can open, showing contents and delivery address. Order IDs are unguessable UUIDs, so this
   is defensible and is what most retailers do. The tighter option is to require order
   number **plus** matching email or phone. *Recommendation: token link, 90-day expiry.*
2. **Is the account offer an invitation or a wall?** This spec makes it an invitation —
   tracking works regardless (§6). Making it a wall raises sign-ups but strands anyone who
   closes the tab. *Recommendation: invitation.*
3. **Guest order retention.** How long do we keep the name, email and address on an order
   that was never claimed? Ties to Open Question #7 (NDPR).
4. **Should a guest be able to reorder?** Out of scope here; it is the strongest argument for
   the account, so it may be worth holding back deliberately as the incentive.

## 11. Test scenarios

Beyond unit coverage, these are the ones that must hold:

- Guest order → pay → webhook → `PAID` + `ORDER_RECEIVED`, `SALE` movements written once,
  confirmation email sent with a working token link.
- Guest order with **no** `shippingAddress` → rejected 400.
- Guest block sent **with** a JWT → rejected 400.
- Tracking with a wrong, expired or missing token → 404 (not 403 — do not confirm the order
  exists).
- Register with a matching email, **before** verifying → order not attached, link still works.
- Verify → order attached, visible in account history, `claimed_at` set.
- Register with a matching email for an order **already claimed** → not re-attached.
- Two guests, same email, two orders → both attach on one verified registration.
- Unpaid guest order older than 24h → expired by the job, stock never affected.

---

*Prepared against the codebase at `d27d825` plus the uncommitted storefront work. Endpoint
and file references are to `services/api/src` unless stated.*
