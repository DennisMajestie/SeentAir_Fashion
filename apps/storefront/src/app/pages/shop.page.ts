import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService, Product } from '../api.service';
import { FilterSheetComponent } from '../filter-sheet.component';
import { offerFor } from '../pricing';
import { PRODUCT_PLACEHOLDER, productImage } from '../product-image';
import { SeoService } from '../seo.service';
import { SWATCHES, ProductCardComponent } from '../product-card.component';
import {
  EMPTY_FILTERS,
  SheetFilters,
  activeFilterCount,
  matchesSheetFilters,
} from '../shop-filters';

type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'best-selling';

/** Curated category order for the shop pills, tailoring (custom-only) is
    deliberately last. Unknown categories fall through after these. */
const CATEGORY_ORDER = [
  'tops',
  'bottoms',
  'outerwear',
  'accessories',
  'tailoring',
  '2-Piece Sets',
  'T-Shirts',
  'Trousers',
  'Underwear',
  'Polo',
  'Children 2-Piece Sets',
];
const CATEGORY_LABELS: Record<string, string> = {
  tops: 'Tops',
  bottoms: 'Bottoms',
  outerwear: 'Outerwear',
  accessories: 'Accessories',
  tailoring: 'Tailoring',
  '2-Piece Sets': '2-Piece Sets',
  'T-Shirts': 'T-Shirts',
  Trousers: 'Trousers',
  Underwear: 'Underwear',
  Polo: 'Polo',
  'Children 2-Piece Sets': 'Children 2-Piece Sets',
};

const COLLECTION_ORDER = ['drop04harmattan', 'studioessentials', 'ateliercommission'];

/**
 * Rows fetched per page. The grid filters and sorts client-side over everything
 * it has loaded, so this trades a slightly slower first paint past 50 products
 * against a catalogue that is never silently truncated.
 */
const PAGE_SIZE = 50;

/** Normalise a collection name for deterministic ordering regardless of
    dash/space/typography variation (e.g. "Drop 04: Harmattan"). */
