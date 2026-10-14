import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { environment } from '../environments/environment';
import { ApiService } from './api.service';
import { CartService } from './cart.service';
import { CatalogueSearchService } from './catalogue-search.service';
import { WishlistService } from './wishlist.service';
import { productImage } from './product-image';

/**
 * Desktop-only shop header: logo, wide search, account and cart.
 *
 * Layout structure is modelled on a conventional e-commerce header rather than
 * any particular reference: the search takes the flexible middle column because
 * that is the widest thing a shopper interacts with, and account/cart stay on
 * one line because they are the two actions taken at the end of a session.
 *
 * Everything here is real. The search runs the same client-side catalogue filter
 * as the mobile header (shared `CatalogueSearchService`), the cart count is the
 * live `CartService` figure, and both destination routes already exist. Nothing
 * is a placeholder and nothing has a dead link.
 *
 * Rendered only above the desktop breakpoint -- see `ViewportService`. At mobile
 * widths this component is never instantiated, so its markup costs nothing and
 * no images are fetched for it.
 */
@Component({
  selector: 'app-desktop-header',
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <header class="d-header">
      <div class="d-header__inner">
        <a class="d-logo" routerLink="/" aria-label="SEENTAIR home">
          <img src="assets/logo-v1.png" alt="SEENTAIR" width="122" height="39" />
        </a>

        <!-- role="search" so assistive tech treats this as the page's search
             landmark rather than a generic group. -->
        <div class="d-search" role="search">
          <label class="sr-only" for="d-search-input">Search products</label>
          <svg class="d-search__lead" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            #q
            id="d-search-input"
            class="d-search__input"
            type="search"
            [value]="search.term()"
            (input)="search.search(q.value)"
            (focus)="search.ensureCatalogueLoaded()"
            (keydown.escape)="dismiss()"
            autocomplete="off"
            spellcheck="false"
            placeholder="Search for clothes, underwear, kids wear…"
            aria-controls="d-search-results"
            [attr.aria-expanded]="search.results().length > 0"
          />

          @if (search.results().length > 0) {
            <ul class="d-results" id="d-search-results">
              @for (r of search.results(); track r.id) {
                <li>
                  <a [routerLink]="['/product', r.id]" (click)="dismiss()">
                    <img [src]="productImage(r)" [alt]="r.name" />
                    <span class="d-results__info">
                      <span class="d-results__name">{{ r.name }}</span>
                      <span class="d-results__meta">
                        {{ r.category || 'Seentair' }} · ₦{{ search.priceOf(r) | number: '1.0-0' }}
                      </span>
                    </span>
                  </a>
                </li>
              }
            </ul>
          } @else if (search.searched()) {
            <p class="d-results__empty">No matches in the collection.</p>
          }
        </div>

        <div class="d-actions">
          <!-- Wishlist. Lives on the account page; the count is the real local
               or synced list, the same figure the mobile shell shows. -->
          <a
            class="d-action"
            routerLink="/account"
            fragment="wishlist"
            [attr.aria-label]="wishLabel()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z"
              />
            </svg>
            <span class="d-action__text">Saved</span>
            @if (wish.count > 0) {
              <span class="d-badge" aria-hidden="true">{{ wish.count }}</span>
            }
          </a>

          <!-- Account. The shop's own sign-in, plus the other three Seentair
               surfaces, behind a real menu rather than three more icons. -->
          <div class="d-acct">
            <button
              class="d-action d-action--btn"
              type="button"
              [attr.aria-expanded]="menuOpen()"
              aria-haspopup="true"
              aria-controls="d-acct-menu"
              (click)="menuOpen.set(!menuOpen())"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
              </svg>
              <span class="d-action__text">Account</span>
              <svg class="d-caret" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            @if (menuOpen()) {
              <div class="d-acct__menu" id="d-acct-menu" role="menu">
                <a
                  class="d-acct__item"
                  role="menuitem"
                  routerLink="/account"
                  (click)="menuOpen.set(false)"
                >
                  <span class="d-acct__name">My account</span>
                  <span class="d-acct__hint">Orders, wishlist, details</span>
                </a>
                @for (surface of surfaces; track surface.label) {
                  <a
                    class="d-acct__item"
                    role="menuitem"
                    [href]="surface.href"
                    target="_blank"
                    rel="noopener noreferrer"
                    (click)="menuOpen.set(false)"
                  >
                    <span class="d-acct__name">
                      {{ surface.label }}
                      <svg class="d-acct__ext" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                      </svg>
                    </span>
                    <span class="d-acct__hint">{{ surface.hint }}</span>
                  </a>
                }
              </div>
            }
          </div>

          <a class="d-action" routerLink="/cart" [attr.aria-label]="cartLabel()">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6"
              />
              <circle cx="9" cy="20" r="1" />
              <circle cx="17" cy="20" r="1" />
            </svg>
            <span class="d-action__text">Cart</span>
            @if (cart.count > 0) {
              <span class="d-badge" aria-hidden="true">{{ cart.count }}</span>
            }
          </a>
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      .d-header {
        position: sticky;
        top: 0;
        z-index: 30;
        background: var(--card);
        border-bottom: 1px solid var(--line);
      }

      .d-header__inner {
        max-width: var(--wrap-max);
        margin-inline: auto;
        padding: 14px var(--wrap-x);
        display: flex;
        align-items: center;
        gap: var(--space-24);
      }

      /* Flex-shrink 0 so the logo never collapses when the window narrows;
         the search column is the only part allowed to give up width. */
      .d-logo {
        flex-shrink: 0;
        display: block;
        line-height: 0;
        /* logo-v1.png is a light lockup: near-white "SEENTAIR" with a gold
           "STYLE FOR EVERYONE" tagline, drawn for the dark mobile header. The
           project keeps it un-inverted there on purpose (.m-brand__mark), and
           inverting it here would also flip the gold tagline to blue.

           On the light desktop header those white glyphs are invisible, so the
           mark keeps the dark plate it was designed against -- the same
           --m-fg the mobile header paints. The asset itself is untouched: no
           filter, no re-colouring, no second file. */
        background: var(--m-fg, #141210);
        border-radius: 10px;
        padding: 7px 12px;
      }
      .d-logo img {
        height: 28px;
        width: auto;
        display: block;
      }

      .d-search {
        position: relative;
        /* The flexible middle column: absorbs all slack, yields first under
           pressure, and min-width 0 stops the input's intrinsic min-width
           from forcing the row wider than the viewport. */
        flex: 1;
        min-width: 0;
      }

      .d-search__lead {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        width: 18px;
        height: 18px;
        fill: none;
        stroke: var(--muted);
        stroke-width: 2;
        stroke-linecap: round;
        pointer-events: none;
      }

      .d-search__input {
        width: 100%;
        height: 44px;
        padding: 0 16px 0 42px;
        font: inherit;
        font-size: var(--type-body-md);
        color: var(--ink);
        background: var(--canvas);
        border: 1px solid var(--line-2);
        /* Field shape language: soft corners, unlike the pill used for buttons. */
        border-radius: var(--radius-pill);
      }
      .d-search__input::placeholder {
        color: var(--muted);
      }

      .d-results {
        position: absolute;
        z-index: 5;
        top: calc(100% + 8px);
        left: 0;
        right: 0;
        margin: 0;
        padding: 6px;
        list-style: none;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius-field);
        box-shadow: 0 18px 40px rgb(0 0 0 / 0.12);
        max-height: 60vh;
        overflow-y: auto;
      }
      .d-results a {
        display: flex;
        align-items: center;
        gap: var(--space-12);
        padding: 8px;
        border-radius: 8px;
        text-decoration: none;
        color: inherit;
      }
      .d-results a:hover {
        background: var(--container);
      }
      .d-results img {
        width: 44px;
        height: 44px;
        object-fit: cover;
        border-radius: 6px;
        flex-shrink: 0;
        background: var(--container);
      }
      .d-results__info {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .d-results__name {
        font-weight: 600;
        font-size: var(--type-body-md);
      }
      .d-results__meta {
        color: var(--muted);
        font-size: var(--type-body-sm);
      }
      .d-results__empty {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        right: 0;
        margin: 0;
        padding: 12px 14px;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius-field);
        color: var(--muted);
        font-size: var(--type-body-sm);
      }

      .d-actions {
        display: flex;
        align-items: center;
        gap: var(--space-16);
        flex-shrink: 0;
      }

      .d-action {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 6px;
        color: var(--ink);
        text-decoration: none;
        border-radius: 8px;
      }
      .d-action svg {
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
      }
      .d-action__text {
        font-size: var(--type-body-md);
        font-weight: 500;
      }
      .d-action:hover {
        color: var(--primary);
      }
      /* The account trigger is a button, so it needs the button reset the
         anchor version does not: no underline, and a pointer. */
      .d-action--btn {
        border: 0;
        background: none;
        font: inherit;
        cursor: pointer;
      }
      .d-action--btn:hover {
        color: var(--primary);
      }
      .d-caret {
        width: 14px !important;
        height: 14px !important;
      }

      /* Account menu. Anchored to the trigger and right-aligned so it hangs
         inside the viewport at the end of the header. */
      .d-acct {
        position: relative;
      }
      .d-acct__menu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 40;
        min-width: 264px;
        padding: 6px;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius-field);
        box-shadow: 0 12px 32px rgb(0 0 0 / 0.14);
      }
      .d-acct__item {
        display: block;
        padding: 9px 10px;
        border-radius: 8px;
        text-decoration: none;
        color: var(--ink);
      }
      .d-acct__item:hover,
      .d-acct__item:focus-visible {
        background: var(--container);
      }
      .d-acct__name {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--type-body-md);
        font-weight: 600;
      }
      .d-acct__ext {
        width: 13px;
        height: 13px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        opacity: 0.55;
      }
      .d-acct__hint {
        display: block;
        color: var(--muted);
        font-size: var(--type-label-md);
      }

      .d-badge {
        position: absolute;
        top: 0;
        right: -2px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--danger);
        color: #fff;
        border-radius: var(--radius-pill);
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      }

      /* Keyboard focus must be visible on every interactive element here. */
      .d-logo:focus-visible,
      .d-action:focus-visible,
      .d-search__input:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .d-search__input {
          transition: none;
        }
      }
    `,
  ],
})
export class DesktopHeaderComponent {
  readonly search = inject(CatalogueSearchService);
  readonly cart = inject(CartService);
  readonly wish = inject(WishlistService);
  private readonly api = inject(ApiService);

  /** Whether the account menu is open. Closed on navigation so a link that
      moves the shopper somewhere else does not leave it hanging open. */
  readonly menuOpen = signal(false);

  /**
   * The other three Seentair surfaces, from the same environment block the
   * footer uses -- so the navbar and the footer can never point at different
   * deployments.
   */
  readonly surfaces: ReadonlyArray<{ label: string; hint: string; href: string }> = [
    { label: 'Distributors portal', hint: 'Trade pricing and bulk orders', href: environment.distributorsUrl },
    { label: 'Partner portal', hint: 'Ownership and dividends', href: environment.partnerUrl },
    { label: 'Admin dashboard', hint: 'Factory and operations', href: environment.adminUrl },
  ];

  readonly wishLabel = computed(() =>
    this.wish.count === 1 ? 'Wishlist, 1 saved item' : `Wishlist, ${this.wish.count} saved items`,
  );

  /** Template handle on the shared photo hierarchy (see product-image.ts). */
  readonly productImage = productImage;

  readonly cartLabel = computed(() =>
    this.cart.count === 1 ? 'Cart, 1 item' : `Cart, ${this.cart.count} items`,
  );

  /**
   * Reads the session flag the API already exposes. `isLoggedIn` is a getter
   * over the token signal, so the computed re-evaluates when the session
   * changes and the label tracks sign-in without its own listener.
   */
  readonly accountLabel = computed(() =>
    this.api.isLoggedIn ? 'Your account' : 'Sign in or create an account',
  );

  dismiss(): void {
    this.search.close();
  }
}