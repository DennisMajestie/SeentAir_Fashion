# Seentair Limited Platform — User Manual

*Everything Seentair has delivered so far: how to sign in, navigate, and use every feature across the retail storefront, the wholesale portal, the admin/operations dashboard, and the partner/investor portal.*

**Version:** 1.0 — matches repository `main` (2026-09-25)
**Document:** `docs/User-Manual.md`

---

## 1. Platform at a glance

Seentair runs one central business system with four web apps, all talking to a single backend API and one database (PostgreSQL). Everything you see in one app is the same live data in the others.

| App | Production URL | Who uses it | Needs sign-in? |
|---|---|---|---|
| **Retail Storefront** | `https://seent-air-fashion.vercel.app` | Customers | Only to order / see orders |
| **Wholesale Portal** | `https://seentair-wholesale.vercel.app` | Retailers, boutiques, bulk buyers | Yes (approved buyers) |
| **Admin/Operations Dashboard** | `https://admin-dashboard-chi-eight-15.vercel.app` | Seentair staff | Yes (staff account) |
| **Partner/Investor Portal** | `https://partner-portal-pi-ten.vercel.app` | Partners & investors | Yes (2FA) |
| **Backend API** | `https://seentair-backend.onrender.com/api/v1` | (machines only) | Bearer token |

All apps ship with **light mode on by default** and a **light/dark toggle** (persisted per app). Navigation links between the apps appear in the storefront header/footer and in shared CTAs.

### People and roles

- **Customer** — browses the storefront without an account; signs up to order and track.
- **Wholesale buyer** — buys in bulk (minimum order 20 units) at tiered manufacturer rates.
- **Staff** — signs in to the ops dashboard with a staff account; sees only the areas their permissions allow.
- **Partner / Investor** — signs in with password **plus** a one-time code (2FA); sees business health, their investment, profit-sharing and reports — never customer personal data.

---

## 2. Basics common to every app

- **Signing in** — enter your email and password. Use the **Show/Hide** eye toggle to check what you typed.
- **Create an account** — on the storefront, use the **Create account** tab (name, email, optional phone, password ≥ 8 characters). Wholesale and admin accounts are provisioned by Seentair; partner accounts are provisioned with 2FA.
- **Forgot your password?** — tap **Forgot?** on any sign-in form, enter your email, and a reset link will be emailed to you (see §9 for the current email-provider status). The system answers the same whether or not the email exists, for security.
- **Sessions** — once signed in, the app keeps your session alive in the background (httpOnly refresh cookie). Sign out explicitly on shared computers.
- **Security lock** — if a sign-in is failed 5 times, the account is locked for 15 minutes. Just wait and try again.

---

## 3. Retail Storefront — for customers

### 3.1 Getting around

**Header (top, on every page):** logo → home · **Shop** · **Account** · Wholesale ↗ (external) · Admin ↗ · Partners ↗. Right side: light/dark toggle, **search** magnifier, **wishlist** heart (with count), **cart** bag (with count + mini-cart), and a menu button on mobile.

**Footer links:**
- **Shop:** All products · Drop 04 — Harmattan · Studio Essentials (these two currently open the full shop)
- **Help:** Shipping & dispatch · Returns — 12-hour window · Payments · Contact us → each jumps to the relevant section of the **Store policies** page
- **Account:** Sign in/register · Your orders · Cart
- **Business:** Wholesale portal · Admin dashboard · Partner portal (external links)

**Store policies page** (`/policies`) explains the rules that matter: full payment up front, dispatch with GIGL nationwide (Lagos parcels typically leave within 24h of payment), the 12-hour returns window, and contact details.

### 3.2 Home page

A cinematic full-screen hero (auto-advancing stages with on-scroll garment animation — press ← / → to navigate). Below it, in order:

