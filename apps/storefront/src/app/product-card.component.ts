import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject, input, signal } from '@angular/core';
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
 * colour dots, meta line, price and review stars. Shared by the shop grid and
 * the storefront home sections.
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
          (click)="$event.preventDefault(); $event.stopPropagation(); wishlist.toggle(product())"
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
        </a>

      <!-- Floating cart-add, straddling the image/body boundary
           (bottom:-14px puts half of it outside the image). This replaces the
           old hover "+ Quick add" panel: size and colour selection now happens
           on the product page, because a card cannot show a real size
           chooser at this size without inventing a default. -->
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
      @if (addedId() === product().id) {
        <p class="qa-added">Added ✓</p>
      }

      <a class="card-body" [routerLink]="['/product', product().id]">
        <h3>{{ product().name }}</h3>
        <div class="card-meta">
          <span class="dots">
            @for (c of coloursOf(product()).slice(0, 4); track c) {
              <span class="swatch small" [style.background]="swatch(c)" [title]="c"></span>
            }
          </span>
          <span class="muted small">{{ metaLine(product()) }}</span>
        </div>
        <!-- Single price, always. A "was" price needs a compare-at markdown,
             and the product model has no such field (products.base_price is the
             only price column), so inventing one would be fabricated data. The
             real discount in this platform is the wholesale tier, which is a
             different number shown in the wholesale portal. -->
        <p class="price">₦{{ product().basePrice | number: '1.0-2' }}</p>
        @if (rating(); as r) {
          <p
            class="stars-line"
            [attr.aria-label]="r.avg + ' out of 5 from ' + r.count + ' reviews'"
          >
            <span class="stars">{{ starString(r.avg) }}</span>
            <span class="muted small">{{ r.avg | number: '1.1-1' }} ({{ r.count }})</span>
          </p>
        } @else {
          <!-- 0 real reviews. Five muted stars, no caption: at a glance in a
               grid you can see which products have no rating yet, and the row
               keeps the same height as a rated card so a 5-up grid stays even.

               The glyphs are decorative and aria-hidden, and the state is
               carried by role="img" + the shared copy as its label. Without
               that the card would say nothing at all to a screen reader --
               five stars are invisible as text, so "unrated" would be lost.

               Deliberately --muted, never --primary-fill: the gold is the
               established shorthand for a real score (see .stars), and
               borrowing it here would assert a rating that does not exist. -->
          <p class="stars-line" role="img" [attr.aria-label]="noReviewsCopy">
            <span class="stars no-reviews-stars" aria-hidden="true">☆☆☆☆☆</span>
          </p>
        }
      </a>
    </div>
  `,
})
export class ProductCardComponent implements OnDestroy {
  private readonly cart = inject(CartService);
  private readonly alerts = inject(BrandAlertService);
  private readonly router = inject(Router);
  readonly wishlist = inject(WishlistService);
  /** Template-visible handle on the shared constant; see NO_REVIEWS_COPY. */
  readonly noReviewsCopy = NO_REVIEWS_COPY;
  readonly product = input.required<Product>();
  readonly index = input(0);
  readonly rating = input<{ avg: number; count: number } | null>(null);

  readonly addedId = signal<string | null>(null);
  private addedTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly fallbacks = [
    'shop-1.jpg',
    'shop-2.jpg',
    'shop-3.jpg',
    'shop-5.jpg',
    'shop-6.jpg',
  ];

  ngOnDestroy(): void {
    clearTimeout(this.addedTimer);
  }

  fallback(index: number): string {
    return this.fallbacks[index % this.fallbacks.length];
  }
  swatch(colour: string): string {
    return SWATCHES[colour.toLowerCase()] ?? '#8a8378';
  }
  coloursOf(p: Product): string[] {
    return [...new Set(p.variants.map((v) => v.colour).filter((c): c is string => !!c))];
  }
  sizesOf(p: Product): string[] {
    const order = ['S', 'M', 'L', 'XL', 'XXL', 'OS', 'Bespoke'];
    return [...new Set(p.variants.map((v) => v.size).filter((s): s is string => !!s))].sort(
      (a, b) => {
        const ia = order.indexOf(a),
          ib = order.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      },
    );
  }
  metaLine(p: Product): string {
    const sizes = this.sizesOf(p);
    const colours = this.coloursOf(p);
    const sizePart =
      sizes.length === 0
        ? ''
        : sizes.length === 1 && (sizes[0] === 'OS' || sizes[0] === 'Bespoke')
          ? sizes[0] === 'OS'
            ? 'One size'
            : 'Made to measure'
          : `${sizes[0]}-${sizes[sizes.length - 1]}`;
    const colourPart = colours.length > 1 ? `${colours.length} colours` : '';
    return [sizePart, colourPart].filter(Boolean).join(' · ');
  }
  isSoldOut(p: Product): boolean {
    return (
      p.variants.length > 0 && p.variants.every((v) => v.availabilityStatus === 'out_of_stock')
    );
  }
  badge(p: Product): string | null {
    if (this.isSoldOut(p)) return 'Sold out';
    if (p.variants.some((v) => v.availabilityStatus === 'made_to_order')) return 'Made to order';
    const ageDays = (Date.now() - new Date(p.createdAt).getTime()) / 86_400_000;
    return ageDays <= 30 ? 'New' : null;
  }
  starString(avg: number): string {
    const full = Math.round(avg);
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
    void this.alerts.toast(`${p.name} added to basket`);
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
