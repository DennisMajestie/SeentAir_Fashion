import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageTitleService } from '../page-title.service';
import { EMPTY, Observable, forkJoin, of } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { Offer, offerFor } from '../pricing';
import { SaleCountdownComponent } from '../sale-countdown.component';
import { ApiService, Product, ProductVariant } from '../api.service';
import { PRODUCT_PLACEHOLDER } from '../product-image';
import { BrandAlertService } from '../brand-alert.service';
import { CartService } from '../cart.service';
import { NO_REVIEWS_COPY, ProductCardComponent } from '../product-card.component';
import { SeoService } from '../seo.service';
import { WishlistService } from '../wishlist.service';

/** One photo in the gallery, with the colour it belongs to. */
interface GalleryShot {
  src: string;
  /** The colour this photo shows, or null when it is the generic product shot. */
  colour: string | null;
}

/**
 * Product detail.
 *
 * Mobile is the reference layout and is the single column the design was drawn
 * as: compact header, full-bleed swipeable gallery, title and rating, a price
 * card, the variant pickers, then a sticky purchase bar. Desktop widens the
 * same markup rather than swapping in a second template, so there is one page
 * to keep correct.
 *
 * Everything the reference shows that this catalogue cannot honestly supply is
 * absent rather than faked: there is no promo label, no coin discount, no
 * "sold" claim beyond the real `soldCount`, no delivery estimate and no
 * returns row. `soldCount` is real and is shown when present.
 */
