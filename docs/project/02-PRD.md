# 02. Product Requirements Document (PRD)

## 1. Purpose & Scope

This PRD consolidates the approved requirements for the Seentair platform into one functional specification, module by module. Each module below summarizes confirmed business rules; full detail and the client's exact confirmed language lives in `../appendix-requirements/`.

## 2. In-scope modules (MVP — "Must Have Now")

Manufacturing & Production, Raw Materials, Product Catalogue, Inventory, Retail E-commerce, Wholesale, Payments, Order Tracking, Returns, Accounting, Logistics, Marketing, Analytics, Staff & Access Management, Approvals & Audit Trail, WhatsApp/Live Chat.

## 3. Deferred modules ("Important Later")

Custom/Pre-order requests, Partner/Investor portal, SMS notifications. (POS/physical sales has a scheduling contradiction — see `03-Open-Questions.md` item 1 — tentatively treated as deferred.)

## 4. Functional requirements by module

### 4.1 Manufacturing & Production
- Production runs in batches; quantity driven by previous sales + current orders.
- Stages: Production Planned → Cutting → Sewing → Finishing → Quality Control → Completed (customizable to real factory terms).
- Production cost = raw material + sewing + branding + packaging cost.
- Rejects: defective → burned; minor factory error → repaired & restocked. Reason code is required and drives disposition.

### 4.2 Raw Materials
- No supplier-relationship management (client sources from multiple, non-fixed suppliers — see descoping note in `../appendix-requirements/13-Suppliers.md`).
- Track: materials, purchases (qty + cost), usage tied to production, available quantity, low-stock alerts.

### 4.3 Products
- Product, category, size, colour, collection, SKU, price, image(s), availability, linked production batch.

### 4.4 Retail
- Flow: discover → view → select variant → cart → checkout → pay online (Paystack) → confirmation → track → post-delivery review.
- Reviews are a client-requested addition, tied to delivered orders.

### 4.5 Wholesale
- MOQ = 20 units. Multiple wholesale price tiers exist (criteria TBD — see Open Questions).
- Portal: wholesale pricing, bulk orders, reorder, order/invoice history, tracking, custom design submission, reviews.

### 4.6 Custom / Pre-Order (deferred to post-MVP)
- Flow: submit design → business review → feasibility/cost → quotation → buyer accepts → payment → payment confirmation → sample production → buyer approves sample → full production → fulfilment → delivery.
- Required intake fields: size, colour, quantity, location, fabric quality, description, desired date.
- Design approval: Manager role. Quotation: manual (fabric, quantity, style-based).

### 4.7 Payments
- No part-payments on ordinary orders — full payment required upfront.
- Online: Paystack. Offline: cash/POS/bank transfer, recorded manually.
- All channels feed into one central order/payment record.

### 4.8 Order Tracking
- Customer-facing states: Order Received → Processing/Packaging → Shipped/Waybill → At Customer Location/Delivered → Returned (if applicable) → optional Review.
- SMS specifically for delivery/location updates (deferred integration).

### 4.9 Returns
- Request within 12 hours of receipt; return completed within 24 hours.
- All products returnable except custom/special orders.
- Returned via logistics company with tracking/parcel ID.
- Must record: order, product, reason, disposition (restocked/damaged), resolution.

### 4.10 Inventory
- Full visibility: raw materials, WIP, finished goods, available/used/sold/damaged/returned/dispatched stock.
- **Architectural requirement:** maintain a movement history/ledger, not a single mutable quantity field (see `08-Initial-Data-Model.md`).

### 4.11 Accounting
- Replaces manual accounting entirely.
- Tracks: sales, expenses, purchases, production cost, COGS, payroll, taxes, profit, loss.
- Full report suite required: income, expenditure, investment, loss, profit.
- No customer credit — customers are not expected to owe the business.

### 4.12 Logistics
- Dispatch riders (local), logistics companies, transport companies, interstate and international delivery.
- Delivery price = weight + location. Multi-leg deliveries supported.
- First integration: GIGL.

### 4.13 Marketing
- Campaigns, promotions, channel attribution, recommendations, loyalty, product visibility, performance analysis.

### 4.14 Analytics
- Dashboard: sales, revenue, profit/loss, best/slow sellers, low stock, production status, inventory status, product profitability, sales by channel, marketing source performance, partner info (where permitted).

### 4.15 Partners/Investors (deferred to post-MVP)
- Business investors, not affiliates. No access to customer-facing storefronts.
- Dashboard flow: Login → Business Overview → Investment Info → Performance → Inventory Visibility → Accounts/Reports → Profit Sharing.
- Profit split: 40% reinvestment / 40% dividends / 20% reserve. 1,000,000 total shares: 60% founder/CEO, 40% partners by equity %.

### 4.16 Staff & Access Control
- ~10 internal users. Roles: Business Owner/Admin, Sales, Inventory, Production, Finance/Accounting, Management, Partner/Investor, Customer.
- Role-based permissions; sensitive actions restricted.

### 4.17 Approvals & Audit Trail
- Approval required for: purchasing, production, price changes, moving funds, and any unauthorized material/product removal, transfer, or disposal.
- Full audit log: actor, action, before/after state, timestamp.

### 4.18 Communication
- In-platform messages, SMS, WhatsApp, live chat — centered on orders and delivery.

### 4.19 Integrations
- Paystack, WhatsApp, live chat, SMS, GIGL (logistics), marketing/social channels, future POS/mall systems. No historical data migration.

### 4.20 POS / Mall Sales System (scheduling TBD — see Open Questions)
- Connects to inventory, products, orders, payments, customer info, accounting, analytics. Exact screens/hardware deferred to a later planning stage regardless of priority-level outcome.

## 5. Non-functional requirements

- **Auditability:** all stock and fund movements must be traceable to an actor and timestamp (see 4.10, 4.17).
- **Data integrity over convenience:** inventory must never be a freely-editable number; it must be derived from logged movements.
- **Mobile-friendly:** retail and wholesale storefronts must work well on mobile, given WhatsApp/social-driven customer behavior already in use.
- **Fresh start:** no legacy data migration required for v1.

## 6. Out of scope for v1

Multiple factories, third-party marketplace, affiliate/commission system, full POS hardware integration (pending Open Question resolution), historical data migration.

## 7. Source of truth

Every rule above is sourced from `../appendix-requirements/`. Where this PRD and the appendix ever disagree, treat the appendix as authoritative and flag the discrepancy for correction.