1. **Trust strip** — Full payment · Tracked dispatch · 12h returns · One atelier, Aba.
2. **Hot right now** — top pieces by reviews and rating; “View all products”.
3. **Latest drops** — the 8 most recent releases.
4. **Suggested for you** — shop by category tiles (each opens the shop pre-filtered).
5. **What they're saying** — an auto-playing review marquee.
6. **Newsletter** — enter your email to join the drop-alert list.

### 3.3 Browsing the shop (`/shop`)

1. Use the **search bar** to search by product name, description, fabric or SKU.
2. Filter with the **category pills** (Tops, Bottoms, Outerwear, Accessories, Tailoring…), **collection bar** (e.g. *Drop 04 — Harmattan*), **size chips** and **colour swatches**.
3. **Sort** by: Featured · Newest · Price low → high · Price high → low.
4. A live **“N piece(s)”** count updates as you filter; **Clear filters** resets everything. Deep links like `/shop?category=tops` pre-select a category.

**Product cards:** photo, availability badge (`Sold out` / `Made to order` / `New`), wishlist heart, meta (e.g. `S–XXL · 4 colours`, `One size`, or `Made to measure`), price. **Hover + Quick add** to add to cart straight from the card.

### 3.4 Product page

1. Pick **size** and **colour** (a size/colour is greyed out when every variant of it is sold out). Price updates as you choose.
2. Set **quantity** with the stepper.
3. Main button:
   - **Add to cart — ₦price** for in-stock pieces,
   - **Order — made to your measurements** for made-to-order pieces (3-week lead time; *excluded from the 12-hour returns window*),
   - **Sold out / unavailable** state when the combination can't be ordered.
4. **Reviews** are shown under the product once customers have left them (reviews appear after approval by Seentair).

### 3.5 Cart (`/cart`)

1. Adjust quantities with − / + (or remove a line with **REMOVE**).
2. Summary shows Subtotal, Delivery (*quoted at dispatch*), payment policy, and Total.
3. **Amber notices that appear when relevant:**
   - **Wholesale eligibility** — if your basket has **20+ units**, you're invited to switch to the wholesale portal for tiered pricing.
   - **Made to order** — sample approval happens before dispatch, so allow extra time.