@Component({
  selector: 'app-product',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    SaleCountdownComponent,
    ProductCardComponent,
  ],
  template: `
    @if (product(); as p) {
      <!-- No app-back-header here: the PDP is not an immersive route any more, so
           the site header (with its own back affordance) frames the page. -->

      <!-- Gallery. Full-bleed, one photo at a time, swiped with a finger. -->
      <div class="p-gal">
        <!-- Desktop thumbnail rail. Hidden below 900px, where the same photos are
             a horizontal swipe instead (see .p-gal__track). Rail, swipe track and
             desktop main image all read the same shotIndex, so the photo on
             screen is the same whichever one the shopper drives. -->
        <div class="p-gal__strip" role="group" aria-label="Product photos">
          @for (shot of gallery(); track $index; let i = $index) {
            <button
              class="p-gal__thumb"
              type="button"
              [class.is-active]="i === shotIndex()"
              [attr.aria-current]="i === shotIndex() ? 'true' : null"
              [attr.aria-label]="'Show image ' + (i + 1) + ' of ' + gallery().length"
              (click)="showShot(i)"
              (mouseenter)="showShot(i)"
            >
              <img [src]="shot.src" alt="" loading="lazy" decoding="async" />
            </button>
          }
        </div>

        <!-- Desktop main image: one at a time, driven by the rail. The track
             below is the mobile affordance and is hidden at desktop. -->
        <div class="p-gal__main">
          @if (gallery()[shotIndex()]; as shot) {
            <img
              class="p-gal__img"
              [src]="shot.src"
              [alt]="shotIndex() === 0 ? p.name : p.name + ' photo ' + (shotIndex() + 1)"
              decoding="async"
              (error)="onImageError($event)"
            />
          }
        </div>

        <div
          class="p-gal__track"
          #track
          (scroll)="onScroll($event)"
          tabindex="0"
          role="group"
          aria-label="Product photos"
        >
          @for (shot of gallery(); track $index; let i = $index) {
            <div class="p-gal__cell">
              <img
                class="p-gal__img"
                [src]="shot.src"
                [alt]="i === 0 ? p.name : p.name + ' photo ' + (i + 1)"
                [loading]="i === 0 ? 'eager' : 'lazy'"
                decoding="async"
                (error)="onImageError($event)"
              />
            </div>
          }
        </div>

        <span class="p-gal__pill" aria-live="polite">{{ galleryLabel() }}</span>

        <button
          class="p-gal__fav"
          type="button"
          [class.is-on]="wishlisted()"
          [attr.aria-pressed]="wishlisted()"
          [attr.aria-label]="
            wishlisted() ? 'Remove ' + p.name + ' from wishlist' : 'Add ' + p.name + ' to wishlist'
          "
          (click)="toggleWishlist()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z"
              [attr.fill]="wishlisted() ? 'currentColor' : 'none'"
            />
          </svg>
        </button>
      </div>

<div class="p-body">
        <!--
          The info column, as ONE grid cell.
          Without this wrapper the title, key details and description are separate
          grid items in .p-body, and the sticky purchase card is pinned to row 1 --
          so the title shares a row with the ~180px card, that row grows to the
          card's height, and the next auto-placed item (the rating row) is pushed
          below the card. That was the 148px hole. As a single cell the column
          flows on its own and never depends on the card's height or the gallery's.
        -->
        <div class="p-info">
        <!-- Title, clamped to two lines, expandable to the full name. -->
        <h1 class="p-title" [class.is-open]="titleOpen()">{{ p.name }}</h1>
        @if (titleLong()) {
          <button class="p-title__more" type="button" (click)="titleOpen.set(!titleOpen())">
            {{ titleOpen() ? 'Less' : 'More' }}
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path [attr.d]="titleOpen() ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'" />
            </svg>
          </button>
        }

        <!-- One line of plain description, immediately under the name: it says what
             the piece actually is ("Men's underwear with contrast waistband"), which
             is what a shopper looks for at this point. It used to sit below the
             price/size block, where the shopper had to read the commercial details
             before learning what they were looking at. Guarded because the field is
             nullable and an empty <p> would still contribute its margins. -->
        @if (p.description) {
          <p class="p-desc">{{ p.description }}</p>
        }

        <!-- Key details: rating, price, colour, size in one compact block under the name. -->
        <div class="p-key-details">
          <!-- Rating. Every part is conditional on data that exists. -->
          @if (avgRating() > 0 || soldCount() !== null) {
            <div class="p-rating">
              @if (avgRating() > 0) {
                <span class="p-stars" [attr.aria-label]="avgRating() + ' out of 5'">
                  {{ starString(avgRating()) }}
                </span>
                <span class="p-rating__num">{{ avgRating() | number: '1.1-1' }}</span>
                <a class="p-rating__link" href="#p-reviews">
                  {{ reviews().length | number }} {{ reviews().length === 1 ? 'Review' : 'Reviews' }}
                </a>
              }
              @if (soldCount() !== null) {
                <span class="p-rating__div" aria-hidden="true"></span>
                <span class="p-rating__sold">{{ soldCount()! | number }} sold</span>
              }
            </div>
          }

          <!-- Price. A plain card: this catalogue has no promo code or coin
               discount to name, so no label is invented for one. -->
          <div class="p-price" [class.is-sale]="offer().was !== null">
            <div class="p-price__row">
              <span class="p-price__now">₦{{ currentPrice() | number: '1.0-2' }}</span>
              @if (offer(); as o) {
                @if (o.percent !== null) {
                  <span class="p-price__off">−{{ o.percent }}%</span>
                }
              }
            </div>
            @if (offer().was !== null) {
              <p class="p-price__was">
                 ₦{{ offer().was! | number: '1.0-2' }}
              </p>
            }
            @if (offer().endsAt; as end) {
              <p class="p-price__ends">
                <span class="sale-dot" aria-hidden="true"></span>
                <span class="sr-only">Sale ends {{ end | date: 'd MMM, HH:mm' }}.</span>
                <span aria-hidden="true">
                  Ends in <app-sale-countdown [endsAt]="end" (ended)="saleEnded()" />
                </span>
              </p>
            }
          </div>

          <!-- Colour picker. Thumbnails come from the variants' own photos, so a
               swatch shows the actual colour rather than a word. -->
          @if (colourShots().length > 0) {
            <div class="p-opt">
              <p class="p-opt__label">
                Colour<span class="p-opt__val">: {{ colour() || '—' }}</span>
              </p>
              <div class="p-swatches" role="radiogroup" aria-label="Colour">
                @for (shot of colourShots(); track shot.colour) {
                  <button
                    class="p-swatch"
                    type="button"
                    role="radio"
                    [class.is-sel]="colour() === shot.colour"
                    [class.is-out]="colourSoldOut(shot.colour!)"
                    [attr.aria-checked]="colour() === shot.colour"
                    [attr.aria-label]="shot.colour!"
                    [disabled]="colourSoldOut(shot.colour!)"
                    (click)="pickColour(shot.colour)"
                  >
                    <img [src]="shot.src" [alt]="shot.colour!" />
                  </button>
                }
              </div>
            </div>
          }

          @if (sizes().length > 0) {
            <div class="p-opt">
              <p class="p-opt__label">
                Size<span class="p-opt__val">: {{ size() || '—' }}</span>
              </p>
              <div class="p-chips" role="radiogroup" aria-label="Size">
                @for (s of sizes(); track s) {
                  <button
                    class="p-chip"
                    type="button"
                    role="radio"
                    [class.is-sel]="size() === s"
                    [class.is-out]="sizeSoldOut(s)"
                    [attr.aria-checked]="size() === s"
                    [disabled]="sizeSoldOut(s)"
                    (click)="size.set(s)"
                  >
                    {{ s }}
                  </button>
                }
              </div>
            </div>
          }
        </div>
        </div>

        <!-- Everything the desktop purchase card needs. The wrapper is display:contents
             below 900px, so on mobile these blocks lay out exactly as before. -->
        <div class="p-purchase">
          <div class="p-opt p-opt--qty">
            <p class="p-opt__label">Quantity</p>
            <span class="p-qty">
              <button type="button" aria-label="Decrease quantity" (click)="bump(-1)">-</button>
              <input type="number" min="1" [(ngModel)]="quantity" aria-label="Quantity" />
              <button type="button" aria-label="Increase quantity" (click)="bump(1)">+</button>
            </span>
          </div>

        <!-- Desktop keeps the inline CTA; the sticky bar below takes over on
             mobile, where an always-reachable buy button is the point. -->
        <p class="p-cta">
          <button
            class="p-cta__btn"
            type="button"
            (click)="addToCart()"
            [disabled]="!selected() || selectedSoldOut()"
          >
            @if (!selected()) {
              This size/colour combination is unavailable
            } @else if (selectedSoldOut()) {
              Sold out: {{ selected()!.size }} / {{ selected()!.colour }}
            } @else if (selectedMadeToOrder()) {
              Order: made to your measurements
            } @else {
              Add to cart: ₦{{ currentPrice() * quantity | number: '1.0-2' }}
            }
          </button>
        </p>

        @if (selectedMadeToOrder()) {
          <p class="p-note">
            Cut in the Aba atelier after your order, allow a 3-week lead time. Custom pieces are
            excluded from the 12-hour returns window.
          </p>
        }
        @if (added()) {
            <p class="p-note">
              Added: <a routerLink="/cart">view cart</a> or keep browsing.
            </p>
          }
        </div>
      </div>

      <!-- Reviews and the related rail sit OUTSIDE .p-body so that at desktop
           they can run the full page width under the three columns. On mobile
           they keep .p-body's side inset via their own padding, so the result
           is unchanged there. -->
      <!-- p-reviews--last marks this as the final block on the page (when there is
           no related rail below it), so the mobile bottom reserve for the
           fixed buy bar lands on whichever section is actually last. -->
      <section class="p-reviews" id="p-reviews" [class.p-reviews--last]="related().length === 0">
        <h2 class="p-reviews__h">Customer Reviews ({{ reviews().length }})</h2>

        <!-- Summary. Computed from the real rating values on the reviews we
             hold, so the bars and the average can never disagree. Desktop
             only; hidden below 900px. -->
        @if (reviews().length > 0) {
          <div class="p-rsum">
            <div class="p-rsum__avg">
              <span class="p-rsum__num">{{ avgRating() | number: '1.1-1' }}</span>
              <span class="p-stars">{{ starString(avgRating()) }}</span>
              <span class="p-rsum__count">{{ reviews().length }} reviews</span>
            </div>
            <div class="p-rsum__bars">
              @for (row of ratingBreakdown(); track row.stars) {
                <div class="p-rbar">
                  <span class="p-rbar__label">{{ row.stars }} star</span>
                  <span class="p-rbar__track">
                    <span class="p-rbar__fill" [style.width.%]="row.percent"></span>
                  </span>
                  <span class="p-rbar__count">{{ row.count }}</span>
                </div>
              }
            </div>
          </div>
        }

        @if (reviews().length === 0) {
          <p class="p-note">{{ noReviewsCopy }}</p>
        }
        @for (r of reviews(); track $index) {
          <div class="p-review">
            <span class="p-stars">{{ '★'.repeat(r.rating) }}{{ '☆'.repeat(5 - r.rating) }}</span>
            <p>{{ r.comment }}</p>
          </div>
        }
      </section>

      <!-- Suggested for You. Real products from the catalogue, never invented
           ones: same collection first, then anything else in stock. The exact
           card styling is still open until the second reference arrives, so
           this reuses the shop card, which is already correct and linked. -->
      @if (related().length > 0) {
        <section class="p-rel">
          <h2 class="p-rel__h">Suggested for You</h2>
          <div class="p-rel__grid">
            @for (r of related(); track r.id) {
              <app-product-card [product]="r" />
            }
          </div>
        </section>
      }

      <!-- Sticky purchase bar. Fixed to the viewport on mobile; the page gets
           matching bottom padding so the last review is never trapped under it. -->
      <div class="p-buy">
        <button
          class="p-buy__btn p-buy__btn--ghost"
          type="button"
          (click)="addToCart()"
          [disabled]="!selected() || selectedSoldOut()"
        >
          Add to cart
        </button>
        <button
          class="p-buy__btn p-buy__btn--fill"
          type="button"
          (click)="buyNow()"
          [disabled]="!selected() || selectedSoldOut()"
        >
          @if (!selected()) {
            Unavailable
          } @else if (selectedSoldOut()) {
            Sold out
          } @else {
            Buy now
          }
        </button>
      </div>
    } @else if (loadError()) {
      <p class="muted">
        That piece could not be loaded, it may have sold out.
        <a routerLink="/shop">Back to the shop</a>
      </p>
    } @else {
      <div class="sk-face-pull" aria-hidden="true">
        <div class="skeleton sk-line w40"></div>
        <div class="skeleton sk-line w80"></div>
        <div class="skeleton sk-img"></div>
        <div class="skeleton sk-line"></div>
        <div class="skeleton sk-line w60"></div>
      </div>
    }
  `,
})
export class ProductPage implements OnInit {
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly pageTitles = inject(PageTitleService);

