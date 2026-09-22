import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService, Product, ProductVariant } from '../api.service';
import { CartService } from '../cart.service';

type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc';

/** Colour-name → swatch hex for the little dots on cards and filters. */
const SWATCHES: Record<string, string> = {
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

/** Product discovery: hero, search, category + collection pills, sort,
    size/colour filters, availability badges, review stars and quick-add. */
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

    @if (collections().length > 1) {
      <div class="pill-bar collection-bar">
        <span class="filter-label">Collection</span>
        <button class="pill" [class.active]="collection() === null" (click)="collection.set(null)">All</button>
        @for (c of collections(); track c) {
          <button class="pill" [class.active]="collection() === c" (click)="collection.set(c)">{{ c }}</button>
        }
      </div>
    }

    <div class="shop-toolbar">
      <div class="filter-group">
        <span class="filter-label">Size</span>
        @for (s of allSizes(); track s) {
          <button class="size-chip" [class.active]="size() === s"
            (click)="size.set(size() === s ? null : s)">{{ s }}</button>
        }
      </div>
      <div class="filter-group">
        <span class="filter-label">Colour</span>
        @for (c of allColours(); track c) {
          <button class="swatch-btn" [class.active]="colour() === c"
            [attr.aria-label]="'Filter by ' + c" [title]="c"
            (click)="colour.set(colour() === c ? null : c)">
            <span class="swatch" [style.background]="swatch(c)"></span>
          </button>
        }
      </div>
      <div class="toolbar-right">
        @if (hasFilters()) {
          <button class="link" (click)="clearFilters()">Clear filters</button>
        }
        <span class="result-count">{{ filtered().length }} piece(s)</span>
        <label class="sort-label">
          Sort
          <select [ngModel]="sort()" (ngModelChange)="sort.set($event)" aria-label="Sort products">
            <option value="featured">Featured</option>
            <option value="newest">Newest</option>
            <option value="price-asc">Price: low → high</option>
            <option value="price-desc">Price: high → low</option>
          </select>
        </label>
      </div>
    </div>

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (filtered().length === 0) {
      <p class="muted">Nothing matches — clear the search or filters.</p>
    } @else {
      <div class="grid">
        @for (product of filtered(); track product.id; let i = $index) {
          <div class="card product-card" [class.soldout]="isSoldOut(product)">
            <a class="thumb" [routerLink]="['/product', product.id]">
              <img
                [src]="product.variants[0]?.imageUrl || 'assets/' + fallback(i)"
                [alt]="product.name"
                loading="lazy"
              />
              @if (badge(product); as b) { <span class="badge" [class.badge-out]="b === 'Sold out'">{{ b }}</span> }
              @if (!isSoldOut(product)) {
                <button class="quickadd-btn" type="button"
                  (click)="$event.preventDefault(); $event.stopPropagation(); toggleQuickAdd(product)">
                  {{ quickAddId() === product.id ? 'Close' : '+ Quick add' }}
                </button>
              }
            </a>

            @if (quickAddId() === product.id) {
              <div class="quickadd-panel">
                @if (coloursOf(product).length > 1) {
                  <div class="qa-row">
                    @for (c of coloursOf(product); track c) {
                      <button class="swatch-btn" [class.active]="qaColour() === c" [title]="c"
                        (click)="qaColour.set(c)">
                        <span class="swatch" [style.background]="swatch(c)"></span>
                      </button>
                    }
                  </div>
                }
                <div class="qa-row">
                  @for (s of sizesOf(product); track s) {
                    <button class="size-chip"
                      [disabled]="!isBuyable(product, s, qaColour())"
                      (click)="quickAdd(product, s)">{{ s }}</button>
                  }
                </div>
              </div>
            }
            @if (addedId() === product.id) {
              <p class="qa-added">Added to cart ✓</p>
            }

            <a class="card-body" [routerLink]="['/product', product.id]">
              <h3>{{ product.name }}</h3>
              <div class="card-meta">
                <span class="dots">
                  @for (c of coloursOf(product).slice(0, 4); track c) {
                    <span class="swatch small" [style.background]="swatch(c)" [title]="c"></span>
                  }
                </span>
                <span class="muted small">{{ metaLine(product) }}</span>
              </div>
              <p class="price">₦{{ product.basePrice | number: '1.0-2' }}</p>
              @if (ratingOf(product.id); as r) {
                <p class="stars-line" [attr.aria-label]="r.avg + ' out of 5 from ' + r.count + ' reviews'">
                  <span class="stars">{{ starString(r.avg) }}</span>
                  <span class="muted small">{{ r.avg | number: '1.1-1' }} ({{ r.count }})</span>
                </p>
              }
            </a>
          </div>
        }
      </div>
    }
  `,
})
export class ShopPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly cart = inject(CartService);
  readonly all = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly category = signal<string | null>(null);
  readonly collection = signal<string | null>(null);
  readonly size = signal<string | null>(null);
  readonly colour = signal<string | null>(null);
  readonly sort = signal<SortKey>('featured');
  /** productId → average rating + review count (public reviews endpoint). */
  readonly ratings = signal<Map<string, { avg: number; count: number }>>(new Map());
  /** Quick-add: which card's panel is open, its colour, and the "Added" flash. */
  readonly quickAddId = signal<string | null>(null);
  readonly qaColour = signal<string | null>(null);
  readonly addedId = signal<string | null>(null);
  private addedTimer: ReturnType<typeof setTimeout> | undefined;

  readonly categories = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.all()) {
      const c = p.category ?? 'other';
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  });

  readonly collections = computed(() =>
    [...new Set(this.all().map((p) => p.collection?.name).filter((n): n is string => !!n))],
  );
  readonly allSizes = computed(() => {
    const order = ['S', 'M', 'L', 'XL', 'XXL', 'OS'];
    const set = new Set(
      this.all().flatMap((p) => p.variants.map((v) => v.size)).filter((s): s is string => !!s),
    );
    return [...set].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
  });
  readonly allColours = computed(() =>
    [...new Set(
      this.all().flatMap((p) => p.variants.map((v) => v.colour)).filter((c): c is string => !!c),
    )],
  );

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.category();
    const coll = this.collection();
    const size = this.size();
    const colour = this.colour();
    const rows = this.all().filter((p) => {
      if (cat && (p.category ?? 'other') !== cat) return false;
      if (coll && p.collection?.name !== coll) return false;
      if (size && !p.variants.some((v) => v.size === size)) return false;
      if (colour && !p.variants.some((v) => v.colour === colour)) return false;
      if (!q) return true;
      const haystack = [p.name, p.description ?? '', p.category ?? '', ...p.variants.map((v) => v.sku)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
    const key = this.sort();
    if (key === 'newest') {
      return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    if (key === 'price-asc') return [...rows].sort((a, b) => a.basePrice - b.basePrice);
    if (key === 'price-desc') return [...rows].sort((a, b) => b.basePrice - a.basePrice);
    return rows;
  });

  readonly hasFilters = computed(
    () => !!(this.category() || this.collection() || this.size() || this.colour() || this.query()),
  );

  private readonly fallbacks = ['shop-1.jpg', 'shop-2.jpg', 'shop-3.jpg', 'shop-5.jpg', 'shop-6.jpg'];

  ngOnInit(): void {
    this.api.products().subscribe({
      next: (res) => {
        this.all.set(res.data);
        this.loading.set(false);
        this.loadRatings(res.data);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Average rating per product from the public reviews endpoint. */
  private loadRatings(products: Product[]): void {
    if (products.length === 0) return;
    forkJoin(
      products.map((p) =>
        this.api.reviews(p.id).pipe(
          map((r) => ({ id: p.id, rows: r.data })),
          catchError(() => of({ id: p.id, rows: [] as Array<{ rating: number }> })),
        ),
      ),
    ).subscribe((results) => {
      const map = new Map<string, { avg: number; count: number }>();
      for (const r of results) {
        if (r.rows.length === 0) continue;
        const avg = r.rows.reduce((s, x) => s + x.rating, 0) / r.rows.length;
        map.set(r.id, { avg, count: r.rows.length });
      }
      this.ratings.set(map);
    });
  }

  // ---- card helpers ----
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
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      },
    );
  }
  metaLine(p: Product): string {
    const sizes = this.sizesOf(p);
    const colours = this.coloursOf(p);
    const sizePart =
      sizes.length === 0 ? '' :
      sizes.length === 1 && (sizes[0] === 'OS' || sizes[0] === 'Bespoke')
        ? (sizes[0] === 'OS' ? 'One size' : 'Made to measure')
        : `${sizes[0]}–${sizes[sizes.length - 1]}`;
    const colourPart = colours.length > 1 ? `${colours.length} colours` : '';
    return [sizePart, colourPart].filter(Boolean).join(' · ');
  }
  isSoldOut(p: Product): boolean {
    return p.variants.length > 0 && p.variants.every((v) => v.availabilityStatus === 'out_of_stock');
  }
  badge(p: Product): string | null {
    if (this.isSoldOut(p)) return 'Sold out';
    if (p.variants.some((v) => v.availabilityStatus === 'made_to_order')) return 'Made to order';
    const ageDays = (Date.now() - new Date(p.createdAt).getTime()) / 86_400_000;
    return ageDays <= 30 ? 'New' : null;
  }
  ratingOf(productId: string): { avg: number; count: number } | null {
    return this.ratings().get(productId) ?? null;
  }
  starString(avg: number): string {
    const full = Math.round(avg);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  // ---- quick add ----
  toggleQuickAdd(p: Product): void {
    if (this.quickAddId() === p.id) {
      this.quickAddId.set(null);
      return;
    }
    this.quickAddId.set(p.id);
    this.qaColour.set(this.coloursOf(p)[0] ?? null);
  }
  private variantFor(p: Product, size: string, colour: string | null): ProductVariant | null {
    return (
      p.variants.find(
        (v) => v.size === size && (colour === null || v.colour === colour),
      ) ?? null
    );
  }
  isBuyable(p: Product, size: string, colour: string | null): boolean {
    const v = this.variantFor(p, size, colour);
    return !!v && v.availabilityStatus !== 'out_of_stock';
  }
  quickAdd(p: Product, size: string): void {
    const v = this.variantFor(p, size, this.qaColour());
    if (!v || v.availabilityStatus === 'out_of_stock') return;
    this.cart.add(p, v, 1);
    this.quickAddId.set(null);
    this.addedId.set(p.id);
    clearTimeout(this.addedTimer);
    this.addedTimer = setTimeout(() => this.addedId.set(null), 1800);
  }
  clearFilters(): void {
    this.category.set(null);
    this.collection.set(null);
    this.size.set(null);
    this.colour.set(null);
    this.query.set('');
  }
}
