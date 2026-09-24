import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService, Product } from '../api.service';
import { SWATCHES, ProductCardComponent } from '../product-card.component';

type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc';

/** Curated category order for the shop pills — tailoring (custom-only) is
    deliberately last. Unknown categories fall through after these. */
const CATEGORY_ORDER = ['tops', 'bottoms', 'outerwear', 'accessories', 'tailoring'];
const CATEGORY_LABELS: Record<string, string> = {
  tops: 'Tops',
  bottoms: 'Bottoms',
  outerwear: 'Outerwear',
  accessories: 'Accessories',
  tailoring: 'Tailoring',
};

const COLLECTION_ORDER = ['drop04harmattan', 'studioessentials', 'ateliercommission'];

/** Normalise a collection name for deterministic ordering regardless of
    dash/space/typography variation (e.g. "Drop 04 — Harmattan"). */
function collectionKey(name: string): string {
  return name.toLowerCase().replace(/[\s'’—–-]+/g, '');
}

/** Product discovery: hero, search, category + collection pills, sort,
    size/colour filters, availability badges, review stars and quick-add. */
@Component({
  selector: 'app-shop',
  imports: [CommonModule, FormsModule, ProductCardComponent],
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
          {{ cat.label }} [{{ cat.count | number: '2.0' }}]
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
      <div class="grid" aria-hidden="true">
        @for (g of skCards; track g) {
          <div class="sk-card">
            <div class="skeleton sk-img"></div>
            <div class="skeleton sk-line w60"></div>
            <div class="skeleton sk-line w40"></div>
            <div class="skeleton sk-line w80"></div>
          </div>
        }
      </div>
    } @else if (filtered().length === 0) {
      <p class="muted">Nothing matches — clear the search or filters.</p>
    } @else {
      <div class="grid">
        @for (product of filtered(); track product.id; let i = $index) {
          <app-product-card [product]="product" [index]="i" [rating]="ratingOf(product.id)" />
        }
      </div>
    }
  `,
})
export class ShopPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly all = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly skCards = Array.from({ length: 8 }, (_, i) => i);
  readonly query = signal('');
  readonly category = signal<string | null>(null);
  readonly collection = signal<string | null>(null);
  readonly size = signal<string | null>(null);
  readonly colour = signal<string | null>(null);
  readonly sort = signal<SortKey>('featured');
  /** productId → average rating + review count (public reviews endpoint). */
  readonly ratings = signal<Map<string, { avg: number; count: number }>>(new Map());

  readonly categories = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.all()) {
      const c = p.category ?? 'other';
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const names = [...counts.keys()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return ((ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)) || a.localeCompare(b);
    });
    return names.map((name) => ({
      name,
      count: counts.get(name) ?? 0,
      label: CATEGORY_LABELS[name] ?? name.replace(/^\w/, (c) => c.toUpperCase()),
    }));
  });

  readonly collections = computed(() => {
    const names = [
      ...new Set(this.all().map((p) => p.collection?.name).filter((n): n is string => !!n)),
    ].sort((a, b) => {
      const ia = COLLECTION_ORDER.indexOf(collectionKey(a));
      const ib = COLLECTION_ORDER.indexOf(collectionKey(b));
      return ((ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)) || collectionKey(a).localeCompare(collectionKey(b));
    });
    return names;
  });
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
    const fromQuery = this.route.snapshot.queryParamMap.get('category');
    if (fromQuery) this.category.set(fromQuery);
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

  // ---- filter UI helper ----
  swatch(colour: string): string {
    return SWATCHES[colour.toLowerCase()] ?? '#8a8378';
  }
  ratingOf(productId: string): { avg: number; count: number } | null {
    return this.ratings().get(productId) ?? null;
  }
  clearFilters(): void {
    this.category.set(null);
    this.collection.set(null);
    this.size.set(null);
    this.colour.set(null);
    this.query.set('');
  }
}
