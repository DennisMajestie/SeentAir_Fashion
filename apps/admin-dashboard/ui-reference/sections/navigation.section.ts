import { Component, signal } from '@angular/core';
import {
  SeBreadcrumb,
  SeBreadcrumbsComponent,
  SeButtonDirective,
  SeIconComponent,
  SeNavGroup,
  SeSearchComponent,
  SeShellComponent,
  SeShellMenuItemDirective,
  SeTab,
  SeTabPanelDirective,
  SeTabsComponent,
} from '@seentair/ui';

@Component({
  selector: 'ref-navigation',
  imports: [
    SeBreadcrumbsComponent,
    SeButtonDirective,
    SeIconComponent,
    SeSearchComponent,
    SeShellComponent,
    SeShellMenuItemDirective,
    SeTabPanelDirective,
    SeTabsComponent,
  ],
  template: `
    <p class="ref-lede">
      The shell is the frame every internal app sits in. Breadcrumbs say where a page is; tabs
      switch between views of one thing.
    </p>

    <h3 class="ref-h3">App shell</h3>
    <p class="ref-lede">
      Sidebar, sticky top bar, page. The sidebar collapses to icons on a desktop and becomes a
      drawer below 64rem: narrow this window to see it. Signed out {{ signOuts() }} times.
    </p>
    <div class="ref-panel" style="height: var(--se-size-drawer); padding: 0; overflow: hidden">
      <se-shell
        appName="Seentair admin"
        [nav]="nav"
        [user]="user"
        [(collapsed)]="collapsed"
        (signOut)="signOuts.set(signOuts() + 1)"
      >
        <se-search seShellSearch label="Search orders, products and customers" [(value)]="query" />
        <button seShellActions seButton variant="ghost" iconOnly aria-label="Notifications">
          <se-icon name="bell" />
        </button>
        <button seShellMenu type="button"><se-icon name="settings" /> Settings</button>

        <se-breadcrumbs [items]="crumbs" />
        <h1 class="se-type-heading" style="margin: 0 0 var(--se-space-4)">Order SO-1042</h1>
        <se-tabs #orderTabs label="Order SO-1042" [tabs]="orderTabList" [(active)]="orderTab" />
        <div seTabPanel="items" [for]="orderTabs">
          20 Lagos heavyweight tees, 20 Aba cargo trousers. Wholesale tier 2.
        </div>
        <div seTabPanel="payments" [for]="orderTabs">
          Paid in full by Paystack on 3 October 2026.
        </div>
        <div seTabPanel="delivery" [for]="orderTabs">
          Handed to GIGL on 4 October 2026. Expected in Abuja within two days.
        </div>
      </se-shell>
    </div>
    <div class="ref-row" style="margin-top: var(--se-space-3)">
      <button
        seButton
        size="sm"
        [attr.aria-pressed]="collapsed()"
        (click)="collapsed.set(!collapsed())"
      >
        Sidebar collapsed: {{ collapsed() ? 'yes' : 'no' }}
      </button>
    </div>
    <p class="ref-dont">
      <b>Not for:</b> a page inside an app (there is one shell per app, at the root), the retail
      storefront, or sign-in and other screens shown before someone has a session.
    </p>

    <h3 class="ref-h3">Breadcrumbs</h3>
    <div class="ref-panel">
      <se-breadcrumbs [items]="crumbs" />
      <se-breadcrumbs [items]="deepCrumbs" />
    </div>
    <p class="ref-dont">
      <b>Not for:</b> top-level pages reached straight from the sidebar (the sidebar already says
      where you are), steps in a process (that is a stepper), or filters applied to a list.
    </p>

    <h3 class="ref-h3">Tabs</h3>
    <div class="ref-panel">
      <se-tabs #stockTabs label="Stock by status" [tabs]="stockTabList" [(active)]="stockTab" />
      <div seTabPanel="in-stock" [for]="stockTabs">128 products are in stock.</div>
      <div seTabPanel="low" [for]="stockTabs">7 products are below their reorder level.</div>
      <div seTabPanel="out" [for]="stockTabs">2 products are out of stock.</div>
      <div seTabPanel="production" [for]="stockTabs">14 batches are in production.</div>
    </div>
    <p class="ref-dont">
      <b>Not for:</b> moving between pages (use the sidebar or links), steps that must be done in
      order, more than about six views (use a select or a sub-page), or content people need to
      compare side by side.
    </p>
  `,
})
export class NavigationSection {
  readonly collapsed = signal(false);
  readonly signOuts = signal(0);
  readonly query = signal('');
  readonly orderTab = signal<string | undefined>(undefined);
  readonly stockTab = signal<string | undefined>('low');

  readonly user = { name: 'Okereke Cynthia', role: 'Owner' };
  readonly nav: SeNavGroup[] = [
    {
      items: [
        { label: 'Home', icon: 'home', link: '/', exact: true },
        { label: 'Orders', icon: 'cart', link: '/orders' },
        { label: 'Inventory', icon: 'box', link: '/inventory' },
      ],
    },
    {
      title: 'Factory',
      items: [
        { label: 'Production', icon: 'layers', link: '/production' },
        { label: 'Approvals', icon: 'clipboard-check', link: '/approvals', badge: 4 },
        { label: 'Catalogue', icon: 'tag', link: '/catalogue' },
      ],
    },
  ];
  readonly crumbs: SeBreadcrumb[] = [
    { label: 'Orders', link: '/orders' },
    { label: 'Wholesale', link: '/orders/wholesale' },
    { label: 'SO-1042' },
  ];
  readonly deepCrumbs: SeBreadcrumb[] = [
    { label: 'Inventory', link: '/inventory' },
    { label: 'Lagos heavyweight tee', link: '/inventory/lagos-tee' },
    { label: 'Black, large', link: '/inventory/lagos-tee/black-l' },
    { label: 'Stock movements' },
  ];
  readonly orderTabList: SeTab[] = [
    { id: 'items', label: 'Items', count: 2 },
    { id: 'payments', label: 'Payments' },
    { id: 'delivery', label: 'Delivery' },
  ];
  readonly stockTabList: SeTab[] = [
    { id: 'in-stock', label: 'In stock', count: 128 },
    { id: 'low', label: 'Low stock', count: 7 },
    { id: 'out', label: 'Out of stock', count: 2 },
    { id: 'production', label: 'In production', count: 14 },
  ];
}
