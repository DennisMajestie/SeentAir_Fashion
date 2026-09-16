import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Product } from '../api.service';

/** Product discovery — Stitch "Product Discovery" layout: kicker + monumental
    title, mono search bar, category filter pills with counts, spec-card grid. */
@Component({
  selector: 'app-shop',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="shop-hero" style="background-image:url('assets/shop-0.jpg')">
      <div class="hero-body">
        <p class="page-kicker">Collection 04 / Lagos</p>
        <h1>Harmattan Drop</h1>
        <p>Heavyweight French terry, raw-edge seams, and dust-resistant tailoring engineered for dry season winds.</p>
      </div>
    </div>

    <input
      class="search-bar"
      type="search"
      placeholder="[ SEARCH PRODUCTS / SKU / FABRIC ]"
      [ngModel]="query()"
      (ngModelChange)="query.set($event)"
      aria-label="Search products"
    />

    <div class="pill-bar">
      <button class="pill" [class.active]="category() === null" (click)="category.set(null)">
        All products [{{ all().length | number: '2.0' }}]
      </button>
      @for (cat of categories(); track cat.name) {
        <button class="pill" [class.active]="category() === cat.name" (click)="category.set(cat.name)">
          {{ cat.name }} [{{ cat.count | number: '2.0' }}]
        </button>
      }
    </div>

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (filtered().length === 0) {
      <p class="muted">Nothing matches — clear the search or pick another category.</p>
    } @else {
      <div class="grid">
        @for (product of filtered(); track product.id; let i = $index) {
          <a class="card" [routerLink]="['/product', product.id]">
            <div class="thumb">
              <img
                [src]="product.variants[0]?.imageUrl || 'assets/' + fallback(i)"
                [alt]="product.name"
                loading="lazy"
              />
            </div>
            <div class="card-body">
              <p class="sku-line">{{ product.variants[0]?.sku || 'SPEC-' + (i + 1) }} // {{ product.variants.length }} variant(s)</p>
              <h3>{{ product.name }}</h3>
              <p class="category">{{ product.category }}</p>
              <p class="price">₦{{ product.basePrice | number: '1.0-2' }}</p>
            </div>
          </a>
        }
      </div>
    }
  `,
})
export class ShopPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly all = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly category = signal<string | null>(null);

  readonly categories = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.all()) {
      const c = p.category ?? 'other';
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  });

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.category();
    return this.all().filter((p) => {
      if (cat && (p.category ?? 'other') !== cat) return false;
      if (!q) return true;
      const haystack = [p.name, p.description ?? '', p.category ?? '', ...p.variants.map((v) => v.sku)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  });

  private readonly fallbacks = ['shop-1.jpg', 'shop-2.jpg', 'shop-3.jpg', 'shop-4.jpg', 'shop-5.jpg', 'shop-6.jpg'];

  ngOnInit(): void {
    this.api.products().subscribe({
      next: (res) => {
        this.all.set(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  fallback(index: number): string {
    return this.fallbacks[index % this.fallbacks.length];
  }
}