  /** Clears the bar title on the way out, so a product whose load fails next
   * cannot leave the previous product's name sitting in the header. */
  ngOnDestroy(): void {
    this.pageTitles.set(null);
  }
  private readonly router = inject(Router);
  private readonly saleOver = signal(0);
  private readonly cart = inject(CartService);
  private readonly alerts = inject(BrandAlertService);
  private readonly wishlist = inject(WishlistService);

  readonly product = signal<Product | null>(null);
  readonly noReviewsCopy = NO_REVIEWS_COPY;
  readonly reviews = signal<Array<{ rating: number; comment: string | null }>>([]);
  readonly added = signal(false);
  readonly loadError = signal(false);
  readonly size = signal<string | null>(null);
  readonly colour = signal<string | null>(null);
  quantity = 1;

  /**
   * Which photo is on screen. Read by the mobile swipe pill, the desktop
   * thumbnail rail and the desktop main image, so all three always agree.
   */
  readonly shotIndex = signal(0);
  readonly titleOpen = signal(false);

  /**
   * The scrolling track, so choosing a colour can move the gallery to that
   * photo. Without this the photo changes underneath the selection and the
   * shopper has to hunt for the colour they just picked.
   */
  private trackRef = viewChild<ElementRef<HTMLElement>>('track');

