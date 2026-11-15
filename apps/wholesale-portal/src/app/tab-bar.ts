import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * The Stitch wholesale tab bar (Home / Catalogue / Orders / Custom), shared by
 * every signed-in screen. Markup is the Stitch W2 nav verbatim; the active tab
 * is resolved from the router so each page does not have to pass it in.
 */
@Component({
  selector: 'ws-tab-bar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav
      class="fixed bottom-0 left-0 right-0 max-w-[390px] mx-auto bg-light-surface/95 backdrop-blur-md border-t border-border px-4 py-2 flex items-center justify-around z-30"
      aria-label="Wholesale sections"
    >
      <a
        routerLink="/"
        routerLinkActive
        #homeLink="routerLinkActive"
        [routerLinkActiveOptions]="{ exact: true }"
        class="flex flex-col items-center"
        [class.text-accent]="homeLink.isActive"
        [class.text-light-secondary]="!homeLink.isActive"
      >
        <span class="material-symbols-outlined text-[22px]">dashboard</span>
        <span class="text-[10px] font-medium mt-0.5" [class.font-bold]="homeLink.isActive">Home</span>
      </a>
      <a
        routerLink="/catalogue"
        routerLinkActive
        #catalogueLink="routerLinkActive"
        class="flex flex-col items-center"
        [class.text-accent]="catalogueLink.isActive"
        [class.text-light-secondary]="!catalogueLink.isActive"
      >
        <span class="material-symbols-outlined text-[22px]">inventory_2</span>
        <span class="text-[10px] font-medium mt-0.5" [class.font-bold]="catalogueLink.isActive">Catalogue</span>
      </a>
      <a
        routerLink="/orders"
        routerLinkActive
        #ordersLink="routerLinkActive"
        class="flex flex-col items-center"
        [class.text-accent]="ordersLink.isActive"
        [class.text-light-secondary]="!ordersLink.isActive"
      >
        <span class="material-symbols-outlined text-[22px]">receipt_long</span>
        <span class="text-[10px] font-medium mt-0.5" [class.font-bold]="ordersLink.isActive">Orders</span>
      </a>
      <a
        routerLink="/custom"
        routerLinkActive
        #customLink="routerLinkActive"
        class="flex flex-col items-center"
        [class.text-accent]="customLink.isActive"
        [class.text-light-secondary]="!customLink.isActive"
      >
        <span class="material-symbols-outlined text-[22px]">design_services</span>
        <span class="text-[10px] font-medium mt-0.5" [class.font-bold]="customLink.isActive">Custom</span>
      </a>
    </nav>
  `,
})
export class WholesaleTabBar {}
