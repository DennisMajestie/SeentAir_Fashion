import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { ApiService, Product } from './api.service';
import { PageTitleService } from './page-title.service';
import { CartService } from './cart.service';
import { WishlistService } from './wishlist.service';
import { environment } from '../environments/environment';
import { offerFor } from './pricing';
import { productImage } from './product-image';

/**
 * Phase 1 mobile navigation shell. Reference: seentair-mobile-v2.html
 * header.dark + .services, reproduced at 375px.
 *
 * The search field keeps the real catalogue behaviour the old hover panel had
 * (one fetch, filtered client-side, up to 8 rows) rather than becoming a
 * decorative pill.
 */
@Component({
  selector: 'app-mobile-header',
  imports: [CommonModule, RouterLink],
  template: `
    <header class="m-header" [class.m-header--light]="isPlp()">
      <div class="m-top">
        <!--
          The leading slot is always the left-hand item, so back / burger stays
          where the thumb expects it and the brand keeps the centre.

          A real <button>, not a link to a guessed route: the shopper arrived
          from the grid or the home rail, and sending them somewhere fixed
          throws that away. Falls back to /shop when there is no history to
          return to -- a shared product link opened cold still leads somewhere.
        -->
        @if (showsBack()) {
          <button class="m-back" type="button" aria-label="Back" (click)="back()">
            <svg class="m-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M19 12H5" />
              <path d="m11 6-6 6 6 6" />
            </svg>
          </button>
        } @else {
          <button
            class="m-burger"
            type="button"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="m-drawer"
            aria-label="Open menu"
            (click)="menuOpen.set(true)"
          >
            <span class="m-burger__bar"></span>
            <span class="m-burger__bar"></span>
            <span class="m-burger__bar"></span>
          </button>
        }

        @if (headerTitle(); as title) {
          <!-- The bar names the screen instead of the brand, the same way the
               grid does with its category title. One title per screen: the
               page below does not repeat it. -->
          <h1 class="m-plp__title">{{ title }}</h1>
        } @else {
          <a class="m-brand" routerLink="/" aria-label="SEENTAIR home">
            <img
              class="m-brand__mark"
              src="assets/logo-light.jpeg"
              alt="SEENTAIR"
              width="95"
              height="34"
            />
          </a>
        }

        <div class="m-icons">
          <!--
            One magnifier on every screen reveals the same field. The behaviour
            is identical either way: one catalogue fetch, filtered client-side.
          -->
          <button
              class="m-iconbtn m-iconbtn--btn"
              type="button"
              (click)="toggleSearch()"
              [attr.aria-expanded]="showPill()"
              aria-controls="m-search-region"
              aria-label="Search"
            >
            <svg class="m-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>

          @if (!isPlp()) {
            <a
              class="m-iconbtn"
              routerLink="/account"
              fragment="notifications"
              [attr.aria-label]="notificationsLabel()"
            >
              <svg
                class="m-ic m-ic--lg"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M12 3a5 5 0 0 0-5 5v3l-2 4h14l-2-4V8a5 5 0 0 0-5-5z" />
                <path d="M9 19a3 3 0 0 0 6 0" />
              </svg>
              @if (unreadCount() > 0) {
                <span class="m-badge" aria-hidden="true">{{ unreadCount() }}</span>
              }
              <span class="sr-only">{{ notificationsLabel() }}</span>
            </a>
          }

          <a class="m-iconbtn" routerLink="/cart" [attr.aria-label]="cartLabel()">
            <svg
              class="m-ic m-ic--lg"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6"
              />
              <circle cx="9" cy="20" r="1" />
              <circle cx="17" cy="20" r="1" />
            </svg>
            @if (cart.count > 0) {
              <span class="m-badge" aria-hidden="true">{{ cart.count }}</span>
            }
          </a>
        </div>
      </div>

      @if (showPill()) {
        <div class="m-search" id="m-search-region" role="search">
        <svg class="m-search__lead" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          #q
          class="m-search__input"
          type="search"
          [value]="searchTerm()"
          (input)="onSearch(q.value)"
          (focus)="ensureCatalogueLoaded()"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search for clothes, underwear, kids wear…"
          aria-label="Search for clothes, underwear, kids wear"
          aria-controls="m-search-results"
          [attr.aria-expanded]="searchResults().length > 0"
        />
        <span class="m-search__cam" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
        </span>

        @if (searchResults().length > 0) {
          <ul class="m-results" id="m-search-results">
            @for (r of searchResults(); track r.id) {
              <li>
                <a [routerLink]="['/product', r.id]" (click)="closeSearch()">
                  <img [src]="productImage(r)" [alt]="r.name" />
                  <span class="m-results__info">
                    <span class="m-results__name">{{ r.name }}</span>
                    <span class="m-results__meta">
                      {{ r.category || 'Seentair' }} · ₦{{ priceOf(r) | number: '1.0-0' }}
                    </span>
                  </span>
                </a>
              </li>
            }
          </ul>
        } @else if (searchTerm().trim().length > 0 && catalogueLoaded()) {
          <p class="m-results__empty">No matches in the collection.</p>
        }
        </div>
      }
    </header>

    @if (menuOpen()) {
      <button
        class="m-scrim"
        type="button"
        tabindex="-1"
        aria-label="Close menu"
        (click)="menuOpen.set(false)"
      ></button>
    }
    <!-- Kept in the DOM so the open/close transition works; inert while closed
         so its links never sit in the tab order behind the header. -->
    <nav
      id="m-drawer"
      class="m-drawer"
      [class.open]="menuOpen()"
      [attr.inert]="menuOpen() ? null : ''"
      aria-label="Menu"
    >
      <div class="m-drawer__head">
        <img class="m-drawer__mark" src="assets/logo-v1.png" alt="SEENTAIR" width="102" height="33" />
        <button
          class="m-drawer__close"
          type="button"
          aria-label="Close menu"
          (click)="menuOpen.set(false)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <ul class="m-drawer__links">
        @for (l of links; track l.label) {
          <li>
            @if (l.external) {
              <a [href]="l.href" target="_blank" rel="noopener noreferrer" (click)="menuOpen.set(false)">
                {{ l.label }}
              </a>
            } @else {
              <a [routerLink]="l.path" (click)="menuOpen.set(false)">{{ l.label }}</a>
            }
          </li>
        }
      </ul>
      <p class="m-drawer__wish">
        <a routerLink="/shop" (click)="menuOpen.set(false)">
          Wishlist (<span>{{ wish.count }}</span>)
        </a>
      </p>
    </nav>
  `,
})
export class MobileHeaderComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  readonly cart = inject(CartService);
  readonly wish = inject(WishlistService);
  /** Template-accessible photo hierarchy (see product-image.ts). */
  readonly productImage = productImage;

  readonly menuOpen = signal(false);
  readonly searchTerm = signal('');
  readonly searchProducts = signal<Product[]>([]);
  readonly catalogueLoaded = signal(false);
  /** Off-Home screens reveal the same field from the magnifier button. */
  readonly searchOpen = signal(false);

  /** The search field, so the magnifier can focus it once it has rendered. */
  @ViewChild('q') private searchInput?: ElementRef<HTMLInputElement>;

  /** afterNextRender needs an injector when it is called from an event handler.
   */
  private readonly injector = inject(Injector);

  /** Current URL, tracked so the header can vary by screen the way it does in
      the reference: full search pill on Home, compact magnifier elsewhere. */
  private readonly router = inject(Router);
  /** Lets a page name itself in the bar; see PageTitleService. */
  readonly pageTitles = inject(PageTitleService);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => {
        // Leaving a screen must not strand an open field behind the new one.
        this.searchOpen.set(false);
        return this.router.url;
      }),
    ),
    { initialValue: this.router.url },
  );
  private readonly path = computed(() => this.url().split('#')[0].split('?')[0]);
  readonly isHome = computed(() => this.path() === '/');
  readonly isPlp = computed(() => this.path().startsWith('/shop'));

  /**
   * Screens a shopper arrives on from somewhere else, so the leading slot offers
   * Back rather than the menu: the product grid, the product page, the cart, the
   * checkout and order tracking. Home keeps the menu -- there is nothing behind
   * it to go back to.
   *
   * `/shop` previously hard-linked Back to `/`, which sent a shopper who had
   * drilled into a category out of the grid entirely. History is the honest
   * answer for both.
   */
  readonly showsBack = computed(
    () =>
      this.isPlp() ||
      this.path().startsWith('/product') ||
      this.path().startsWith('/cart') ||
      this.path().startsWith('/checkout') ||
      this.path().startsWith('/orders'),
  );

  /**
   * The title shown in the bar instead of the logo, on the screens a shopper
   * arrived at from somewhere else. Falls back to a per-route label so the bar
   * is never blank while a page is still loading its own title.
   */
  readonly headerTitle = computed<string | null>(() => {
    if (this.isPlp()) return this.plpTitle();
    const path = this.path();
    if (path.startsWith('/product')) return this.pageTitles.pageTitle() ?? 'Product';
    if (path.startsWith('/cart')) return 'Cart';
    if (path.startsWith('/checkout')) return 'Checkout';
    if (path.startsWith('/orders')) return 'Order tracking';
    return null;
  });

  /**
   * Back to where the shopper actually came from. `history.length > 1` is the
   * only test available for "is there somewhere to go back to" -- it counts this
   * document's own history entries, so a shared link opened cold falls through
   * to the grid instead of closing the tab or doing nothing.
   */
  back(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
    void this.router.navigate(['/shop']);
  }

  /** The PLP heading is the real category being browsed, not a hardcoded word. */
  readonly plpTitle = computed(() => {
    const match = /[?&]category=([^&]+)/.exec(this.url());
    if (!match) return 'Shop';
    return decodeURIComponent(match[1]).replace(/^\w/, (ch) => ch.toUpperCase());
  });

  /**
   * The field is revealed by the magnifier on EVERY screen, not shown inline on
   * Home alone. One rule everywhere means a shopper who learns the magnifier on
   * one screen finds it on the next, and it keeps the bar a predictable height
   * instead of jumping as the field appears.
   */
  readonly showPill = computed(() => this.searchOpen());

  /**
   * Opens or closes the field and moves focus into it when opening. Without the
   * focus a single tap revealed the pill and a second tap was needed to type,
   * which is the whole reason a search icon exists.
   *
   * The focus has to wait for the RENDER, not just for the signal: the field
   * lives inside an `@if`, so a plain `setTimeout(0)` runs before change
   * detection has created the element and the ViewChild is still undefined.
   */
  toggleSearch(): void {
    this.searchOpen.update((open) => !open);
    if (this.searchOpen()) {
      afterNextRender(() => this.searchInput?.nativeElement.focus(), { injector: this.injector });
    }
  }

  readonly searchResults = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) return [];
    return this.searchProducts()
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8);
  });

  /**
   * The reference shows a red "3" on the bell. There is no source for that
   * number: the notifications endpoint returns a flat list with no read or
   * readAt field, so there is no way to know what is unread and no way to
   * clear a badge once read. Rather than invent a count, the badge renders
   * only when a real unread count exists, which today is never. Revisit with
   * the notification read-state work.
   */
  readonly unreadCount = signal(0);
  readonly notificationsLabel = computed(() =>
    this.unreadCount() > 0
      ? 'Notifications, ' + this.unreadCount() + ' unread'
      : 'Notifications',
  );
  readonly cartLabel = computed(() =>
    this.cart.count === 1 ? 'Cart, 1 item' : 'Cart, ' + this.cart.count + ' items',
  );

  readonly links = [
    { label: 'Shop', path: '/shop', href: '', external: false },
    { label: 'Account', path: '/account', href: '', external: false },
    { label: 'Distributors portal', path: '', href: environment.distributorsUrl, external: true },
    { label: 'Admin', path: '', href: environment.adminUrl, external: true },
    { label: 'Partners', path: '', href: environment.partnerUrl, external: true },
  ];

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.menuOpen()) this.menuOpen.set(false);
  };

  constructor() {
    document.addEventListener('keydown', this.onKey);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKey);
  }

  /** What the result costs right now, sale included. */
  priceOf(p: Product): number {
    return offerFor(p).price;
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
    this.ensureCatalogueLoaded();
  }

  closeSearch(): void {
    this.searchTerm.set('');
  }

  /** One fetch, reused for every later keystroke. Matches the old panel. */
  ensureCatalogueLoaded(): void {
    if (this.catalogueLoaded() || this.searchProducts().length > 0) return;
    this.api.products().subscribe((r) => {
      this.searchProducts.set(r.data);
      this.catalogueLoaded.set(true);
    });
  }
}