  constructor() {
    effect(() => {
      const p = this.product();
      if (!p) return;
      // Read the signals the price and photo depend on so this re-runs on change.
      this.size();
      this.colour();
      this.describe(p);
      // The title is only in the DOM once the product renders, and whether it
      // needs the "More" toggle depends on how the two-line clamp bites. The
      // title element does not exist yet at this point, so defer the measure a
      // frame. afterNextRender runs outside change detection, so it does not
      // trip the zoneless ExpressionChanged check.
      afterNextRender(
          () => {
            this.measureTitle();
            this.showSelectedShot();
          },
          { injector: this.injector },
        );
    });
  }

  readonly sizes = computed(() => [
    ...new Set((this.product()?.variants ?? []).map((v) => v.size).filter((s): s is string => !!s)),
  ]);
  readonly colours = computed(() => [
    ...new Set(
      (this.product()?.variants ?? []).map((v) => v.colour).filter((c): c is string => !!c),
    ),
  ]);

  /**
   * One thumbnail per colour that actually has a photo. A colour with no photo
   * of its own gets no swatch rather than a swatch showing another colour's
   * picture, which would be a lie the shopper cannot see through.
   */
  readonly colourShots = computed<GalleryShot[]>(() => {
    const p = this.product();
    if (!p) return [];
    const seen = new Set<string>();
    const out: GalleryShot[] = [];
    for (const v of p.variants) {
      if (!v.colour || !v.imageUrl || seen.has(v.colour)) continue;
      seen.add(v.colour);
      out.push({ src: v.imageUrl, colour: v.colour });
    }
    return out;
  });

