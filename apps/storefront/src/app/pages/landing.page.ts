import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService, Product } from '../api.service';
import { ProductCardComponent } from '../product-card.component';

/** Curated order for the home category rail; anything unlisted sorts last. */
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

/**
 * Real product photography shipped in `public/assets/products`. Used only when a
 * variant carries no `imageUrl` of its own, so a card never renders empty and
 * never invents a product image.
 */
const PRODUCT_FALLBACKS = Array.from(
  { length: 15 },
  (_, i) => `assets/products/product_${String(i + 1).padStart(2, '0')}.png`,
);

interface Rating {
  avg: number;
  count: number;
}

interface RailCategory {
  name: string;
  label: string;
  count: number;
  image: string;
}

/**
 * Phase 2 home body, following the approved reference: a circular category rail,
 * a three-up New Arrivals row, and a three-up Best Sellers row. The dark header,
 * service row and bottom tab bar live in the shell (`MobileHeaderComponent` /
 * `MobileBottomNavComponent`), not here.
 *
 * Every tile is a projection of real catalogue data:
 *  - New Arrivals ranks on `createdAt`, which the API always sends.
 *  - Best Sellers shows the products the seller flagged `is_bestseller` -- the
 *    same merchandising label as the card badge. It is a label, not a computed
 *    sales figure; the storefront never shows a sales number except the real
 *    `soldCount` the backend derives from paid orders.
 *  - The category rail is built from the category values actually present in the
 *    catalogue, so it cannot advertise an audience (Men/Women/Children) that the
 *    flat `Product.category` string cannot prove.
 */
@Component({
  selector: 'app-landing',
  imports: [CommonModule, RouterLink, ProductCardComponent],
  template: `
    <div class="m-home">
      <section class="m-sec">
        <div class="m-sec__head">
          <h2>Shop by Category</h2>
          <a class="m-sec__more" routerLink="/shop"
            >See All <span class="m-chev" aria-hidden="true">›</span></a
          >
        </div>

        @if (categories().length > 0) {
          <div class="m-cats">
            @for (cat of categories(); track cat.name) {
              <a class="m-cat" [routerLink]="['/shop']" [queryParams]="{ category: cat.name }">
                <span class="m-cat__img" [style.background-image]="'url(' + cat.image + ')'"></span>
                <span class="m-cat__name">{{ cat.label }}</span>
              </a>
            }
          </div>
        } @else {
          <p class="m-empty">{{ loading() ? 'Loading categories…' : 'No categories yet.' }}</p>
        }
      </section>

      <section class="m-sec">
        <div class="m-sec__head">
          <h2>New Arrivals</h2>
          <a class="m-sec__more" routerLink="/shop"
            >See All <span class="m-chev" aria-hidden="true">›</span></a
          >
        </div>

        @if (newArrivals().length > 0) {
          <div class="m-row3">
            @for (p of newArrivals(); track p.id; let i = $index) {
              <app-product-card [product]="p" [index]="i" [rating]="ratingOf(p.id)" />
            }
          </div>
        } @else {
          <p class="m-empty">{{ loading() ? 'Loading new arrivals…' : 'Nothing new yet.' }}</p>
        }
      </section>

      <section class="m-sec">
        <div class="m-sec__head">
          <h2>Best Sellers</h2>
          <a class="m-sec__more" routerLink="/shop"
            >See All <span class="m-chev" aria-hidden="true">›</span></a
          >
        </div>

        @if (bestSellers().length > 0) {
          <div class="m-row3">
            @for (p of bestSellers(); track p.id; let i = $index) {
              <app-product-card [product]="p" [index]="i" [rating]="ratingOf(p.id)" />
            }
          </div>
        } @else {
          <p class="m-empty">
            {{
              loading()
                ? 'Loading best sellers…'
                : 'Nothing flagged yet — check back after the first drop.'
            }}
          </p>
        }
      </section>
    </div>
  `,
})
export class LandingPage implements OnInit {
  private readonly api = inject(ApiService);

  /** Full catalogue, straight from the API. Every rail below is a projection. */
  readonly all = signal<Product[]>([]);
  readonly ratings = signal<Map<string, Rating>>(new Map());
  readonly loading = signal(true);

  /** New Arrivals: newest first, three across to match the reference row. */
  readonly newArrivals = computed(() =>
    [...this.all()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3),
  );

  /**
   * The Best Sellers rail: products the seller flagged `isBestseller`,
   * three across to match New Arrivals.
   *
   * Membership is the merchandising flag (products.is_bestseller), not a
   * computed sales figure -- the same label as the badge on the card. Within
   * the rail the order still prefers real paid orders, then real review count,
   * then name, so genuinely popular products lead and the sort stays stable
   * across reloads. The card prints "(N)" only when a product has actual
   * sales, so the rail can never show a number it cannot evidence.
   */
  readonly bestSellers = computed(() => {
    const reviews = (p: Product): number => this.ratings().get(p.id)?.count ?? 0;
    return [...this.all()]
      .filter((p) => p.isBestseller)
      .sort(
        (a, b) =>
          this.soldOf(b) - this.soldOf(a) ||
          reviews(b) - reviews(a) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 3);
  });

  /** Orders that bought this product. Treated as unknown-but-zero when the field
   * is missing so an older API build degrades gracefully rather than inventing
   * numbers.
   */
  soldOf(product: Product): number {
    return product.soldCount ?? 0;
  }

  /** Category values actually present in the catalogue, with a real image each. */
  readonly categories = computed<RailCategory[]>(() => {
    const counts = new Map<string, { count: number; image: string }>();
    for (const p of this.all()) {
      const key = p.category ?? 'other';
      const cur = counts.get(key) ?? { count: 0, image: this.imageFor(p, 0) };
      cur.count += 1;
      counts.set(key, cur);
    }
    return [...counts.entries()]
      .sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a[0]);
        const ib = CATEGORY_ORDER.indexOf(b[0]);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]);
      })
      .map(([name, c]) => ({
        name,
        count: c.count,
        label: CATEGORY_LABELS[name] ?? name.replace(/^\w/, (ch) => ch.toUpperCase()),
        image: c.image,
      }));
  });

  ngOnInit(): void {
    this.api
      .products()
      .pipe(
        map((res) => res.data),
        catchError(() => of([] as Product[])),
      )
      .subscribe((products) => {
        this.all.set(products);
        this.loading.set(false);
        this.loadRatings(products);
      });
  }

  /**
   * The variant's own image when the API has one, otherwise a real catalogue
   * photo. Never a colour swatch or gradient standing in for a product.
   */
  imageFor(product: Product, index: number): string {
    return product.variants[0]?.imageUrl || PRODUCT_FALLBACKS[index % PRODUCT_FALLBACKS.length];
  }

  ratingOf(productId: string): Rating | null {
    return this.ratings().get(productId) ?? null;
  }

  /** Average + review count per product, from the public reviews endpoint. */
  private loadRatings(products: Product[]): void {
    if (products.length === 0) return;
    forkJoin(
      products.map((p) =>
        this.api.reviews(p.id).pipe(
          map((r) => ({ id: p.id, rows: r.data })),
          catchError(() =>
            of({ id: p.id, rows: [] as Array<{ rating: number; comment: string | null }> }),
          ),
        ),
      ),
    ).subscribe((results) => {
      const map = new Map<string, Rating>();
      for (const r of results) {
        if (r.rows.length === 0) continue;
        map.set(r.id, {
          avg: r.rows.reduce((s, x) => s + x.rating, 0) / r.rows.length,
          count: r.rows.length,
        });
      }
      this.ratings.set(map);
    });
  }
}