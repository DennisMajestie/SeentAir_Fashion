import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { CartService } from './cart.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';

type TabKey = 'home' | 'categories' | 'cart' | 'orders' | 'profile';

/**
 * Phase 1 bottom tab bar. Reference: seentair-mobile-v2.html nav.tab.
 *
 * Active state is derived from the router rather than held in a signal, so a
 * back/forward navigation or a deep link cannot leave the wrong tab lit.
 */
@Component({
  selector: 'app-mobile-tabs',
  imports: [CommonModule, RouterLink],
  template: `
    <nav class="m-tabs" aria-label="Primary">
      @for (t of tabs; track t.key) {
        <a
          class="m-tab"
          [class.on]="active() === t.key"
          [routerLink]="t.path"
          [fragment]="t.fragment ?? undefined"
          [attr.aria-current]="active() === t.key ? 'page' : null"
        >
          <span class="m-tab__ic">
            @switch (t.key) {
              @case ('home') {
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="m4 11 8-7 8 7" />
                  <path d="M6 10v9h12v-9" />
                </svg>
              }
              @case ('categories') {
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <rect x="4" y="4" width="7" height="7" rx="1.5" />
                  <rect x="13" y="4" width="7" height="7" rx="1.5" />
                  <rect x="4" y="13" width="7" height="7" rx="1.5" />
                  <rect x="13" y="13" width="7" height="7" rx="1.5" />
                </svg>
              }
              @case ('cart') {
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6"
                  />
                  <circle cx="9" cy="20" r="1" />
                  <circle cx="17" cy="20" r="1" />
                </svg>
              }
              @case ('orders') {
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M3 8h18v11H3z" />
                  <path d="M3 8l2-4h14l2 4" />
                  <path d="M10 12h4" />
                </svg>
              }
              @case ('profile') {
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="9" r="3.5" />
                  <path d="M5 20a7 7 0 0 1 14 0" />
                </svg>
              }
            }
            @if (t.key === 'cart' && cart.count > 0) {
              <span class="m-badge" aria-hidden="true">{{ cart.count }}</span>
            }
          </span>
          <span class="m-tab__label">{{ t.label }}</span>
        </a>
      }
    </nav>
  `,
})
export class MobileBottomNavComponent {
  private readonly router = inject(Router);
  readonly cart = inject(CartService);

  readonly tabs = [
    { key: 'home' as const, label: 'Home', path: '/', fragment: null },
    { key: 'categories' as const, label: 'Categories', path: '/shop', fragment: null },
    { key: 'cart' as const, label: 'Cart', path: '/cart', fragment: null },
    // There is no /orders index route in this app, only /orders/:id. The real
    // order list lives on the account page, so that is where the tab goes.
    { key: 'orders' as const, label: 'Orders', path: '/account', fragment: 'orders' },
    { key: 'profile' as const, label: 'Profile', path: '/account', fragment: null },
  ];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Categories also lights up on a product page, because that is still
   * browsing. Orders lights on a single-order tracking page too.
   */
  readonly active = computed<TabKey>(() => {
    const url = this.url();
    const path = url.split('#')[0].split('?')[0];
    if (path.startsWith('/product')) return 'categories';
    if (path.startsWith('/orders')) return 'orders';
    if (path === '/cart') return 'cart';
    if (path === '/shop') return 'categories';
    if (path === '/account') return url.includes('#orders') ? 'orders' : 'profile';
    return 'home';
  });
}