  /**
   * Every photo the shopper can swipe, led by the photo of the variant they have
   * actually chosen.
   *
   * The lead matters: opening the page selected a colour, and showing a
   * different colour's photo first is the mismatch this replaces. The order is
   * then every other colour that has its own shot, then the product's primary
   * photo. Duplicates are dropped by src, so a colour whose photo is also the
   * primary image is not counted twice in "1/N", and the product's own photo is
   * never lost even when it differs from every variant's.
   */
  readonly gallery = computed<GalleryShot[]>(() => {
    const p = this.product();
    if (!p) return [];
    const chosen = this.selected()?.imageUrl ?? null;
    const shots: GalleryShot[] = [];
    if (chosen) {
      shots.push({ src: chosen, colour: this.colour() ?? null });
    }
    for (const shot of this.colourShots()) {
      if (!shots.some((s) => s.src === shot.src)) shots.push(shot);
    }
    const primary = p.primaryImageUrl ?? null;
    if (primary && !shots.some((s) => s.src === primary)) {
      shots.push({ src: primary, colour: null });
    }
    if (shots.length === 0) shots.push({ src: PRODUCT_PLACEHOLDER, colour: null });
    return shots;
  });

  /**
   * The index the gallery should sit on when the selection changes. Null means
   * "do not move it" -- used so a shopper who has swiped to a photo and then
   * changes size is not yanked back to the first one.
   */
  private selectionAnchor(): number | null {
    const chosen = this.selected()?.imageUrl;
    if (!chosen) return null;
    return this.gallery().findIndex((s) => s.src === chosen);
  }

  /**
   * The overlay pill: "2/5 | Colour" while a colour shot is showing, plain
   * "2/5" on the generic primary photo. The model has no image *grouping* of its
   * own, so the only grouping we can name honestly is the one we built.
   */
  readonly galleryLabel = computed(() => {
    const shots = this.gallery();
    const here = shots[this.shotIndex()];
    const n = `${this.shotIndex() + 1}/${shots.length}`;
    return here && here.colour ? `${n} | ${here.colour}` : n;
  });

  /** Clamp the title at two lines, and only offer "More" when it actually clips. */
  readonly titleLong = signal(false);

  /** Real sales data when the API sends it; null means "unknown", never zero. */
  readonly soldCount = computed<number | null>(() => {
    const n = this.product()?.soldCount;
    return typeof n === 'number' && n > 0 ? n : null;
  });

  readonly wishlisted = computed(() => {
    const id = this.product()?.id;
    return !!id && this.wishlist.items().some((i) => i.productId === id);
  });

  /** "Suggested for You": real catalogue rows, never invented ones. */
  readonly related = signal<Product[]>([]);

