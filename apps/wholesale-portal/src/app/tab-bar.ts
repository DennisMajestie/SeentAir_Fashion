import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * The Stitch wholesale tab bar (Home / Catalogue / Orders / Custom), shared by
 * every signed-in screen. Markup is the Stitch W2 nav verbatim on mobile; from
 * md up the same links become a fixed left sidebar so the desktop view is not
 * a phone column. The active tab is resolved from the router so each page does
 * not have to pass it in.
 */
@Component({
  selector: 'ws-tab-bar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav
      class="fixed bottom-0 left-0 right-0 max-w-[390px] mx-auto bg-light-surface/95 backdrop-blur-md border-t border-border px-4 py-2 flex items-center justify-around z-30 md:top-0 md:bottom-0 md:left-0 md:right-auto md:mx-0 md:max-w-none md:w-56 md:flex-col md:items-stretch md:justify-start md:gap-1 md:px-3 md:py-5 md:border-t-0 md:border-r md:bg-light-surface"
      aria-label="Wholesale sections"
    >
      <div class="hidden md:block px-3 pb-4">
        <img src="assets/logo.png" alt="SeentAir" width="104" height="61" class="logo-mark h-9 w-auto" />
        <span class="block text-[10px] font-mono font-semibold tracking-wide text-light-secondary mt-1.5">WHOLESALE · ABA INDUSTRIAL LINE</span>
      </div>
      @for (item of items; track item.link) {
        <a
          [routerLink]="item.link"
          routerLinkActive="ws-active"
          [routerLinkActiveOptions]="{ exact: item.exact }"
          class="ws-link flex flex-col items-center md:flex-row md:gap-3 md:px-3 md:py-2.5 md:rounded-lg"
        >
          <span class="material-symbols-outlined text-[22px]">{{ item.icon }}</span>
          <span class="text-[10px] font-medium mt-0.5 md:mt-0 md:text-[13px]">{{ item.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: [
    `
      .ws-link { color: #7b756a; }
      .ws-link.ws-active { color: #c88a12; }
      .ws-link.ws-active span:last-child { font-weight: 700; }
      @media (min-width: 768px) {
        .ws-link:hover { background: rgba(239, 227, 200, 0.5); color: #1b1916; }
        .ws-link.ws-active { background: rgba(200, 138, 18, 0.12); }
        .ws-link.ws-active span:last-child { font-weight: 600; }
      }
    `,
  ],
})
export class WholesaleTabBar {
  readonly items = [
    { link: '/', icon: 'dashboard', label: 'Home', exact: true },
    { link: '/catalogue', icon: 'inventory_2', label: 'Catalogue', exact: false },
    { link: '/orders', icon: 'receipt_long', label: 'Orders', exact: false },
    { link: '/custom', icon: 'design_services', label: 'Custom', exact: false },
  ];
}
