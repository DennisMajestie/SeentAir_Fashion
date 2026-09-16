import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, Product, ProductVariant } from '../api.service';
import { CartService } from '../cart.service';

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
            <span class="thumb-fallback">{{ p.name.charAt(0) }}</span>
          }
        </div>
        <div class="detail-body">
          <h1>{{ p.name }}</h1>
          <p class="category">{{ p.category }}</p>
          <p class="price">₦{{ currentPrice() | number: '1.0-2' }}</p>
          <p>{{ p.description }}</p>

          <label>
            Variant (size / colour)
            <select [ngModel]="selected()?.id" (ngModelChange)="selectVariant($event)">
              @for (v of p.variants; track v.id) {
                <option [value]="v.id">
                  {{ v.size || '—' }} / {{ v.colour || '—' }} ({{ v.sku }})
                </option>
              }
            </select>
          </label>

          <label>
            Quantity
            <input type="number" min="1" [(ngModel)]="quantity" />
          </label>

          <button class="cta" (click)="addToCart()" [disabled]="!selected()">
            Add to cart
          </button>
          @if (added()) {
            <p class="success">Added — <a routerLink="/cart">view cart</a></p>
          }

          @if (reviews().length > 0) {
            <section class="reviews">
              <h2>Reviews</h2>
              @for (r of reviews(); track $index) {
                <div class="review">
                  <span class="stars">{{ '★'.repeat(r.rating) }}{{ '☆'.repeat(5 - r.rating) }}</span>
                  <p>{{ r.comment }}</p>
                </div>
              }
            </section>
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
  readonly selected = signal<ProductVariant | null>(null);
  readonly reviews = signal<Array<{ rating: number; comment: string | null }>>([]);
  readonly added = signal(false);
  quantity = 1;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.product(id).subscribe((p) => {
      this.product.set(p);
      this.selected.set(p.variants[0] ?? null);
    });
    this.api.reviews(id).subscribe((r) => this.reviews.set(r.data));
  }

  selectVariant(variantId: string): void {
    const variant = this.product()?.variants.find((v) => v.id === variantId) ?? null;
    this.selected.set(variant);
  }

  currentPrice(): number {
    const p = this.product();
    if (!p) return 0;
    return this.selected()?.priceOverride ?? p.basePrice;
  }

  addToCart(): void {
    const p = this.product();
    const v = this.selected();
    if (!p || !v) return;
    this.cart.add(p, v, Math.max(1, this.quantity));
    this.added.set(true);
  }
}
