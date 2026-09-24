import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Pricing, PricingProduct } from '../api.service';
import { CartService } from '../cart.service';

/**
 * W3 — Catalogue with tiered pricing. MOQ policy banner, SKU search,
 * category chips, product cards (tier matrix + per-variant unit steppers,
 * add-to-bulk-order) and the sticky draft-batch allocation bar.
 * MOQ is enforced server-side too.
 */
@Component({
  selector: 'app-catalogue',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    @if (needsAccount()) {
      <!-- Pre-approval apply flow (kept from the live baseline; W1 routes buyers here) -->
      <section class="panel">
        <div class="tagbar"><span>Wholesale account required</span><span>B2B</span></div>
        <p class="apply-copy">
          Wholesale ordering needs an approved account (minimum order quantity applies).
          Apply below — our team reviews applications and assigns your price tier.
        </p>
        <button class="cta" (click)="apply()" [disabled]="applied()">
          {{ applied() ? 'Application submitted — pending review' : 'Apply for a wholesale account' }}
        </button>
        @if (error()) { <p class="error">{{ error() }}</p> }
      </section>
    } @else if (pricing(); as p) {
      <div class="policy-strip" style="margin-top: var(--space-md)">
        <span class="material-symbols-outlined" aria-hidden="true">inventory</span>
        <div style="flex:1">
          <strong>MOQ threshold policy</strong>
          Minimum Order Quantity: {{ p.moq }} units across the catalogue.
          Mix &amp; match sizes and colours accepted.
        </div>
        <span class="chip soft">{{ p.tier?.name ?? 'Standard tier' }}</span>
      </div>

      <div class="search-row">
        <div class="search-box">
          <span class="material-symbols-outlined" aria-hidden="true">search</span>
          <input type="search" [(ngModel)]="query" name="q"
            placeholder="Search SKU, garment silhouette, fabric spec…" aria-label="Search catalogue" />
        </div>
      </div>

      <div class="filter-chips" role="tablist" aria-label="Categories">
        <button [class.active]="category() === null" (click)="category.set(null)">
          All garments <span class="n">{{ p.data.length }}</span>
        </button>
        @for (cat of categories(); track cat.name) {
          <button [class.active]="category() === cat.name" (click)="category.set(cat.name)">
            {{ cat.name }} <span class="n">{{ cat.count }}</span>
          </button>
        }
      </div>

      @for (product of filtered(); track product.id) {
        <article class="prodcard">
          <div class="pc-head">
            <span>SKU: {{ product.variants[0]?.sku ?? product.id.slice(0, 8) }}</span>
            <span class="tag">{{ product.category ?? 'garment' }}</span>
          </div>
          <h2>{{ product.name }}</h2>
          <div class="pc-price">
            <span class="lbl">Wholesale:</span>
            <strong>₦{{ product.wholesalePrice | number: '1.0-2' }}</strong>
            <s>₦{{ product.retailPrice | number: '1.0-2' }}</s>
            <span class="margin">-{{ marginPct(product) }}% vs retail</span>
          </div>

          <div class="scroll-hint" style="margin-top: var(--space-sm)">
            <span>Volume tier matrix</span>
            <span>Seentair Factory — Aba</span>
          </div>
          <!-- GAP: single-tier ladder only — multi-band volume prices (20-49 / 50-99 / 100+)
               await tier criteria resolution (Open Question #2). The third box routes to the
               desk instead of inventing a price. -->
          <div class="tier-boxes">
            <div class="tb">
              <span class="t-range">Retail list</span>
              <span class="t-price">₦{{ product.retailPrice | number: '1.0-0' }}</span>
              <span class="t-note">Base</span>
            </div>
            <div class="tb mine">
              <span class="t-range">{{ p.moq }}+ units</span>
              <span class="t-price">₦{{ product.wholesalePrice | number: '1.0-0' }}</span>
              <span class="t-note">Your tier</span>
            </div>
            <div class="tb">
              <span class="t-range">100+ units</span>
              <span class="t-price">Desk quote</span>
              <span class="t-note">Call hub</span>
            </div>
          </div>

          <!-- GAP: no live stock-count endpoint for wholesale buyers yet — availability
               figures from the reference are omitted rather than invented. -->
          <div class="pc-stock">
            <span>Cut &amp; sewn at the Aba factory</span>
            <span>GIGL dispatch</span>
          </div>

          <div class="size-row-head">
            <span>Select units by size / colour</span>
            <a class="link" [routerLink]="['/catalogue', product.id, 'matrix']">Full matrix</a>
          </div>
          <div class="size-grid">
            @for (v of quickVariants(product); track v.id) {
              <div class="sz">
                <span class="s-l" [title]="v.size + ' / ' + v.colour">{{ v.size || 'OS' }} · {{ v.colour }}</span>
                <input type="number" min="0" [(ngModel)]="quantities[v.id]"
                  [attr.aria-label]="product.name + ' ' + v.size + ' ' + v.colour" />
              </div>
            }
          </div>
          @if (product.variants.length > quickLimit) {
            <p class="muted small" style="margin: var(--space-xs) 0 0">
              +{{ product.variants.length - quickLimit }} more colourways in the
              <a class="link" [routerLink]="['/catalogue', product.id, 'matrix']">bulk matrix</a>.
            </p>
          }

          <button class="cta pc-cta" (click)="addToOrder(product)" [disabled]="productUnits(product) === 0">
            <span class="material-symbols-outlined" aria-hidden="true">factory</span>
            <span>Add to bulk order</span>
            <span class="count">{{ productUnits(product) }} pcs</span>
          </button>
        </article>
      }
      @if (filtered().length === 0) {
        <p class="muted">No garments match “{{ query }}”.</p>
      }

      @if (cart.units() > 0) {
        <div class="draft-bar">
          <div class="db-left">
            <span class="db-units">{{ cart.units() }}</span>
            <div>
              <span class="db-label">Draft batch allocation</span>
              <span class="db-amount">₦{{ cart.amount() | number: '1.0-2' }}</span>
            </div>
          </div>
          <a class="cta small" routerLink="/cart">Review order
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>
        </div>
      }
      @if (message()) { <p class="success">{{ message() }}</p> }
      @if (error()) { <p class="error">{{ error() }}</p> }
    } @else {
      <p class="muted">Loading catalogue…</p>
    }
  `,
})
export class CataloguePage implements OnInit {
  private readonly api = inject(ApiService);
  readonly cart = inject(CartService);
  readonly pricing = signal<Pricing | null>(null);
  readonly needsAccount = signal(false);
  readonly applied = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly category = signal<string | null>(null);
  readonly quickLimit = 6;
  query = '';
  quantities: Record<string, number> = {};

  readonly categories = computed(() => {
    const counts = new Map<string, number>();
    for (const product of this.pricing()?.data ?? []) {
      const c = product.category ?? 'other';
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  });

  ngOnInit(): void {
    this.api.pricing().subscribe({
      next: (p) => this.pricing.set(p),
      error: () => this.needsAccount.set(true),
    });
  }

  filtered(): PricingProduct[] {
    const q = this.query.trim().toLowerCase();
    return (this.pricing()?.data ?? []).filter((product) => {
      if (this.category() && (product.category ?? 'other') !== this.category()) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        (product.category ?? '').toLowerCase().includes(q) ||
        product.variants.some((v) => v.sku.toLowerCase().includes(q))
      );
    });
  }

  quickVariants(product: PricingProduct) {
    return product.variants.slice(0, this.quickLimit);
  }

  marginPct(product: PricingProduct): number {
    if (!product.retailPrice) return 0;
    return Math.round((1 - product.wholesalePrice / product.retailPrice) * 1000) / 10;
  }

  productUnits(product: PricingProduct): number {
    return product.variants.reduce((n, v) => n + (this.quantities[v.id] || 0), 0);
  }

  apply(): void {
    this.error.set(null);
    this.api.applyForAccount().subscribe({
      next: () => this.applied.set(true),
      error: (err) => this.error.set(err?.error?.message ?? 'Application failed.'),
    });
  }

  addToOrder(product: PricingProduct): void {
    const lines = product.variants
      .filter((v) => (this.quantities[v.id] || 0) > 0)
      .map((v) => ({
        variantId: v.id,
        productId: product.id,
        productName: product.name,
        sku: v.sku,
        size: v.size,
        colour: v.colour,
        unitPrice: v.wholesalePrice,
        quantity: this.quantities[v.id] || 0,
      }));
    this.cart.add(lines);
    for (const v of product.variants) this.quantities[v.id] = 0;
    this.message.set(`${product.name} added to the draft batch — review the order below.`);
  }
}
