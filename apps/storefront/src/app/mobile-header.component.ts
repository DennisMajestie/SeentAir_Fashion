import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { ApiService, Product } from './api.service';
import { CartService } from './cart.service';
import { WishlistService } from './wishlist.service';
import { environment } from '../environments/environment';

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
        @if (isPlp()) {
          <!-- Reference screen 2: light header, back arrow, category title.
               Back leads home: this screen IS /shop, so the old link to /shop
               went nowhere. -->
          <a class="m-back" routerLink="/" aria-label="Back to home">
            <svg class="m-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M19 12H5" />
              <path d="m11 6-6 6 6 6" />
            </svg>
          </a>
          <h1 class="m-plp__title">{{ plpTitle() }}</h1>
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

          <a class="m-brand" routerLink="/" aria-label="SEENTAIR home">
            <img
              class="m-brand__mark"
              src="assets/logo-v1.png"
              alt="SEENTAIR"
              width="122"
              height="39"
            />
          </a>
        }

        <div class="m-icons">
          <!--
            The reference gives Home the full pill and every other screen a
            compact magnifier, so the field is only inline on Home and is
            revealed by this button elsewhere. The behaviour is identical either
            way: one catalogue fetch, filtered client-side.
          -->
          @if (!isHome()) {
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
          }

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
                  <img [src]="r.variants[0]?.imageUrl || 'assets/shop-1.jpg'" [alt]="r.name" />
                  <span class="m-results__info">
                    <span class="m-results__name">{{ r.name }}</span>
                    <span class="m-results__meta">
                      {{ r.category || 'Seentair' }} · ₦{{ r.basePrice | number: '1.0-0' }}
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

  readonly menuOpen = signal(false);
  readonly searchTerm = signal('');
  readonly searchProducts = signal<Product[]>([]);
  readonly catalogueLoaded = signal(false);
  /** Off-Home screens reveal the same field from the magnifier button. */
  readonly searchOpen = signal(false);

  /** Current URL, tracked so the header can vary by screen the way it does in
      the reference: full search pill on Home, compact magnifier elsewhere. */
  private readonly router = inject(Router);
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

  /** The PLP heading is the real category being browsed, not a hardcoded word. */
  readonly plpTitle = computed(() => {
    const match = /[?&]category=([^&]+)/.exec(this.url());
    if (!match) return 'Shop';
    return decodeURIComponent(match[1]).replace(/^\w/, (ch) => ch.toUpperCase());
  });

  readonly showPill = computed(() => this.isHome() || this.searchOpen());

  toggleSearch(): void {
    this.searchOpen.update((open) => !open);
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
    { label: 'Wholesale', path: '', href: environment.wholesaleUrl, external: true },
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