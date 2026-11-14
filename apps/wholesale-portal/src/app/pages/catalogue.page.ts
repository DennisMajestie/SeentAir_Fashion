import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  SeBadgeComponent,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeEmptyStateComponent,
  SeFilter,
  SeFilterValue,
  SeMoneyPipe,
  SeStatusComponent,
  SeToastService,
} from '@seentair/ui';
import { AvailabilityStatus, Pricing, PricingProduct } from '../api.service';
import { ApiService } from '../api.service';
import { CartService } from '../cart.service';
import { InfiniteScrollDirective } from '../infinite-scroll.directive';

/**
 * Wholesale catalogue: one card per product with the account's wholesale
 * price, the retail comparison when a real discount exists, availability, and
 * the route into the bulk order form. Quantities are entered on the matrix;
 * the cart (`CartService`) is the one running total, shown against the MOQ.
 *
 * Rules the API enforces and this screen relies on:
 *  - `moq` is global, not per account or tier.
 *  - `hasDiscount` is false when wholesale equals retail, so no strike-through
 *    and no "0% off" badge.
 *  - A 401/403 on pricing means the buyer has no approved wholesale account
 *    yet; any other failure is a load error with a retry.
 */
@Component({
  selector: 'app-catalogue',
  imports: [
    RouterLink,
    FormsModule,
    SeBadgeComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeEmptyStateComponent,
    SeMoneyPipe,
    SeStatusComponent,
    InfiniteScrollDirective,
  ],
  template: `
    <div class="w3">
      <header class="w3-head cardless">
        <div class="w3-head-top">
          <div>
            <h1>Catalogue</h1>
            <span class="muted small">Aba Factory Line • {{ pricing()?.total ?? 0 }} products</span>
          </div>
          <a routerLink="/cart" class="cart-btn" aria-label="Bulk cart">
            <span class="material-symbols-outlined">shopping_bag</span>
            @if (cart.units() > 0) { <span class="count">{{ cart.units() }}</span> }
          </a>
        </div>

        @if (pricing()) {
          <div class="w3-controls">
            <label class="search">
              <span class="material-symbols-outlined">search</span>
              <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search cuts, fabric, SKU..." />
            </label>
            <label class="filter">
              <span class="material-symbols-outlined">tune</span>
              <select [ngModel]="filterValue()['category'] || ''" (ngModelChange)="filterValue.set({ category: $event || undefined })">
                <option value="">All categories</option>
                @for (c of categories(); track c.name) { <option [value]="c.name">{{ c.name }} ({{ c.count }})</option> }
              </select>
            </label>
          </div>
          <div class="chips">
            <button type="button" class="chip" [class.on]="!category()" (click)="filterValue.set({})">All Items</button>
            @for (c of categories(); track c.name) {
              <button type="button" class="chip" [class.on]="category() === c.name" (click)="filterValue.set({ category: c.name })">{{ c.name }}</button>
            }
          </div>
          <p class="muted small w3-sum">{{ filtered().length }} of {{ pricing()?.total ?? all().length }} products</p>
        }
      </header>

      @if (needsAccount()) {
        <se-card title="Wholesale account required">
          <p>Wholesale ordering needs an approved account; the minimum order quantity applies.</p>
          @if (applied()) {
            <se-banner tone="success" title="Application submitted">Pending review. We will notify you once a tier is assigned.</se-banner>
          } @else {
            <button seButton variant="primary" type="button" [loading]="applying()" (click)="apply()">Apply for a wholesale account</button>
          }
        </se-card>
      } @else if (loadError()) {
        <se-banner tone="danger" title="The catalogue could not be loaded" actionLabel="Try again" (action)="load()">{{ loadError() }}</se-banner>
      } @else if (loading()) {
        <div aria-busy="true" class="card muted small">Loading catalogueâ€¦</div>
      } @else if (pricing(); as p) {
        @if (cart.units() > 0 && !moqMet()) {
          <se-banner tone="warning" [title]="moqShort() + ' more units to reach the ' + moq() + '-unit minimum'">
            Your bulk order holds {{ cart.units() }} units worth {{ cart.amount() | seMoney: 2 }}.
          </se-banner>
        }

        @if (filtered().length === 0) {
          <se-empty-state heading="No products match" text="Try a different search or clear the category filter." actionLabel="Clear filters" (action)="clearFilters()" />
        } @else {
          <div class="w3-list">
            @for (product of filtered(); track product.id) {
              <article class="w3-card">
                <div class="thumb">
                  @if (product.imageUrl) {
                    <img [src]="product.imageUrl" alt="" loading="lazy" />
                  } @else {
                    <span class="material-symbols-outlined">styler</span>
                  }
                  <span class="gsm">{{ product.variants.length }} vars</span>
                </div>
                <div class="body">
                  <div class="topline">
                    <span class="mono muted">{{ product.category ?? 'Aba Line' }}</span>
                    <span class="moq">MOQ: {{ p.moq }}u</span>
                  </div>
                  <h2>{{ product.name }}</h2>
                  <p class="muted small">SKU {{ primarySku(product) }} • {{ availability(product).replace('_',' ') }}</p>
                  <div class="price-row">
                    <div>
                      @if (hasDiscount()) { <span class="retail">Retail {{ product.retailPrice | seMoney: 2 }}</span> }
                      <div class="price">{{ product.wholesalePrice | seMoney: 2 }} <span>/ unit</span></div>
                    </div>
                    <a class="cta" [routerLink]="['/catalogue', product.id, 'matrix']">Bulk Order</a>
                  </div>
                </div>
              </article>
            }
          </div>

          @if (hasMore()) {
            @if (loadingMore()) {
              <p class="muted small center">Loading moreâ€¦</p>
            } @else {
              <div class="sentinel" appInfiniteScroll (nearEnd)="loadMore()" aria-hidden="true"></div>
            }
            <p class="muted small center">Showing {{ all().length }} of {{ total() }} products</p>
          }
        }
      }
    </div>
  `,
  styles: [`
    :host{display:block;font-family:'Urbanist',sans-serif;}
    .w3{display:flex;flex-direction:column;gap:12px;padding-bottom:12px;}
    .w3-head{display:flex;flex-direction:column;gap:10px;}
    .w3-head-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}
    .w3-head h1{margin:0;font:700 20px/1.1 Urbanist,sans-serif;color:#1b1916;}
    .muted{color:#7b756a;} .small{font-size:11px;} .mono{font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;}
    .cart-btn{position:relative;width:36px;height:36px;border-radius:999px;border:1px solid #e8e1d3;background:#fffdf9;display:inline-flex;align-items:center;justify-content:center;color:#1b1916;text-decoration:none;}
    .cart-btn .count{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#c88a12;color:#1a1405;font:700 10px/16px Urbanist,sans-serif;text-align:center;}
    .w3-controls{display:flex;gap:8px;}
    .search,.filter{display:flex;align-items:center;gap:6px;border:1px solid #e8e1d3;background:#fffdf9;border-radius:999px;padding:8px 12px;color:#7b756a;}
    .search{flex:1;} .search input{border:0;background:transparent;outline:0;width:100%;font:400 13px/1.2 Urbanist,sans-serif;color:#1b1916;}
    .filter select{border:0;background:transparent;outline:0;font:600 12px/1 Urbanist,sans-serif;color:#1b1916;max-width:110px;}
    .material-symbols-outlined{font-size:18px;}
    .chips{display:flex;gap:6px;overflow:auto;padding-bottom:2px;}
    .chip{flex:0 0 auto;border:1px solid #e8e1d3;background:#fffdf9;color:#7b756a;border-radius:999px;padding:6px 12px;font:500 12px/1 Urbanist,sans-serif;}
    .chip.on{background:#1b1916;color:#fff;border-color:#1b1916;font-weight:600;}
    .w3-sum{margin:0;}
    .w3-list{display:flex;flex-direction:column;gap:14px;}
    .w3-card{display:flex;gap:14px;padding:14px;background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;box-shadow:0 8px 24px -4px rgba(27,25,22,.05);}
    .thumb{width:96px;height:112px;border-radius:10px;background:rgba(239,227,200,.6);border:1px solid #e8e1d3;display:flex;align-items:center;justify-content:center;position:relative;flex:none;overflow:hidden;color:#7b756a;}
    .thumb img{width:100%;height:100%;object-fit:cover;}
    .thumb .gsm{position:absolute;bottom:4px;background:rgba(27,25,22,.8);color:#fff;font:500 9px/1 'JetBrains Mono',monospace;padding:2px 6px;border-radius:4px;}
    .body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;gap:4px;}
    .topline{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;}
    .moq{font:700 10px/1 Urbanist,sans-serif;color:#23804d;background:rgba(35,128,77,.1);padding:2px 6px;border-radius:4px;white-space:nowrap;}
    .body h2{margin:2px 0 0;font:700 14px/1.25 Urbanist,sans-serif;color:#1b1916;}
    .body p{margin:0;}
    .price-row{display:flex;justify-content:space-between;align-items:flex-end;gap:8px;padding-top:6px;border-top:1px solid #e8e1d3;margin-top:2px;}
    .retail{display:block;font-size:10px;color:#7b756a;text-decoration:line-through;}
    .price{font:700 15px/1.1 'JetBrains Mono',monospace;color:#1b1916;}
    .price span{font:400 10px/1 Urbanist,sans-serif;color:#7b756a;}
    .cta{background:#c88a12;color:#1a1405;text-decoration:none;border-radius:999px;padding:7px 12px;font:600 12px/1 Urbanist,sans-serif;white-space:nowrap;}
    .center{text-align:center;margin:4px 0;}
    .sentinel{height:1px;}
    .card{background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;padding:16px;}
  `],
})
export class CataloguePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(SeToastService);
  readonly cart = inject(CartService);

  readonly pricing = signal<Pricing | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly needsAccount = signal(false);
  readonly applied = signal(false);
  readonly applying = signal(false);

  /** Paged-in rows, the pages fetched so far and the catalogue's real size. */
  readonly all = signal<PricingProduct[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loadingMore = signal(false);

  readonly query = signal('');
  readonly filterValue = signal<SeFilterValue>({});

  readonly moq = computed(() => this.pricing()?.moq ?? 0);
  readonly moqMet = computed(() => this.moq() > 0 && this.cart.units() >= this.moq());
  readonly moqShort = computed(() => Math.max(0, this.moq() - this.cart.units()));

  /** The account's real discount. False means wholesale == retail. */
  readonly hasDiscount = computed(() => this.pricing()?.hasDiscount === true);
  readonly discountPct = computed(() => {
    const t = this.pricing()?.tier;
    return t ? Math.round(t.discountPercent * 10) / 10 : 0;
  });

  readonly description = computed(() => {
    const moq = this.moq();
    if (!moq) return 'Wholesale prices at your account tier.';
    return `Minimum order ${moq} units across the catalogue; mix and match sizes and colours.`;
  });

  readonly categories = computed(() => {
    const counts = new Map<string, number>();
    for (const product of this.all()) {
      const c = product.category ?? 'other';
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  });

  readonly filters = computed<SeFilter[]>(() => [
    {
      key: 'category',
      label: 'Category',
      anyLabel: 'All categories',
      options: this.categories().map((c) => ({ value: c.name, label: `${c.name} (${c.count})` })),
    },
  ]);

  readonly category = computed(() => this.filterValue()['category'] || null);

  readonly filtered = computed<PricingProduct[]>(() => {
    const q = this.query().trim().toLowerCase();
    const category = this.category();
    return this.all().filter((product) => {
      if (category && (product.category ?? 'other') !== category) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        (product.category ?? '').toLowerCase().includes(q) ||
        product.variants.some((v) => v.sku.toLowerCase().includes(q))
      );
    });
  });

  /** True while the catalogue holds products not yet loaded. */
  hasMore(): boolean {
    return this.all().length < this.total();
  }

  /** Appends the next page; a lagging page can never duplicate a row. */
  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.api.pricing(this.page() + 1).subscribe({
      next: (p) => {
        const seen = new Set(this.all().map((x) => x.id));
        this.all.update((rows) => [...rows, ...p.data.filter((x) => !seen.has(x.id))]);
        this.page.set(this.page() + 1);
        this.total.set(p.total);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.pricing().subscribe({
      next: (p) => {
        this.pricing.set(p);
        this.all.set(p.data);
        this.total.set(p.total);
        this.page.set(1);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        const status = Number(err?.status ?? 0);
        if (status === 401 || status === 403) this.needsAccount.set(true);
        else this.loadError.set(err?.error?.message ?? 'Check your connection and try again.');
      },
    });
  }

  clearFilters(): void {
    this.query.set('');
    this.filterValue.set({});
  }

  primarySku(product: PricingProduct): string {
    return product.variants[0]?.sku ?? product.id.slice(0, 8);
  }

  /** Product-level availability: the best state any variant is in. */
  availability(product: PricingProduct): AvailabilityStatus {
    const states = product.variants.map((v) => v.availabilityStatus);
    if (states.includes('in_stock')) return 'in_stock';
    if (states.includes('made_to_order')) return 'made_to_order';
    return 'out_of_stock';
  }

  apply(): void {
    this.applying.set(true);
    this.api.applyForAccount().subscribe({
      next: () => {
        this.applying.set(false);
        this.applied.set(true);
        this.toast.show('Application submitted: pending review.');
      },
      error: (err) => {
        this.applying.set(false);
        this.toast.show(err?.error?.message ?? 'Application failed.', { tone: 'danger' });
      },
    });
  }
}