function collectionKey(name: string): string {
  return name.toLowerCase().replace(/[\s'’—–-]+/g, '');
}

/** Product discovery: search, circular sub-category rail, sort/filter toolbar
    with a grid/list toggle, size/colour filters, availability badges, real
    review stars and quick-add. */
@Component({
  selector: 'app-shop',
  imports: [CommonModule, FormsModule, ProductCardComponent, FilterSheetComponent],
  template: `
    <input
      class="search-bar"
      type="search"
      placeholder="Search for clothes, underwear, kids wear…"
      [ngModel]="query()"
      (ngModelChange)="query.set($event)"
      aria-label="Search products"
    />

    <!-- Reference PLP: circular sub-category rail above the sort/filter toolbar.
         Every pill is a real catalogue category with a real product photo, so no
         audience or sub-type is invented. Counts come from the loaded products. -->
    <div class="pill-bar pill-bar--circles">
      <button
        class="pill pill--circle pill--all"
        [class.active]="category() === null"
        (click)="selectCategory(null)"
        [attr.aria-pressed]="category() === null"
      >
        <span class="pill__img" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <rect x="4" y="4" width="7" height="7" rx="1.5" />
            <rect x="13" y="4" width="7" height="7" rx="1.5" />
            <rect x="4" y="13" width="7" height="7" rx="1.5" />
            <rect x="13" y="13" width="7" height="7" rx="1.5" />
          </svg>
        </span>
        <span class="pill__label">All</span>
      </button>
      @for (cat of categories(); track cat.name) {
        <button
          class="pill pill--circle"
          [class.active]="category() === cat.name"
          (click)="selectCategory(cat.name)"
          [attr.aria-pressed]="category() === cat.name"
        >
          <span
            class="pill__img"
            [style.background-image]="'url(' + categoryImage(cat.name) + ')'"
          ></span>
          <span class="pill__label">{{ cat.label }}</span>
        </button>
      }
    </div>

    <div class="shop-toolbar">
      <!-- Native select, styled as a toolbar button: a custom sort sheet would
           cost keyboard and screen-reader support for no visual gain. -->
      <label class="tbtn">
        <span>Sort by</span>
        <select [ngModel]="sort()" (ngModelChange)="sort.set($event)" aria-label="Sort products">
          <option value="featured">Featured</option>
          <option value="newest">Newest</option>
          <option value="price-asc">Price: low → high</option>
          <option value="price-desc">Price: high → low</option>
          <option value="best-selling">Best selling</option>
        </select>
        <svg class="tbtn__chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </label>

      <button
        class="tbtn"
        type="button"
        #filtersBtn
        [attr.aria-expanded]="sheetOpen()"
        aria-haspopup="dialog"
        (click)="openSheet()"
      >
        <!-- Funnel, drawn rather than typed: the old glyph had no face in most
             system fonts and fell back to a box or an arrow. -->
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 5h16l-6.2 7.4V18l-3.6 1.8v-7.4z" />
        </svg>
        <span>Filter</span>
        @if (activeFilters() > 0) {
          <span class="filters-badge">{{ activeFilters() }}</span>
        }
        <svg class="tbtn__chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div class="viewtoggle" role="group" aria-label="Result layout">
        <button
          type="button"
          class="vt-btn"
          [class.on]="view() === 'grid'"
          [attr.aria-pressed]="view() === 'grid'"
          (click)="view.set('grid')"
          aria-label="Two column grid"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="4" y="4" width="7" height="7" rx="1.5" />
            <rect x="13" y="4" width="7" height="7" rx="1.5" />
            <rect x="4" y="13" width="7" height="7" rx="1.5" />
            <rect x="13" y="13" width="7" height="7" rx="1.5" />
          </svg>
        </button>
        <button
          type="button"
          class="vt-btn"
          [class.on]="view() === 'list'"
          [attr.aria-pressed]="view() === 'list'"
          (click)="view.set('list')"
          aria-label="List view"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 7h14M5 12h14M5 17h14" />
          </svg>
        </button>
      </div>
    </div>

    <div class="shop-toolbar shop-toolbar--meta">
      @if (hasFilters()) {
        <button class="link" (click)="clearFilters()">Clear filters</button>
      }
      <span class="result-count">{{ filtered().length }} piece(s)</span>
    </div>

    @if (loading()) {
      <div class="grid" [class.grid--list]="view() === 'list'" aria-hidden="true">
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
      <div class="grid" [class.grid--list]="view() === 'list'">
        @for (product of filtered(); track product.id) {
          <app-product-card [product]="product" [rating]="ratingOf(product.id)" />
        }
      </div>

      <!-- Stated rather than hidden: the old single request capped the grid at
           50 rows with no sign anything was missing. -->
      @if (hasMore()) {
        <div class="shop-more">
          <p class="muted small">
            Showing {{ all().length | number }} of {{ total() | number }} products
          </p>
          <button
            type="button"
            class="cta ghost"
            [disabled]="loadingMore()"
            (click)="loadMore()"
          >
            {{ loadingMore() ? 'Loading…' : 'Load more' }}
          </button>
        </div>
      }
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly seo = inject(SeoService);
  private readonly filtersBtn = viewChild<ElementRef<HTMLButtonElement>>('filtersBtn');
  readonly all = signal<Product[]>([]);
  readonly loading = signal(true);
  /** Pages fetched so far, and the catalogue's real size, for "load more". */
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loadingMore = signal(false);
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
  /** Grid density. Grid is the reference default; list gives one piece per row. */
  readonly view = signal<'grid' | 'list'>('grid');
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
    // Sorted by what a shopper pays now, so a sale price takes its real place.
    const pay = (p: Product): number => offerFor(p).price;
    if (key === 'price-asc') return [...rows].sort((a, b) => pay(a) - pay(b));
    if (key === 'price-desc') return [...rows].sort((a, b) => pay(b) - pay(a));
    if (key === 'best-selling') {
      // Same real metric as the Best Sellers rail: paid orders, not review volume.
      return [...rows].sort(
        (a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0) || a.name.localeCompare(b.name),
      );
    }
    return rows;
  });

  readonly activeFilters = computed(() => activeFilterCount(this.appliedFilters()));
  readonly hasFilters = computed(
    () => this.activeFilters() > 0 || !!this.category() || !!this.query(),
  );

  /**
   * Circle image for a sub-category pill. The first real product in that
   * category, read through the shared productImage() hierarchy — a category
   * shows actual clothing when it can, and the one shared placeholder when it
   * cannot. Never a flat colour, and never a photo borrowed from another
   * product's grid position.
   */
  categoryImage(category: string): string {
    const found = this.all().find((p) => (p.category ?? 'other') === category);
    return found ? productImage(found) : PRODUCT_PLACEHOLDER;
  }

  openSheet(): void {
    this.sheetOpen.set(true);
  }

  /**
   * Picks a category from the rail and records it in the URL. The header title
   * on this screen is read from that query param, so without this the bar kept
   * naming the category the shopper arrived on, not the one they are viewing.
   */
  selectCategory(name: string | null): void {
    this.category.set(name);
    this.syncUrl();
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
        category: this.category(),
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
    // Followed, not read once: the list header takes its title from the same
    // query param, and a link to /shop while already here (menu, footer) reuses
    // this component, so a one-off snapshot would leave the grid on the old
    // category under a header that says "Shop".
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.category.set(params.get('category'));
        // The category is part of what this page is "about": a filtered listing
        // should not share a search-result title with the unfiltered one.
        const cat = params.get('category');
        this.seo.apply({
          title: cat ? `${cat} — Shop` : 'Shop all',
          description: cat
            ? `Shop ${cat} from Seentair Limited, cut and finished in our own factory.`
            : 'Browse the full Seentair Limited range: streetwear, underwear and kids pieces, cut and finished in our own factory.',
          type: 'website',
        });
      });
    this.loadPage(1);
  }

  /**
   * Fetch one page of the catalogue and append it.
   *
   * The grid used to call `products()` once, which silently capped the catalogue
   * at 50 rows — anything past that was unreachable with no indication that it
   * was missing. Filtering and sorting are client-side over the loaded set, so
   * the honest fix is to page in on demand and say how much is left, not to move
   * filtering server-side and change what each facet means.
   *
   * Appended rather than replaced, and a new category starts from page 1 again.
   */
  private loadPage(page: number): void {
    if (page === 1) {
      this.loading.set(true);
      this.page.set(1);
    } else {
      this.loadingMore.set(true);
    }
    this.api.products(page, PAGE_SIZE).subscribe({
      next: (res) => {
        this.total.set(res.total);
        if (page === 1) {
          this.all.set(res.data);
          this.loadRatings(res.data);
        } else {
          this.all.update((current) => {
            // Guard against a duplicate page if the button is double-clicked.
            const seen = new Set(current.map((p) => p.id));
            return [...current, ...res.data.filter((p) => !seen.has(p.id))];
          });
          this.page.set(page);
        }
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
      },
    });
  }

  /** True while the catalogue holds products the shopper has not loaded yet. */
  hasMore(): boolean {
    return this.all().length < this.total();
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadPage(this.page() + 1);
  }

  /**
   * Average rating per product, for the whole grid in one request.
   *
   * This used to forkJoin one `products/:id/reviews` call per card, so a
   * 50-product grid issued 50 extra requests before any price was visible.
   * The batched endpoint groups the averages in the database instead.
   *
   * A failure leaves the map empty, which renders as "reviews open after
   * delivery" — the same honest unrated state as a product with no reviews,
   * never as a fabricated zero.
   */
  private loadRatings(products: Product[]): void {
    if (products.length === 0) {
      this.ratings.set(new Map());
      return;
    }
    this.api
      .ratingSummaries(products.map((p) => p.id))
      .pipe(catchError(() => of([] as Array<{ productId: string; avg: number; count: number }>)))
      .subscribe((rows) => {
        this.ratings.set(new Map(rows.map((r) => [r.productId, { avg: r.avg, count: r.count }])));
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
