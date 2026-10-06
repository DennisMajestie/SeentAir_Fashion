import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Product, ProductVariant } from './api.service';
import { BrandAlertService } from './brand-alert.service';
import { CartService } from './cart.service';
import { SeentairTiltCardComponent } from './tilt-card.component';
import { WishlistService } from './wishlist.service';

/**
 * Empty-review copy, shared with the PDP so the two cannot drift apart.
 *
 * Reviews open after delivery, which is a policy statement (appendix returns:
 * a review follows a completed order), not a nicety -- so a shopper with no
 * reviews yet is being told when they can, not just that nobody has.
 */
export const NO_REVIEWS_COPY = 'No reviews yet: reviews open after delivery.';

/** Length of the decorative "sale surge" clock, hh:mm:ss, ticking down once per
    second. Client-approved cosmetics only: the product model has no sale-end or
    compare-at column, so the clock never claims a real deadline -- it starts
    from the same fixed value every time the card renders and loops there. */
export const SURGE_SECONDS = 9 * 3600 + 59 * 60 + 59;

/** One countdown frame, zero-padded, e.g. 3599 → "00:59:59". */
export function formatSurge(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Colour-name → swatch hex for the little dots on cards. */
export const SWATCHES: Record<string, string> = {
  black: '#1a1a1a',
  bone: '#e8e2d5',
  charcoal: '#3a3a3a',
  clay: '#b46a4e',
  ecru: '#e6ddc9',
  sand: '#d8c6a3',
  olive: '#6b6b47',
  'grey melange': '#9a9a9a',
  indigo: '#3f4a6b',
  natural: '#ddd3c0',
  white: '#f2f0eb',
};

/**
 * The shop product card: thumbnail, availability badge, floating cart-add,
 * name, price, a decorative "sale surge" countdown and the rating row (stars,
 * then a real "(N)" from paid orders). Shared by the shop grid and the
 * storefront home sections.
 *
 * The card deliberately shows no colour swatches or size summary: the meta row
 * they used to hang in added a full row of content that made the three-up
 * landing cards read long, and both details are real jobs for the product page,
 * where a shopper can actually pick them.
 */
@Component({
  selector: 'app-product-card',
  imports: [CommonModule, RouterLink, SeentairTiltCardComponent],
  template: `
    <div class="card product-card" [class.soldout]="isSoldOut(product())">
      <a class="thumb" [routerLink]="['/product', product().id]">
        <!-- The tilt belongs to the photograph, not the whole card: the badge,
             wishlist and quick-add sit above it and stay put. -->
        <app-tilt-card class="fill">
          <img
            [src]="product().variants[0]?.imageUrl || 'assets/' + fallback(index())"
            [alt]="product().name"
            loading="lazy"
          />
        </app-tilt-card>
        @if (badge(product()); as b) {
          <span class="badge" [class.badge-out]="b === 'Sold out'">{{ b }}</span>
        }
      </a>

      <!-- Wishlist. Outside the photo link on purpose: a <button> nested in an
           <a> is invalid HTML, and on mobile Safari the tap can resolve as a
           navigation instead of a press. The thumb is flush with the top of the
           card, so anchoring to the card keeps the heart in the same top-right
           spot over the photograph. -->
      <button
        class="heart-btn"
        type="button"
        [class.active]="wishlist.has(product().id)"
        [attr.aria-pressed]="wishlist.has(product().id)"
        [attr.aria-label]="
          wishlist.has(product().id)
            ? 'Remove ' + product().name + ' from wishlist'
            : 'Add ' + product().name + ' to wishlist'
        "
        (click)="$event.preventDefault(); wishlist.toggle(product())"
      >
        <svg
          viewBox="0 0 24 24"
          [attr.fill]="wishlist.has(product().id) ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z"
          />
        </svg>
      </button>

      <!-- Info block. Fixed-content areas only, top to bottom: the price row,
           then a 2-line clamped name, then the rating row pinned to the
           bottom of the card. That combination is what keeps every card in a
           row the same height and the price/text row on the same baseline,
           whatever the name length. -->
      <div class="product-info">
        <!-- One link covering the whole info area. Stretched over the content
             rather than wrapping it, so the cart button can be a real sibling
             instead of a <button> nested inside an <a>: nested interactive
             content is invalid HTML and its click handling is unreliable on
             mobile Safari. -->
        <a
          class="product-info__link"
          [routerLink]="['/product', product().id]"
          [attr.aria-label]="product().name"
        ></a>

        <!-- Cart-add: the gold tile floating over the bottom-right corner of the
             photo, across the image/body boundary, as approved. It lives here in
             the info block rather than inside the photo link for two reasons: a
             <button> nested in an <a> is invalid HTML (and unreliable on mobile
             Safari), and the top edge of this block IS the image/body boundary,
             so anchoring to it puts the tile in the same spot on every card
             whatever the name length. Size and colour selection still happens
             on the product page, because a card cannot show a real size chooser
             here without inventing a default. -->
        @if (!isSoldOut(product())) {
          <button
            class="cartbtn"
            type="button"
            [attr.aria-label]="cartButtonLabel(product())"
            (click)="addFromCard($event)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6"
              />
              <circle cx="9" cy="20" r="1" />
              <circle cx="17" cy="20" r="1" />
            </svg>
          </button>
        }

        <!-- First in the info block so the price reads above the name. -->
        <div class="price-row">
          <!-- Single price, always. A "was" price needs a compare-at markdown,
               and the product model has no such field (products.base_price is the
               only price column), so inventing one would be fabricated data. The
               real discount in this platform is the wholesale tier, which is a
               different number shown in the wholesale portal. -->
          <p class="price">₦{{ product().basePrice | number: '1.0-2' }}</p>
        </div>

        <!-- Decorative "sale surge" clock, client-approved cosmetics. There is
             no sale-end column in the product model, so this ticks a constant
             value (SURGE_SECONDS) and restarts on every render -- it never
             asserts a real deadline. aria-hidden: a ticking clock is noise to
             a screen reader, and it adds nothing to the card's meaning. -->
        <p class="surge" aria-hidden="true">
          <span class="surge-dot" aria-hidden="true"></span>
          <span class="surge-label">SALE SURGE</span>
          <span class="surge-clock">{{ surge() }}</span>
        </p>

        <!-- title keeps the untruncated name reachable when the clamp cuts it. -->
        <h3 class="product-name" [title]="product().name">{{ product().name }}</h3>

        @if (rating(); as r) {
          <p class="stars-line" [attr.aria-label]="ratingLabel(product(), r)">
            <span class="stars">{{ starString(r.avg) }}</span>
            @if (soldOf(product()) > 0) {
              <span class="stars-sold">({{ soldOf(product()) }})</span>
            }
          </p>
        } @else {
          <!-- 0 real reviews. Five muted stars, no caption: at a glance in a
               grid you can see which products have no rating yet, and the row
               keeps the same height as a rated card so a grid stays even.

               The glyphs are decorative and aria-hidden, and the state is
               carried by role="img" + the shared copy as its label. Without
               that the card would say nothing at all to a screen reader --
               five stars are invisible as text, so "unrated" would be lost.

               Deliberately --muted, never --primary-fill: the gold is the
               established shorthand for a real score (see .stars), and
               borrowing it here would assert a rating that does not exist.

               The "N bought" count can still appear after an unrated row: it
               is real paid orders, and it does not pretend to be a score. -->
          <p class="stars-line" role="img" [attr.aria-label]="ratingLabel(product(), null)">
            <span class="stars no-reviews-stars" aria-hidden="true">☆☆☆☆☆</span>
            @if (soldOf(product()) > 0) {
              <span class="stars-sold">({{ soldOf(product()) }})</span>
            }
          </p>
        }
      </div>

      <!-- Confirming a quick-add. Absolute so appearing and disappearing cannot
           change the card's height mid-scroll. -->
      @if (addedId() === product().id) {
        <p class="qa-added">Added ✓</p>
      }
    </div>
  `,
})
export class ProductCardComponent implements OnInit, OnDestroy {
  private readonly cart = inject(CartService);
  private readonly alerts = inject(BrandAlertService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  readonly wishlist = inject(WishlistService);
  readonly product = input.required<Product>();
  readonly index = input(0);
  readonly rating = input<{ avg: number; count: number } | null>(null);

  readonly addedId = signal<string | null>(null);
  private addedTimer: ReturnType<typeof setTimeout> | undefined;

  /** The ticking frame of the decorative surge clock. */
  readonly surge = signal(formatSurge(SURGE_SECONDS));
  private surgeTimer: ReturnType<typeof setInterval> | undefined;

  private readonly fallbacks = [
    'shop-1.jpg',
    'shop-2.jpg',
    'shop-3.jpg',
    'shop-5.jpg',
    'shop-6.jpg',
  ];

  ngOnInit(): void {
    // Decorative countdown (see SURGE_SECONDS): ticks one second at a time and
    // loops when it reaches zero, so the clock can never stall at 00:00:00. The
    // loop is why it cannot be read as a deadline date -- there is none.
    //
    // The interval itself is scheduled OUTSIDE the Angular zone: a recurring
    // macrotask inside the zone would keep NgZone permanently unstable, which
    // starves `fixture.whenStable()` (every async spec that mounts a card hangs
    // until Jasmine's 5s timeout). Each tick then re-enters the zone for the
    // signal write, so the update still runs through normal change detection.
    let s = SURGE_SECONDS;
    this.zone.runOutsideAngular(() => {
      this.surgeTimer = setInterval(() => {
        s = s > 0 ? s - 1 : SURGE_SECONDS;
        this.zone.run(() => this.surge.set(formatSurge(s)));
      }, 1000);
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.addedTimer);
    clearInterval(this.surgeTimer);
  }

  fallback(index: number): string {
    return this.fallbacks[index % this.fallbacks.length];
  }
  /** Real paid orders behind this product; absent means unknown-but-zero. */
  soldOf(p: Product): number {
    return p.soldCount ?? 0;
  }
  /**
   * Accessible name for the rating row. The visible glyphs and the "(N)" count
   * carry no meaning as text on their own, so everything is spelled out
   * here -- and the unrated copy stays shared with the PDP (NO_REVIEWS_COPY).
   */
  ratingLabel(p: Product, r: { avg: number; count: number } | null): string {
    const buyers = this.soldOf(p) > 0 ? `${this.soldOf(p)} bought. ` : '';
    return buyers + (r ? `${r.avg} out of 5 from ${r.count} reviews.` : NO_REVIEWS_COPY);
  }
  isSoldOut(p: Product): boolean {
    return (
      p.variants.length > 0 && p.variants.every((v) => v.availabilityStatus === 'out_of_stock')
    );
  }
  /**
   * One badge, by priority. Sold out first -- a dead product is never sold as
   * anything else. Made to order second, because the made-to-order wait is a
   * real commitment to surface. Bestseller is a seller-applied merchandising
   * label (the products.is_bestseller column), so it outranks the time-window
   * "New" default and has nothing to do with the derived soldCount.
   */
  badge(p: Product): string | null {
    if (this.isSoldOut(p)) return 'Sold out';
    if (p.variants.some((v) => v.availabilityStatus === 'made_to_order')) return 'Made to order';
    if (p.isBestseller) return 'Bestseller';
    const ageDays = (Date.now() - new Date(p.createdAt).getTime()) / 86_400_000;
    return ageDays <= 30 ? 'New' : null;
  }
  starString(avg: number): string {
    // Clamped because a stray average must never overflow the five-glyph row:
    // a negative or >5 figure would otherwise crash String.repeat.
    const full = Math.max(0, Math.min(5, Math.round(avg)));
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  /**
   * Adds the first genuinely buyable variant: in stock, and OS if the product
   * has one. Never guesses a size the customer did not pick. When the product
   * has a real size/colour range there is nothing safe to add, so the tap opens
   * the product page instead of doing nothing.
   */
  addFromCard(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const p = this.product();
    const v = this.defaultVariant(p);
    if (!v) {
      void this.router.navigate(['/product', p.id]);
      return;
    }
    this.cart.add(p, v, 1);
    this.addedId.set(p.id);
    void this.alerts.toast(`${p.name} added to cart`, {
      action: { label: 'View cart', run: () => void this.router.navigate(['/cart']) },
    });
    clearTimeout(this.addedTimer);
    this.addedTimer = setTimeout(() => this.addedId.set(null), 1800);
  }

  /** The button means two different things, so it has to say which. */
  cartButtonLabel(p: Product): string {
    return this.defaultVariant(p)
      ? `Add ${p.name} to cart`
      : `Choose size and colour for ${p.name}`;
  }

  private defaultVariant(p: Product): ProductVariant | null {
    const inStock = p.variants.filter((v) => v.availabilityStatus !== 'out_of_stock');
    if (inStock.length === 0) return null;
    return inStock.find((v) => v.size === 'OS') ?? (inStock.length === 1 ? inStock[0] : null);
  }
}
