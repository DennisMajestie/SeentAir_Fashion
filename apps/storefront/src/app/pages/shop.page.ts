import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService, Product } from '../api.service';

import { offerFor } from '../pricing';
import { PRODUCT_PLACEHOLDER, productImage } from '../product-image';
import { SeoService } from '../seo.service';
import { CatalogueSearchService } from '../catalogue-search.service';
import { InfiniteScrollDirective } from '../infinite-scroll.directive';
import { SWATCHES, ProductCardComponent } from '../product-card.component';

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
  imports: [CommonModule, ProductCardComponent, InfiniteScrollDirective],
  template: `
    <!-- Not an immersive route: the site header (cart/account/search) comes from
         the shell, so this page renders neither its own compact back-header nor a
         second search field. Those two used to sit here; with the real header in
         place they became duplicates -- the header input drove
         CatalogueSearchService, the page input drove this grid, and neither knew
         about the other. The grid now reads the header's term (see query). -->
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
      <div class="shop-empty">
        <p class="muted">Nothing matches what you are looking for.</p>
        @if (category() || query()) {
          <button type="button" class="link" (click)="clearFilters()">Clear search</button>
        }
      </div>
    } @else {
      <div class="grid">
        @for (product of filtered(); track product.id) {
          <app-product-card [product]="product" [rating]="ratingOf(product.id)" />
        }
      </div>

      <!-- Endless scroll: the sentinel below loads the next page as it comes
           into reach, so the row count stays stated but the paging control
           itself disappears. It is held back while a page is in flight and
           mounted again when it lands, which re-arms the fetch automatically. -->
      @if (hasMore()) {
        <div class="shop-more">
          <p class="muted small">
            Showing {{ all().length | number }} of {{ total() | number }} products
          </p>
          @if (loadingMore()) {
            <p class="muted small" role="status" aria-live="polite">Loading more…</p>
          } @else {
            <div
              class="shop-sentinel"
              appInfiniteScroll
              (nearEnd)="loadMore()"
              aria-hidden="true"
            ></div>
          }
        </div>
      }
    }


  `,
})
export class ShopPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly seo = inject(SeoService);
  private readonly search = inject(CatalogueSearchService);
  readonly all = signal<Product[]>([]);
  readonly loading = signal(true);
  /** Pages fetched so far, and the catalogue's real size, for "load more". */
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loadingMore = signal(false);
  readonly skCards = Array.from({ length: 8 }, (_, i) => i);
  /** The grid's free-text filter. Aliased to the header's search term rather than
   *  kept as a second signal: this page used to own a search field, but once it
   *  kept the real header that left two identical inputs filtering two different
   *  things. One term now drives the header dropdown and the grid together, and
   *  because the header input is always visible the term is never hidden. */
  readonly query = this.search.term;
  readonly category = signal<string | null>(null);
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

  /**
   * Picks a category from the rail and records it in the URL.
   */
  selectCategory(name: string | null): void {
    this.category.set(name);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        category: name,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  ngOnInit(): void {
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
  /** Clears the category and the search. */
  clearFilters(): void {
    this.category.set(null);
    this.query.set('');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { category: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