4. (Note: cart lives in your browser on this device — it isn't synced across devices yet.)

### 3.6 Checkout (`/checkout`)

1. **Not signed in?** The checkout shows a sign-in / create-account card first — the button reads *Sign in to continue*.
2. **Signed in?** Review the items, then **Proceed to payment →** to place the order.
3. The order is created, then a **“Pay with Paystack [₦amount]”** button takes you to Paystack to pay by card or bank. Full payment is required — there is no pay-on-delivery.
4. If the payment link can't be created (see §9), settle with the Seentair team and track the order from your account.

### 3.7 Account (`/account`)

Sign in to see:
- **Notifications** (e.g. dispatch updates),
- **Your orders** — each row links to its tracking page,
- **Sign out** at the top of the panel.

### 3.8 Order tracking (`/orders/<id>`)

1. A **progress header** shows how far the order has moved: `0X/04` steps — **Order received → Processing & packaging → Shipped → Delivered** (each marked complete / current / pending).
2. **Status history** — a dated timeline of every status change.
3. **Manifest** — what was ordered, quantities, line prices, total paid, and payment status.
4. When the order shows **Delivered**, the page offers two actions **per line item**:
   - **Leave a review** — pick 1–5 stars + optional comment. It appears publicly once approved.
   - **Request a return** — available only **within 12 hours of delivery**; a reason is required. After you request it, the physical return is due **within 24 hours**.
5. Returned orders show a banner: “This order was returned. The resolution is recorded in the history below.”

> **Returns rules:** request within **12 hours** of receiving the item; complete the physical return within **24 hours** of the request; items must be unworn with tags; custom/made-to-order pieces are excluded.

### 3.9 Wishlist

Tap the heart on any product card to save it. The heart icon in the header opens a panel where you can remove pieces or jump back to the shop. (Saved on this device only.)

### 3.10 Password reset (from `/account`, Sign in tab)

Type your email and tap **Forgot?** → you'll be emailed a reset link → open it (lands on `/reset-password?token=…`) → set a new password (≥ 8 characters) → sign in.

---

## 4. Wholesale Portal — for bulk buyers

### 4.1 Signing in & applying

1. Open the portal and **Sign in** with your business email + account password (use the **Show/Hide** toggle to check).
2. **Don't have access yet?** Sign in, go to **Catalogue**, and tap **Apply for a Wholesale Account**. Seentair reviews and activates your account.
3. The left panel always shows the two wholesale rules: **Minimum batch size 20** and **Tiered manufacturer rates**.

### 4.2 Navigation

**Home** (overview: buyer name, tier/pricing summary, invoices, notices) · **Catalogue** · **Orders** · **Custom** · **Bulk cart** (bag icon) · **Sign out** · theme toggle.

### 4.3 Catalogue & matrix (bulk order form)

1. Browse the catalogue with category and filter controls. Retail prices are shown alongside your **wholesale tier price** once your account is active.
2. Open any product's **Bulk Order Form** (`/catalogue/<id>/matrix`) — this is the wholesale ordering screen:
   - Build your order by quantity **per size and per colour**.
   - The matrix enforces the **20-unit minimum** for the order.
3. Add your batch to the **Bulk cart**.

### 4.4 Bulk cart & checkout

1. Review lines, quantities and the running total in the **Bulk Cart & Checkout** page.
2. Place the order — full payment up front.
3. From your orders list you can also **re-order** a previous order with one tap.

### 4.5 Orders & invoices

- **Orders** lists every wholesale order with its status and amount; tap through to the **Invoice** for the full breakdown.
- The **Invoice** page shows line items, quantities, unit prices at your tier, and totals.

### 4.6 Order tracking

The **Tracking** page shows your order's current status and a dated timeline of events, the same single source of truth the rest of the business sees.

### 4.7 Custom designs

1. From **Custom**, submit a **Custom Design Request** with your specifications.
2. Seentair responds with a **quotation** — review and **accept** the quote to continue.
3. After production, you mark **sample approval** in the portal.
4. Follow the whole lifecycle on the request's **status** page.

### 4.8 Notifications

Delivery and status messages addressed to your account appear in-app (the Home screen shows notices).

---

## 5. Admin / Operations Dashboard — for staff

### 5.1 Signing in

- Sign in with your staff email + password. **Remember me** keeps you signed in.
- **Forgot?** uses the same emailed reset link process.
- **What you see depends on your role/permissions.** Menus and buttons you don't have access to simply don't work — the system enforces this on the server, not just in the UI. The **Security** page covers your own password/security settings; staff are created and assigned roles on the **Staff** page by an authorized admin.

### 5.2 The operations bar

At the top: notifications bell (returns deadlines, pending approvals, low stock), global **search** across pages and entities, theme toggle, and your account menu.

### 5.3 The pages (each opens from the home tile grid / sidebar)

| Page | What it's for | Key actions |
|---|---|---|
| **Dashboard** | The owner/manager home: KPIs with a range picker, revenue, orders in transit, pending returns, stock alerts, best sellers, slow movers, recent orders, live activity | Pick a period; click into any list; check the emergency attention items |
| **Approvals** | Every request that needs sign-off lands here (price changes, purchases, production starts, fund movements) | Approve or reject pending requests |
| **Production** | Factory board: batches moving through the stages | Move batches **Planned → Cutting → Sewing → Finishing → QC → Completed**; record QC rejections (defective → burned; minor error → repaired & restocked with a reason) |
| **Orders** | Every order from every channel (storefront, wholesale, in-store) | View, update status, manage fulfilment/packing, see payment state |
| **Returns** | Incoming returns and the quarantine/inspection desk | Authorise the 12h-request/24h-completion windows; restock or write off stock |
| **Catalogue** | Products, variants, colours/sizes, collections, silhouettes, price management | Add/edit products; change prices (**requires approval**); manage specs and BOM |
| **Inventory** | Event-sourced stock: summary, movement ledger, variants, raw materials, WIP, ledger verification | Record movements (never edit counts directly); run the tamper-evident ledger check |
| **Reviews** | Customer review moderation | Approve or hide submitted reviews before they go public |
| **Partners** | Partner/investor records, investments, and their ledger | Add partners, view investment records, issue distributions |
| **Materials** | Raw-materials catalogue and thresholds; purchasing | Track material stock/usage; raise purchases (**requires approval**) |
| **Wholesale** | Wholesale configuration: tiered pricing and the buyer programme | Maintain price tiers; approve wholesale accounts |
| **Custom orders** | Custom/pre-order requests, quotations, sample approvals | Quote, approve, manage each custom order |
| **Accounting** | Ledger, report tiles, fund movements | View profit/ledger reports; record fund movements (**requires approval**) |
| **Staff** | Staff directory, roles & access | Create users, assign roles (least privilege) |
| **Logistics** | Shipment legs, delivery zones, quotes, carrier dispatch (incl. GIGL integration) | Create shipments, pick carriers, record tracking legs, quote deliveries |
| **Marketing** | Campaigns & audiences | Create and manage campaigns |
| **Tech pack** | Silhouette/pattern tech-pack editor | Save spec sheets to variants |
| **Vendors** | Mill/vendor procurement | Manage vendor contracts and purchase orders |
| **Floor kiosk** | Factory-floor sewing-station terminal view | Stage telemetry at a single station (setup/reader hardware to be connected) |
| **Messages** | Customer messages / live-support inbox | Read and reply |
| **Audit log** | The immutable, tamper-evident log of every sensitive action | Browse entries; **Verify chain** to prove nothing has been altered |
| **Security** | Your account security | Change password, manage your session |

### 5.4 How approvals work (governance)

Sensitive actions are **gated server-side** — a request is created in **Approvals**, an authorized approver **approves it**, and only then does the action complete. This applies to: catalogue price changes, wholesale tier discount changes, production starts, material purchasing, stock disposal, and fund movements. You'll see pending items in the ops bar and on the Dashboard.

### 5.5 The audit log

Every sensitive action is written to an **immutable audit log** with a cryptographic hash chain — use **Verify chain** on the Audit page to prove the log has not been tampered with. Passwords and payment credentials are redacted before logging.

---

## 6. Partner / Investor Portal

### 6.1 Signing in (with 2FA)

1. Enter your email + password.
2. Then enter the **one-time code** from your authenticator app (the second step is always required).
3. First time? Set up your authenticator from **Investor Settings** and enable 2FA. (Partner accounts are provisioned by Seentair with 2FA from the start.)
4. **Forgot?** triggers the same emailed reset link.

### 6.2 Portfolio data

The portal shows data for the **current period** — a **Period** chip in the header tells you which, and **Sync** refreshes the latest numbers ("last synced …"). As a partner you see business health and your own investment — never customer personal data (enforced server-side).

### 6.3 The pages

| Page | What it's for |
|---|---|
| **Overview** | The partnership dashboard: share structure (1,000,000 shares; 60% founder / 40% partners), split ratios (40% reinvestment / 40% dividends / 20% reserve), current values and headline metrics |
| **My Investment** | Your stake: shares, units, valuation and movement history |
| **Performance** | Live operational performance across the business |
| **Inventory** | Current stock picture at variant level (volume view, not customer data) |
| **Accounts & Reports** | Profitability, ledgers and financial reports for the period |
| **Profit Sharing** | The 40/40/20 model applied to the period: how profits flow to reinvestment, dividends and reserve |
| **Documents & Messages** | In-platform messages and documents Seentair shares with you |
| **Investor Settings** | Your profile, security (incl. managing your 2FA authenticator) |

### 6.4 Notifications

Messages addressed to your account appear in-app (and the Overview/Message pages).

---

## 7. Business rules quick reference (what the system enforces)

| Rule | Value |
|---|---|
| Wholesale minimum order | **20 units** per order |
| Wholesale pricing | **Tiered** manufacturer rates; retail buyers see their tier's price |
| Payments | **Full & up front** on every order — no part-payments, no COD |
| Returns request window | **Within 12 hours** of delivery |
| Return completion window | **Within 24 hours** of the request |
| Made-to-order / custom | **Excluded** from returns; ~3-week lead time; sample approval before dispatch |
| Production stages | Planned → Cutting → Sewing → Finishing → QC → Completed |
| QC rejects | Defective → **burned**; minor factory error → repaired & restocked (reason code) |
| Login security | 5 failed attempts ⇒ locked **15 minutes** |
| Profit split (post-MVP) | **40% reinvestment / 40% dividends / 20% reserve** |
| Shares | 1,000,000 shares; **60% founder / 40% partners** |
| Currency / locale | 🇳🇬 Naira (`₦`) — configurable, not hardcoded |

---

## 8. Integrations & current operational status

Honest status so you know what is fully live today:

| Integration | Status | What this means day-to-day |
|---|---|---|
| Orders, tracking, returns, reviews, notifications | ✅ Live | Full end-to-end flows work |
| Wholesale pricing tiers, MOQ, invoices, custom-design flow | ✅ Live | Buyer + staff sides working |
| Partner portal with 2FA, profit-sharing, reporting | ✅ Live | Working; depends on the latest backend deployment |
| **Transactional email** (password reset links) | ⏳ Pending | Reset links currently appear in the Seentair team's logs only — no email is delivered until an SMTP provider + credentials are configured (code ready, waiting on credentials) |
| **Paystack cards/bank (online payment)** | ⏳ Pending key | Checkout creates the order; the "Pay with Paystack" link needs a Paystack **secret key** before live transactions. Until then, orders settle **offline** (bank transfer / cash / POS) and the team confirms payment |
| **GIGL automated logistics** | ⏳ Pending key | Manual carriers/legs work today; automated GIGL shipment creation needs a **GIGL API key** |
| **SMS / WhatsApp notifications** (Termii) | ⏳ Pending key | On in-app notifications only until a **Termii key** is provisioned |
| Catalogue coverage | ⏳ Live with limits | Shop shows the first 50 products; add more and let engineering raise the catalogue cap |

> The latest backend and partner-portal changes need a **Render redeploy + Vercel redeploy** to be visible in production — Seentair operations coordinates that (see §10).

---

## 9. Environments & deployment

| Layer | Production | Local dev |
|---|---|---|
| Backend API | `https://seentair-backend.onrender.com/api/v1` | `http://localhost:3000/api/v1` |
| Storefront | `https://seent-air-fashion.vercel.app` | `http://localhost:4200` |
| Wholesale | `https://seentair-wholesale.vercel.app` | `http://localhost:4201` |
| Admin | `https://admin-dashboard-chi-eight-15.vercel.app` | `http://localhost:4202` |
| Partner | `https://partner-portal-pi-ten.vercel.app` | `http://localhost:4203` |

- Frontend apps are deployed to **Vercel**; the backend runs on **Render** (PostgreSQL database included).
- Code lives in the monorepo on GitHub (`DennisMajestie/SeentAir_Fashion`). Production branch: `main`.
- All apps load in **light mode by default**; the toggle is per-app and remembers your choice on that device.

---

## 10. Support

- **Customers & buyers:** use the **Contact** section on the storefront policies page (`hello@seentair.com`; WhatsApp for delivery updates), or message Seentair through the admin **Messages** inbox.
- **Staff / partners:** raise issues with the Seentair engineering team; reference the page and the action you were performing.