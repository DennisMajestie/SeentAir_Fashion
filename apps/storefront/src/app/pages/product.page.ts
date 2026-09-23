import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, Product, ProductVariant } from '../api.service';
import { CartService } from '../cart.service';

/** Product detail — Stitch PDP layout: gallery left; kicker, Anton title,
    price, spec-chip size/colour selectors, qty stepper, full-width acid CTA,
    reviews as a bordered log. */
@Component({
  selector: 'app-product',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    @if (product(); as p) {
      <article class="product-detail">
        <div class="thumb large">
          @if (selected()?.imageUrl) {
            <img [src]="selected()!.imageUrl!" [alt]="p.name" />
          } @else {
            <img src="assets/shop-2.jpg" [alt]="p.name" />
          }
        </div>
        <div class="detail-body">
          <p class="sku-line">{{ selected()?.sku || '—' }} // {{ p.category }}</p>
          <h1>{{ p.name }}</h1>
          @if (reviews().length > 0) {
            <p class="stars-line">
              <span class="stars">{{ starString(avgRating()) }}</span>
              <span class="muted small">{{ avgRating() | number: '1.1-1' }} · {{ reviews().length }} review(s)</span>
            </p>
          }
          <p class="price lg">₦{{ currentPrice() | number: '1.0-2' }}</p>
          <p class="muted">{{ p.description }}</p>

          @if (sizes().length > 0) {
            <p class="section-label">Select size <span class="count">// {{ sizes().length }}</span></p>
            <div class="spec-chips">
              @for (s of sizes(); track s) {
                <button class="spec-chip" [class.active]="size() === s"
                  [disabled]="sizeSoldOut(s)" (click)="size.set(s)">
                  {{ s }}@if (sizeSoldOut(s)) { <span class="chip-out">×</span> }
                </button>
              }
            </div>
          }
          @if (colours().length > 0) {
            <p class="section-label">Select colour <span class="count">// {{ colours().length }}</span></p>
            <div class="spec-chips">
              @for (c of colours(); track c) {
                <button class="spec-chip" [class.active]="colour() === c"
                  [disabled]="colourSoldOut(c)" (click)="colour.set(c)">{{ c }}</button>
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
            <button class="cta block" (click)="addToCart()"
              [disabled]="!selected() || selectedSoldOut()">
              @if (!selected()) { This size/colour combination is unavailable }
              @else if (selectedSoldOut()) { Sold out — {{ selected()!.size }} / {{ selected()!.colour }} }
              @else if (selectedMadeToOrder()) { Order — made to your measurements }
              @else { Add to cart — ₦{{ currentPrice() * quantity | number: '1.0-2' }} }
            </button>
          </p>
          @if (selectedMadeToOrder()) {
            <p class="muted small">Cut in the Yaba atelier after your order — allow a 3-week lead time.
              Custom pieces are excluded from the 12-hour returns window.</p>
          }
          @if (added()) {
            <p class="success">Added — <a routerLink="/cart">view cart</a> or keep browsing.</p>
          }

          <p class="section-label">Reviews <span class="count">[{{ reviews().length | number: '2.0' }}]</span></p>
          @if (reviews().length === 0) {
            <p class="muted small">No reviews yet — reviews open after delivery.</p>
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
      <p class="muted">That piece could not be loaded — it may have sold out. <a routerLink="/shop">Back to the shop</a></p>
    } @else {
      <p class="muted">Loading…</p>
    }
  `,
})
export class ProductPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly cart = inject(CartService);

  readonly product = signal<Product | null>(null);
  readonly reviews = signal<Array<{ rating: number; comment: string | null }>>([]);
  readonly added = signal(false);
  readonly loadError = signal(false);
  readonly size = signal<string | null>(null);
  readonly colour = signal<string | null>(null);
  quantity = 1;

  readonly sizes = computed(() =>
    [...new Set((this.product()?.variants ?? []).map((v) => v.size).filter((s): s is string => !!s))],
  );
  readonly colours = computed(() =>
    [...new Set((this.product()?.variants ?? []).map((v) => v.colour).filter((c): c is string => !!c))],
  );

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
    const p = this.product();
    if (!p) return 0;
    return this.selected()?.priceOverride ?? p.basePrice;
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
  }
}
