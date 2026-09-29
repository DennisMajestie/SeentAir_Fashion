import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService, Product } from '../api.service';
import { FilterSheetComponent } from '../filter-sheet.component';
import { SWATCHES, ProductCardComponent } from '../product-card.component';
import {
  EMPTY_FILTERS,
  SheetFilters,
  activeFilterCount,
  matchesSheetFilters,
} from '../shop-filters';

type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc';

/** Curated category order for the shop pills, tailoring (custom-only) is
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
    dash/space/typography variation (e.g. "Drop 04: Harmattan"). */
function collectionKey(name: string): string {
  return name.toLowerCase().replace(/[\s'’—–-]+/g, '');
}

/** Product discovery: hero, search, category + collection pills, sort,
    size/colour filters, availability badges, review stars and quick-add. */
@Component({
  selector: 'app-shop',
  imports: [CommonModule, FormsModule, ProductCardComponent, FilterSheetComponent],
  template: `
    <input
      class="search-bar"
      type="search"
      placeholder="[ SEARCH PRODUCTS / SKU / FABRIC ]"
      [ngModel]="query()"
      (ngModelChange)="query.set($event)"
      aria-label="Search products"
    />

    <div class="shop-hero" style="background-image:url('assets/shop-0.jpg')">
      <div class="hero-body">
        <p class="page-kicker">Collection 04 / Aba</p>
        <h1>Harmattan Drop</h1>
        <p>
          Heavyweight French terry, raw-edge seams, and dust-resistant tailoring engineered for dry
          season winds.
        </p>
      </div>
    </div>

    <div class="pill-bar">
      <button class="pill" [class.active]="category() === null" (click)="category.set(null)">
        All products [{{ all().length | number: '2.0' }}]
      </button>
      @for (cat of categories(); track cat.name) {
        <button
          class="pill"
          [class.active]="category() === cat.name"
          (click)="category.set(cat.name)"
        >
          {{ cat.label }} [{{ cat.count | number: '2.0' }}]
        </button>
      }
    </div>

    <div class="shop-toolbar">
      <button
        class="cta small ghost filters-btn"
        type="button"
        #filtersBtn
        [attr.aria-expanded]="sheetOpen()"
        aria-haspopup="dialog"
        (click)="openSheet()"
      >
        Filters
        @if (activeFilters() > 0) {
          <span class="filters-badge">{{ activeFilters() }}</span>
        }
      </button>
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
      <p class="muted">Nothing matches: clear the search or filters.</p>
    } @else {
      <div class="grid">
        @for (product of filtered(); track product.id; let i = $index) {
          <app-product-card [product]="product" [index]="i" [rating]="ratingOf(product.id)" />
        }
      </div>
    }

    <!-- Created on first open, not on page load, so it never competes with the
         product grid's first paint. -->
    @if (sheetOpen()) {
      <app-filter-sheet
        [products]="all()"
        [applied]="appliedFilters()"
        (apply)="applyFilters($event)"
        (dismiss)="closeSheet()"
      />
    }
  `,
})
export class ShopPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly filtersBtn = viewChild<ElementRef<HTMLButtonElement>>('filtersBtn');
  readonly all = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly skCards = Array.from({ length: 8 }, (_, i) => i);
  readonly query = signal('');
  readonly category = signal<string | null>(null);
  /** What the grid is showing. The sheet edits a copy and only commits on apply. */
  readonly appliedFilters = signal<SheetFilters>({ ...EMPTY_FILTERS });
  /** Mounted on first open only, so the sheet never competes with the grid's first paint. */
  readonly sheetOpen = signal(false);
  readonly collection = computed(() => this.appliedFilters().collection);
  readonly size = computed(() => this.appliedFilters().size);
  readonly colour = computed(() => this.appliedFilters().colour);
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
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    return names.map((name) => ({
      name,
      count: counts.get(name) ?? 0,
      label: CATEGORY_LABELS[name] ?? name.replace(/^\w/, (c) => c.toUpperCase()),
    }));
  });

  readonly collections = computed(() => {
    const names = [
      ...new Set(
        this.all()
          .map((p) => p.collection?.name)
          .filter((n): n is string => !!n),
      ),
    ].sort((a, b) => {
      const ia = COLLECTION_ORDER.indexOf(collectionKey(a));
      const ib = COLLECTION_ORDER.indexOf(collectionKey(b));
      return (
        (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || collectionKey(a).localeCompare(collectionKey(b))
      );
    });
    return names;
  });
  readonly allSizes = computed(() => {
    const order = ['S', 'M', 'L', 'XL', 'XXL', 'OS'];
    const set = new Set(
      this.all()
        .flatMap((p) => p.variants.map((v) => v.size))
        .filter((s): s is string => !!s),
    );
    return [...set].sort((a, b) => {
      const ia = order.indexOf(a),
        ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
  });
  readonly allColours = computed(() => [
    ...new Set(
      this.all()
        .flatMap((p) => p.variants.map((v) => v.colour))
        .filter((c): c is string => !!c),
    ),
  ]);

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.category();
    const rows = this.all().filter((p) => {
      if (cat && (p.category ?? 'other') !== cat) return false;
      // One predicate shared with the sheet's count, so the number on
      // "Show N pieces" and what the grid renders cannot drift apart.
      if (!matchesSheetFilters(p, this.appliedFilters())) return false;
      if (!q) return true;
      const haystack = [
        p.name,
        p.description ?? '',
        p.category ?? '',
        ...p.variants.map((v) => v.sku),
      ]
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

  readonly activeFilters = computed(() => activeFilterCount(this.appliedFilters()));
  readonly hasFilters = computed(
    () => this.activeFilters() > 0 || !!this.category() || !!this.query(),
  );

  private readonly fallbacks = [
    'shop-1.jpg',
    'shop-2.jpg',
    'shop-3.jpg',
    'shop-5.jpg',
    'shop-6.jpg',
  ];

  openSheet(): void {
    this.sheetOpen.set(true);
  }

  /** Dismiss discards pending changes: the applied set is never touched here. */
  closeSheet(): void {
    this.sheetOpen.set(false);
    this.filtersBtn()?.nativeElement.focus();
  }

  /**
   * Commit the sheet's pending selection: the grid moves, the URL records it,
   * and the customer is put back at the top of the results they just asked for.
   */
  applyFilters(next: SheetFilters): void {
    this.appliedFilters.set(next);
    this.syncUrl();
    this.closeSheet();
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: this.reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  /** Applied filters are shareable, so they live in the query string. Pending never does. */
  private syncUrl(): void {
    const f = this.appliedFilters();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        size: f.size ?? null,
        colour: f.colour ?? null,
        collection: f.collection ?? null,
        maxPrice: f.maxPrice ?? null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private reducedMotion(): boolean {
    return (
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    const price = q.get('maxPrice');
    this.appliedFilters.set({
      size: q.get('size') ?? null,
      colour: q.get('colour') ?? null,
      collection: q.get('collection') ?? null,
      maxPrice: price === null || price === undefined ? null : Number(price),
    });
    const fromQuery = q.get('category');
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
  /** The toolbar's own reset: clears the applied set, the category and the search. */
  clearFilters(): void {
    this.category.set(null);
    this.query.set('');
    this.appliedFilters.set({ ...EMPTY_FILTERS });
    this.syncUrl();
  }
}
