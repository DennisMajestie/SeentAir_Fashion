# 15. Design Specification — Streetwear Commerce Experience

**Status:** Active design direction | **Revision:** 15 September 2026

This section translates the confirmed product-design direction into a practical specification for **Google Stitch** (via the Stitch MCP), UI design, and frontend implementation.

> The public website should feel like a fashion brand first and a software system second.

> **Phasing note:** this design work is executed **after** the backend phases, when frontend implementation begins. The Stitch MCP will be used to drive the design pass from the brief in §15.5.

## 15.1 Design Direction

Seentair is a streetwear and clothing brand with a manufacturing operation behind the commerce experience. The public website should therefore lead with fashion, product, movement, and strong visual storytelling rather than a conventional corporate or SaaS hero.

The landing page is a **scroll-driven cinematic experience**. Scrolling controls the narrative and progressively completes a streetwear outfit.

**Core narrative:** Empty mannequin → shirt → joggers → sneakers → complete look → shop the look.

The landing page is the entry point to the retail storefront and must naturally transition the visitor into product discovery and shopping.

**What is deliberately not locked here:** this specification defines the experience, not a premature implementation mechanism. The engineering team can select the most reliable animation technique after evaluating performance, accessibility, asset weight, browser support, and maintainability.

## 15.2 Scroll-Driven Landing Narrative

| Stage | Scroll state | Visual behaviour | Purpose |
|---|---|---|---|
| 1 | Introduction | Premium minimal fashion scene. Empty mannequin/model is the focal point. | Establish brand and intrigue. |
| 2 | Scroll 1 | A Seentair shirt transitions onto the mannequin. | Introduce the first product piece. |
| 3 | Scroll 2 | Joggers are added and the composition shifts toward the full silhouette. | Build the outfit progressively. |
| 4 | Scroll 3 | Sneakers appear and complete the styling. | Reach the strongest visual moment. |
| 5 | Reveal | Complete outfit remains visible with a clear Shop the Look CTA. | Convert visual interest into shopping. |

**Motion principles:** Scroll controls progress. Motion is physical and fashion-editorial. Avoid decorative motion that competes with the outfit. Do not make shopping dependent on the animation.

## 15.3 Mobile, Accessibility & Performance

The approved UX/UI requirements already establish a mobile-first customer experience and call for resilience on common Nigerian mobile network conditions. The cinematic landing page must respect those constraints.

**Mobile requirements**
- Preserve the narrative while simplifying effects where needed.
- Prioritize fast loading over visual complexity.
- Compress and lazy-load heavy visual assets.
- Keep the primary shopping CTA obvious and reachable.
- Provide a reduced-motion/static alternative.
- Never block catalogue access if animation assets fail to load.

**Accessibility requirements:** The visual experience must coexist with readable typography, clear contrast, keyboard/focus behaviour where applicable, and a `prefers-reduced-motion` path. Animation is enhancement, not a prerequisite for understanding or purchasing.

**Performance rule:** A visually impressive landing page that delays product discovery is a failed implementation. The performance budget should be treated as part of the design acceptance criteria.

## 15.4 Storefront Structure

The cinematic landing page is one part of the broader retail storefront.

**Customer journey:** Home / Landing → Shop / Product Discovery → Product Detail → Cart → Checkout → Order Confirmation → Order Tracking → Review / Return.

**Primary storefront screens**
- Product discovery / browse & search
- Product detail with size and colour selection
- Cart & Paystack checkout
- Order confirmation
- Order tracking
- Post-delivery review submission
- Return request form

**Separate application experiences:** The authenticated wholesale portal and internal admin/operations dashboard are distinct application surfaces. They should not inherit the cinematic storefront treatment wholesale. They should instead optimize for task completion, clarity, role-appropriate information, and operational efficiency.

**Platform boundary:** All user-interaction frontends are Angular. They connect to the same Node.js + NestJS Core API and central PostgreSQL database.

## 15.5 Google Stitch Direction (starting design brief)

> Design a premium, modern streetwear fashion e-commerce website for Seentair Limited, a clothing manufacturer and streetwear brand. The landing page must be cinematic and scroll-driven. Start with a minimal premium fashion scene containing an empty mannequin/model. As the user scrolls, progressively dress the mannequin: first a Seentair shirt, then joggers, then sneakers. Each scroll stage should feel like a physical fashion styling sequence, not a slideshow. After the complete outfit is revealed, show a strong "Shop the Look" CTA leading into the retail catalogue.
>
> Use an editorial fashion aesthetic: bold typography, generous whitespace, large product imagery, restrained interface chrome, premium composition, and confident streetwear energy. Avoid generic SaaS styling, crowded layouts, excessive gradients, and unnecessary decoration.
>
> Design the rest of the storefront around product discovery, collections, product detail, cart, checkout, order confirmation, order tracking, reviews, and returns. Make the entire customer experience mobile-first and performant on constrained mobile networks. Provide clear navigation to the shop and other site areas. The cinematic animation must have a reduced-motion/static fallback and must never prevent the user from shopping.

## 15.6 Design Acceptance Criteria

The landing page is ready for implementation handoff when all of the following are true:

1. A first-time visitor immediately understands that Seentair is a clothing/streetwear brand.
2. The mannequin-to-complete-outfit story is understandable without instructions.
3. Scroll position clearly controls visual progression.
4. The complete outfit naturally leads to shopping.
5. The page remains usable on mobile.
6. The page remains usable with reduced motion.
7. Visual quality feels premium without compromising load performance.
8. The storefront remains visually distinct from the internal admin application.

## 15.7 Confirmed Engineering Stack

- **User-interaction frontends:** Angular — Retail Storefront, Wholesale Portal, Admin / Operations Dashboard.
- **Backend:** Node.js + NestJS.
- **Database:** PostgreSQL.
- Supporting architecture retained from the technical specification: S3-compatible object storage, Paystack, GIGL through a pluggable logistics adapter, notification providers, and background jobs such as BullMQ/Redis where required.

This design section is intentionally experience-led. The business requirements, role matrix, API specification, data model, QA strategy, operations guide, and delivery phases remain part of the full project documentation.