  /**
   * Same collection first, then the rest of the catalogue, minus the piece on
   * screen. Catalogue order is left as the API returned it: the endpoint sorts
   * for the grid, and re-ranking it here would guess at a merchandising rule
   * that does not exist.
   */
  private loadRelated(current: Product): void {
    this.api.products(1, 50).subscribe(({ data }) => {
      const others = data.filter((p) => p.id !== current.id);
      const sameCollection = others.filter(
        (p) => p.collection && current.collection && p.collection.id === current.collection.id,
      );
      const rest = others.filter((p) => !sameCollection.includes(p));
      this.related.set([...sameCollection, ...rest].slice(0, 6));
    });
  }

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

  private readonly seo = inject(SeoService);

  heroImage(): string {
    return this.selected()?.imageUrl ?? this.product()?.primaryImageUrl ?? PRODUCT_PLACEHOLDER;
  }

  ngOnInit(): void {
    // Driven off the param stream, not a one-shot snapshot read. Angular reuses this
    // component instance when moving between two /product/:id URLs (e.g. clicking
    // the related-products rail), so ngOnInit runs only once and a snapshot read
    // would leave the previous product on screen under the new URL. Refreshing is
    // what masked it -- the reload re-ran ngOnInit with the current id.
    this.route.paramMap
      .pipe(
        map((params) => params.get('id') ?? ''),
        distinctUntilChanged(),
        switchMap((id) => this.loadProduct(id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  /**
   * Clears the previous product before fetching the next, then resolves reviews.
   * `switchMap` upstream cancels an in-flight request, so clicking quickly through
   * the rail cannot let a slow earlier response land after a newer one.
   */
  private loadProduct(id: string): Observable<void> {
    this.product.set(null);
    this.reviews.set([]);
    this.related.set([]);
    this.size.set(null);
    this.colour.set(null);
    this.shotIndex.set(0);
    this.quantity = 1;
    this.added.set(false);
    this.loadError.set(false);
    this.titleOpen.set(false);
    this.titleLong.set(false);

    const product$ = this.api.product(id).pipe(
      tap((p) => {
        this.product.set(p);
        // Hand the product name to the mobile header so the bar can name the
        // screen instead of showing the brand mark.
        this.pageTitles.set(p.name);
        const first = p.variants[0];
        this.size.set(first?.size ?? null);
        this.colour.set(first?.colour ?? null);
        this.loadRelated(p);
      }),
      catchError(() => {
        this.loadError.set(true);
        this.seo.apply({ title: 'Product unavailable' });
        return EMPTY;
      }),
    );

    // Reviews failing must not take the product down with them, so they are
    // faulted independently and simply render as "none yet".
    const reviews$ = this.api
      .reviews(id)
      .pipe(
        tap((r) => this.reviews.set(r.data)),
        catchError(() => of({ data: [], total: 0 })),
      );

    return forkJoin({ product: product$, reviews: reviews$ }).pipe(map(() => undefined));
  }

  /** Measure once the clamped title has a box to compare against. */
  private measureTitle(): void {
    const h = document.querySelector<HTMLElement>('.p-title');
    if (!h) return;
    this.titleLong.set(h.scrollHeight > h.clientHeight + 2);
  }

  /**
   * Choose a colour and bring the gallery to that colour's photo.
   *
   * The selection signal updates synchronously but the gallery is derived from
   * it, so the target index is only known after the signal has settled. Reading
   * it in a microtask keeps the two in step without the shopper seeing the old
   * photo for a frame.
   */
  pickColour(colour: string | null): void {
    this.colour.set(colour);
    queueMicrotask(() => this.showSelectedShot());
  }

  /**
   * Move the gallery onto the chosen variant's photo.
   *
   * Sets `shotIndex` directly rather than only scrolling: at desktop the swipe
   * track is hidden and the rail plus `shotIndex` are what drive the main image,
   * so scrolling alone would leave the picture on the old colour. The scroll is
   * then applied only when the track is actually on screen (mobile), which
   * `offsetParent` reports -- it is null for a display:none element.
   */
  private showSelectedShot(): void {
    const index = this.selectionAnchor();
    if (index === null || index < 0) return;
    this.shotIndex.set(index);
    const el = this.trackRef()?.nativeElement;
    if (el && el.offsetParent !== null) {
      el.scrollTo({ left: el.clientWidth * index, behavior: 'smooth' });
    }
  }

  /**
   * Desktop: choose a photo from the rail. One signal drives both the rail and
   * the main image, so they cannot disagree.
   */
  showShot(index: number): void {
    if (index < 0 || index >= this.gallery().length) return;
    this.shotIndex.set(index);
  }

  /** Keep the pill in step with the swipe. */
  onScroll(ev: Event): void {
    const el = ev.target as HTMLElement;
    const cell = el.clientWidth || 1;
    this.shotIndex.set(Math.round(el.scrollLeft / cell));
  }

  /** A photo that 404s falls back rather than leaving a torn image icon. */
  onImageError(ev: Event): void {
    const img = ev.target as HTMLImageElement;
    if (img.src.endsWith(PRODUCT_PLACEHOLDER)) return;
    img.src = PRODUCT_PLACEHOLDER;
  }

  toggleWishlist(): void {
    const p = this.product();
    if (p) this.wishlist.toggle(p);
  }

  private describe(p: Product): void {
    const offer = this.offer();
    const image = this.heroImage();
    const available = !!this.selected();
    this.seo.apply({
      title: p.name,
      description: p.description ?? `${p.name} from Seentair Limited.`,
      image,
      type: 'product',
      price: offer.price > 0 ? offer.price : null,
      currency: 'NGN',
      available,
    });
    this.seo.productJsonLd({
      name: p.name,
      description: p.description,
      image,
      price: offer.price > 0 ? offer.price : null,
      currency: 'NGN',
      available,
    });
  }

  currentPrice(): number {
    return this.offer().price;
  }

  offer(): Offer {
    this.saleOver();
    const p = this.product();
    if (!p) return { price: 0, was: null, percent: null, endsAt: null };
    return offerFor(p, this.selected());
  }

  saleEnded(): void {
    this.saleOver.update((n) => n + 1);
  }

  avgRating(): number {
    const rows = this.reviews();
    return rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0;
  }
  starString(avg: number): string {
    const full = Math.round(avg);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  /**
   * How many reviews carry each star value, 5 down to 1, as a share of the
   * reviews actually held.
   *
   * Counted from the review rows themselves rather than a separate endpoint
   * summary, so the bars and the average can never disagree -- both read the
   * same array. A rating is clamped into 1..5 because the field is free-form
   * and a 0 or a 6 would otherwise fall off the end of the list and quietly
   * shrink the total the percentages are taken from.
   */
  readonly ratingBreakdown = computed(() => {
    const rows = this.reviews();
    const total = rows.length;
    const counts = [0, 0, 0, 0, 0];
    for (const r of rows) {
      const s = Math.min(5, Math.max(1, Math.round(r.rating)));
      counts[s - 1]++;
    }
    return [5, 4, 3, 2, 1].map((stars, i) => ({
      stars,
      count: counts[4 - i],
      percent: total ? (counts[4 - i] / total) * 100 : 0,
    }));
  });

  sizeSoldOut(size: string): boolean {
    const rows = (this.product()?.variants ?? []).filter((v) => v.size === size);
    return rows.length > 0 && rows.every((v) => v.availabilityStatus === 'out_of_stock');
  }
  colourSoldOut(colour: string): boolean {
    const rows = (this.product()?.variants ?? []).filter((v) => v.colour === colour);
    return rows.length > 0 && rows.every((v) => v.availabilityStatus === 'out_of_stock');
  }
  selectedSoldOut(): boolean {
    return this.selected()?.availabilityStatus === 'out_of_stock';
  }
  selectedMadeToOrder(): boolean {
    return this.selected()?.availabilityStatus === 'made_to_order';
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
    void this.alerts.toast(`${p.name} added to cart`, {
      action: { label: 'View cart', run: () => void this.router.navigate(['/cart']) },
    });
  }

  /**
   * Buy now is add-to-cart followed by the cart: the checkout lives on the cart
   * page, and inventing a second checkout path here would fork the flow.
   */
  buyNow(): void {
    const p = this.product();
    const v = this.selected();
    if (!p || !v) return;
    this.cart.add(p, v, Math.max(1, this.quantity));
    void this.router.navigate(['/cart']);
  }
}
