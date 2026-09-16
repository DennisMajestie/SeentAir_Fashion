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
          <p class="price" style="font-size:1.5rem">₦{{ currentPrice() | number: '1.0-2' }}</p>
          <p class="muted">{{ p.description }}</p>

          @if (sizes().length > 0) {
            <p class="section-label">Select size <span class="count">// {{ sizes().length }}</span></p>
            <div class="spec-chips">
              @for (s of sizes(); track s) {
                <button class="spec-chip" [class.active]="size() === s" (click)="size.set(s)">{{ s }}</button>
              }
            </div>
          }
          @if (colours().length > 0) {
            <p class="section-label">Select colour <span class="count">// {{ colours().length }}</span></p>
            <div class="spec-chips">
              @for (c of colours(); track c) {
                <button class="spec-chip" [class.active]="colour() === c" (click)="colour.set(c)">{{ c }}</button>
              }
            </div>
          }

          <p class="section-label">Quantity</p>
          <span class="qty-stepper">
            <button type="button" (click)="bump(-1)">−</button>
            <input type="number" min="1" [(ngModel)]="quantity" aria-label="Quantity" />
            <button type="button" (click)="bump(1)">+</button>
          </span>

          <p style="margin-top:1.4rem">
            <button class="cta" style="width:100%" (click)="addToCart()" [disabled]="!selected()">
              {{ selected() ? 'Add to cart — ₦' + (currentPrice() * quantity | number: '1.0-2') : 'This size/colour combination is unavailable' }}
            </button>
          </p>
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
    this.api.product(id).subscribe((p) => {
      this.product.set(p);
      const first = p.variants[0];
      this.size.set(first?.size ?? null);
      this.colour.set(first?.colour ?? null);
    });
    this.api.reviews(id).subscribe((r) => this.reviews.set(r.data));
  }

  currentPrice(): number {
    const p = this.product();
    if (!p) return 0;
    return this.selected()?.priceOverride ?? p.basePrice;
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
