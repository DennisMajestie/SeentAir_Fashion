import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Offer, offerFor } from '../pricing';
import { SaleCountdownComponent } from '../sale-countdown.component';
import { ApiService, Product, ProductVariant } from '../api.service';
import { BrandAlertService } from '../brand-alert.service';
import { CartService } from '../cart.service';
import { SeentairTiltCardComponent } from '../tilt-card.component';
import { NO_REVIEWS_COPY } from '../product-card.component';

/** Product detail, Stitch PDP layout: gallery left; kicker, Anton title,
    price, spec-chip size/colour selectors, qty stepper, full-width acid CTA,
    reviews as a bordered log. */
@Component({
  selector: 'app-product',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    SeentairTiltCardComponent,
    SaleCountdownComponent,
  ],
  template: `
    @if (product(); as p) {
      <article class="product-detail">
        <app-tilt-card class="pdp-hero">
          <div class="tilt-product">
            @if (selected()?.imageUrl) {
              <img
                class="tilt-product-img"
                data-depth="0.5"
                [src]="selected()!.imageUrl!"
                [alt]="p.name"
              />
            } @else {
              <img
                class="tilt-product-img"
                data-depth="0.5"
                src="assets/shop-2.jpg"
                [alt]="p.name"
              />
            }
            <span class="tilt-price" data-depth="1">₦{{ currentPrice() | number: '1.0-2' }}</span>
          </div>
        </app-tilt-card>
        <div class="detail-body">
          <p class="sku-line">{{ selected()?.sku || '-' }} // {{ p.category }}</p>
          <h1>{{ p.name }}</h1>
          @if (reviews().length > 0) {
            <p class="stars-line">
              <span class="stars">{{ starString(avgRating()) }}</span>
              <span class="muted small"
                >{{ avgRating() | number: '1.1-1' }} · {{ reviews().length }} review(s)</span
              >
            </p>
          }
          <p class="price lg" [class.price--sale]="offer().was !== null">
            ₦{{ currentPrice() | number: '1.0-2' }}
            @if (offer(); as o) {
              @if (o.was !== null) {
                <s class="price-was">₦{{ o.was | number: '1.0-2' }}</s>
                <span class="price-off">−{{ o.percent }}%</span>
              }
            }
          </p>
          @if (offer().endsAt; as end) {
            <p class="sale-note">
              <span class="sale-dot" aria-hidden="true"></span>
              <span class="sr-only">Sale ends {{ end | date: 'd MMM, HH:mm' }}.</span>
              <span aria-hidden="true">
                Sale ends in <app-sale-countdown [endsAt]="end" (ended)="saleEnded()" />
              </span>
            </p>
          }
          <p class="muted">{{ p.description }}</p>

          @if (sizes().length > 0) {
            <p class="section-label">
              Select size <span class="count">// {{ sizes().length }}</span>
            </p>
            <div class="spec-chips">
              @for (s of sizes(); track s) {
                <button
                  class="spec-chip"
                  [class.active]="size() === s"
                  [disabled]="sizeSoldOut(s)"
                  (click)="size.set(s)"
                >
                  {{ s }}
                  @if (sizeSoldOut(s)) {
                    <span class="chip-out">×</span>
                  }
                </button>
              }
            </div>
          }
          @if (colours().length > 0) {
            <p class="section-label">
              Select colour <span class="count">// {{ colours().length }}</span>
            </p>
            <div class="spec-chips">
              @for (c of colours(); track c) {
                <button
                  class="spec-chip"
                  [class.active]="colour() === c"
                  [disabled]="colourSoldOut(c)"
                  (click)="colour.set(c)"
                >
                  {{ c }}
                </button>
              }
            </div>
          }

          <p class="section-label">Quantity</p>
          <span class="qty-stepper">
            <button type="button" (click)="bump(-1)">−</button>
            <input type="number" min="1" [(ngModel)]="quantity" aria-label="Quantity" />
            <button type="button" (click)="bump(1)">+</button>
          </span>

          <p class="cta-wrap">
            <button
              class="cta block"
              (click)="addToCart()"
              [disabled]="!selected() || selectedSoldOut()"
            >
              @if (!selected()) {
                This size/colour combination is unavailable
              } @else if (selectedSoldOut()) {
                Sold out: {{ selected()!.size }} / {{ selected()!.colour }}
              } @else if (selectedMadeToOrder()) {
                Order: made to your measurements
              } @else {
                Add to cart: ₦{{ currentPrice() * quantity | number: '1.0-2' }}
              }
            </button>
          </p>
          @if (selectedMadeToOrder()) {
            <p class="muted small">
              Cut in the Aba atelier after your order, allow a 3-week lead time. Custom pieces are
              excluded from the 12-hour returns window.
            </p>
          }
          @if (added()) {
            <p class="success">Added: <a routerLink="/cart">view cart</a> or keep browsing.</p>
          }

          <p class="section-label">
            Reviews <span class="count">[{{ reviews().length | number: '2.0' }}]</span>
          </p>
@if (reviews().length === 0) {
              <p class="muted small">{{ noReviewsCopy }}</p>
            }
          @for (r of reviews(); track $index) {
            <div class="review">
              <span class="stars">{{ '★'.repeat(r.rating) }}{{ '☆'.repeat(5 - r.rating) }}</span>
              <p>{{ r.comment }}</p>
            </div>
          }
        </div>
      </article>
    } @else if (loadError()) {
      <p class="muted">
        That piece could not be loaded, it may have sold out.
        <a routerLink="/shop">Back to the shop</a>
      </p>
    } @else {
      <div class="sk-face-pull" aria-hidden="true">
        <div class="skeleton sk-line w40"></div>
        <div class="skeleton sk-line w80"></div>
        <div class="skeleton sk-img"></div>
        <div class="skeleton sk-line"></div>
        <div class="skeleton sk-line w60"></div>
      </div>
    }
  `,
})
export class ProductPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly saleOver = signal(0);
  private readonly cart = inject(CartService);
  private readonly alerts = inject(BrandAlertService);

  readonly product = signal<Product | null>(null);
  /** Template-visible handle on the shared constant; see NO_REVIEWS_COPY. */
  readonly noReviewsCopy = NO_REVIEWS_COPY;
  readonly reviews = signal<Array<{ rating: number; comment: string | null }>>([]);
  readonly added = signal(false);
  readonly loadError = signal(false);
  readonly size = signal<string | null>(null);
  readonly colour = signal<string | null>(null);
  quantity = 1;

  readonly sizes = computed(() => [
    ...new Set((this.product()?.variants ?? []).map((v) => v.size).filter((s): s is string => !!s)),
  ]);
  readonly colours = computed(() => [
    ...new Set(
      (this.product()?.variants ?? []).map((v) => v.colour).filter((c): c is string => !!c),
    ),
  ]);

  /** The variant matching the chosen size+colour (dimensions without options are ignored). */
  readonly selected = computed<ProductVariant | null>(() => {
    const variants = this.product()?.variants ?? [];
    return (
      variants.find(
        (v) =>
          (this.sizes().length === 0 || v.size === this.size()) &&
          (this.colours().length === 0 || v.colour === this.colour()),
      ) ?? null
    );
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.product(id).subscribe({
      next: (p) => {
        this.product.set(p);
        const first = p.variants[0];
        this.size.set(first?.size ?? null);
        this.colour.set(first?.colour ?? null);
      },
      error: () => this.loadError.set(true),
    });
    this.api.reviews(id).subscribe((r) => this.reviews.set(r.data));
  }

  currentPrice(): number {
    return this.offer().price;
  }

  /** Price for the selected size/colour now, with the normal price and end
      time while a timed sale is running. */
  offer(): Offer {
    this.saleOver();
    const p = this.product();
    if (!p) return { price: 0, was: null, percent: null, endsAt: null };
    return offerFor(p, this.selected());
  }

  /** The countdown reached zero: re-price from the normal price. */
  saleEnded(): void {
    this.saleOver.update((n) => n + 1);
  }

  avgRating(): number {
    const rows = this.reviews();
    return rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0;
  }
  starString(avg: number): string {
    const full = Math.round(avg);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  /** A size is offered but gone when every variant carrying it is out of stock. */
  sizeSoldOut(size: string): boolean {
    const rows = (this.product()?.variants ?? []).filter((v) => v.size === size);
    return rows.length > 0 && rows.every((v) => v.availabilityStatus === 'out_of_stock');
  }
  colourSoldOut(colour: string): boolean {
    const rows = (this.product()?.variants ?? []).filter((v) => v.colour === colour);
    return rows.length > 0 && rows.every((v) => v.availabilityStatus === 'out_of_stock');
  }
  selectedSoldOut(): boolean {
    return this.selected()?.availabilityStatus === 'out_of_stock';
  }
  selectedMadeToOrder(): boolean {
    return this.selected()?.availabilityStatus === 'made_to_order';
  }

  bump(delta: number): void {
    this.quantity = Math.max(1, this.quantity + delta);
  }

  addToCart(): void {
    const p = this.product();
    const v = this.selected();
    if (!p || !v) return;
    this.cart.add(p, v, Math.max(1, this.quantity));
    this.added.set(true);
    void this.alerts.toast(`${p.name} added to cart`, {
      action: { label: 'View cart', run: () => void this.router.navigate(['/cart']) },
    });
  }
}
