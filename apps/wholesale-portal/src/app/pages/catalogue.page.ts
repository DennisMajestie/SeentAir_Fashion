import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SeFilter, SeFilterValue, SeMoneyPipe, SeToastService } from '@seentair/ui';
import { AvailabilityStatus, Pricing, PricingProduct } from '../api.service';
import { ApiService } from '../api.service';
import { CartService } from '../cart.service';
import { InfiniteScrollDirective } from '../infinite-scroll.directive';

/**
 * W3 Catalogue, carried verbatim from the Stitch screen. One card per product
 * with the account's wholesale price, the retail comparison when a real
 * discount exists, availability, and the route into the bulk order form.
 * Quantities are entered on the matrix; the cart (`CartService`) is the one
 * running total, shown against the MOQ.
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
  imports: [RouterLink, FormsModule, SeMoneyPipe, InfiniteScrollDirective],
  template: `
    <div class="stitch">
      <div class="bg-canvas text-light-on-surface min-h-screen md:bg-transparent pb-24 antialiased md:pb-8 selection:bg-accent/20">
        <header class="px-4 pt-4 pb-3 border-b border-border/70 bg-canvas/90 backdrop-blur-md sticky top-0 z-30 md:static">
          <div class="flex items-center justify-between mb-2.5">
            <div>
              <h1 class="text-[20px] font-bold text-light-primary tracking-tight">Catalogue</h1>
              <span class="text-[11px] text-light-secondary">Aba Factory Line • {{ pricing()?.total ?? 0 }} Active Silhouettes</span>
            </div>
            <a routerLink="/cart" class="w-9 h-9 rounded-full bg-light-surface border border-border flex items-center justify-center text-light-primary relative" aria-label="Bulk cart">
              <span class="material-symbols-outlined text-[18px]">shopping_bag</span>
              @if (cart.units() > 0) {
                <span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent text-on-accent text-[10px] font-bold flex items-center justify-center">{{ cart.units() }}</span>
              }
            </a>
          </div>

          <!-- Search + Filter Controls -->
          <div class="flex items-center gap-2">
            <div class="relative flex-1 flex items-center">
              <span class="absolute left-3 text-light-secondary material-symbols-outlined text-[18px]">search</span>
              <input
                type="search"
                placeholder="Search cuts, fabric GSM, ref..."
                class="w-full pl-9 pr-3 py-2 rounded-full bg-light-surface border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent"
                [ngModel]="query()"
                (ngModelChange)="query.set($event)"
              />
            </div>
            <label class="relative px-3 py-2 rounded-full bg-light-surface border border-border flex items-center gap-1 text-[12px] font-semibold text-light-primary cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">tune</span>
              {{ category() ?? 'Filter' }}
              <select
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Category filter"
                [ngModel]="category() || ''"
                (ngModelChange)="filterValue.set($event ? { category: $event } : {})"
              >
                <option value="">All categories</option>
                @for (c of categories(); track c.name) {
                  <option [value]="c.name">{{ c.name }} ({{ c.count }})</option>
                }
              </select>
            </label>
          </div>

          <!-- Category Pills -->
          <div class="flex items-center gap-1.5 overflow-x-auto pt-2.5 no-scrollbar text-[12px]">
            <button type="button" class="px-3 py-1 rounded-full whitespace-nowrap" [class]="category() ? 'bg-light-surface border border-border text-light-secondary' : 'bg-light-primary text-light-on-primary font-semibold'" (click)="filterValue.set({})">
              All Items
            </button>
            @for (c of categories(); track c.name) {
              <button type="button" class="px-3 py-1 rounded-full whitespace-nowrap" [class]="category() === c.name ? 'bg-light-primary text-light-on-primary font-semibold' : 'bg-light-surface border border-border text-light-secondary'" (click)="filterValue.set({ category: c.name })">
                {{ c.name }}
              </button>
            }
          </div>
          <p class="text-[11px] text-light-secondary pt-1.5 px-1">{{ description() }}</p>
        </header>

        <main class="px-4 py-4 flex flex-col gap-3.5 max-w-[390px] mx-auto w-full md:max-w-5xl">
          @if (needsAccount()) {
            <section class="needs-account bg-light-surface rounded-xl p-4 border border-border flex flex-col gap-2">
              <div class="flex items-center gap-2.5">
                <span class="w-8 h-8 rounded-full bg-accent/20 text-warning flex items-center justify-center flex-shrink-0">
                  <span class="material-symbols-outlined text-[18px]">lock</span>
                </span>
                <h2 class="text-[14px] font-bold text-light-primary">Wholesale account required</h2>
              </div>
              <p class="text-[12px] text-light-secondary">Wholesale ordering needs an approved account; the minimum order quantity applies.</p>
              @if (applied()) {
                <div class="p-2.5 rounded-lg bg-success/10 text-success text-[12px] font-semibold flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px]">check_circle</span>
                  Application submitted: pending review.
                </div>
              } @else {
                <button type="button" class="self-start px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold disabled:opacity-60" [disabled]="applying()" (click)="apply()">
                  {{ applying() ? 'Submitting…' : 'Apply for a wholesale account' }}
                </button>
              }
            </section>
          } @else if (loadError()) {
            <div class="load-error p-3.5 rounded-xl bg-light-surface border border-danger/30 flex items-center justify-between gap-2">
              <div>
                <h2 class="text-[13px] font-bold text-danger">The catalogue could not be loaded</h2>
                <span class="text-[11px] text-light-secondary">{{ loadError() }}</span>
              </div>
              <button type="button" class="px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold flex-shrink-0" (click)="load()">Try again</button>
            </div>
          } @else if (loading()) {
            <div class="pt-2" aria-busy="true">
              <span class="text-[11px] font-mono text-light-secondary uppercase tracking-wider block mb-2">Live Factory Queue Skeleton</span>
              <div class="bg-light-surface/60 rounded-xl p-3.5 border border-dashed border-border flex gap-3.5 animate-pulse">
                <div class="w-24 h-24 rounded-lg bg-canvas-tint/80 flex-shrink-0"></div>
                <div class="flex-1 flex flex-col justify-between py-1">
                  <div class="space-y-2">
                    <div class="h-3 w-1/3 bg-canvas-tint rounded"></div>
                    <div class="h-4 w-4/5 bg-canvas-tint rounded"></div>
                  </div>
                  <div class="h-5 w-24 bg-canvas-tint rounded-full"></div>
                </div>
              </div>
            </div>
          } @else if (pricing(); as p) {
            @if (cart.units() > 0 && !moqMet()) {
              <div class="moq-alert p-3.5 rounded-xl bg-warning/10 border border-warning/30 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2.5">
                  <span class="w-8 h-8 rounded-full bg-warning/20 text-warning flex items-center justify-center flex-shrink-0">
                    <span class="material-symbols-outlined text-[18px]">error</span>
                  </span>
                  <div>
                    <h2 class="text-[13px] font-bold text-warning">{{ moqShort() }} more units to reach the {{ moq() }}-unit minimum</h2>
                    <span class="text-[11px] text-light-secondary">Your bulk order holds {{ cart.units() }} units worth {{ cart.amount() | seMoney: 2 }}.</span>
                  </div>
                </div>
                <a routerLink="/cart" class="text-[12px] font-bold text-warning flex items-center gap-0.5 flex-shrink-0">
                  Review bulk order ({{ cart.units() }})
                  <span class="material-symbols-outlined text-[16px]">chevron_right</span>
                </a>
              </div>
            }

            @if (filtered().length === 0) {
              <div class="empty-state bg-light-surface p-3.5 rounded-xl border border-border flex flex-col items-center gap-1.5 text-center">
                <strong class="text-[14px] text-light-primary">No products match</strong>
                <p class="text-[11px] text-light-secondary">Try a different search or clear the category filter.</p>
                <button type="button" class="mt-1 px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold" (click)="clearFilters()">Clear filters</button>
              </div>
            } @else {
              <div class="md:grid md:grid-cols-2 md:gap-3.5 md:items-start">
              @for (product of filtered(); track product.id) {
                <article class="product-card bg-light-surface rounded-xl p-3.5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex gap-3.5">
                  <div class="w-24 h-28 rounded-lg bg-canvas-tint/70 border border-border flex flex-col items-center justify-center flex-shrink-0 relative overflow-hidden">
                    @if (product.imageUrl) {
                      <img [src]="product.imageUrl" alt="" loading="lazy" class="w-full h-full object-cover" />
                    } @else {
                      <span class="material-symbols-outlined text-[34px] text-light-secondary">styler</span>
                      <span class="sr-only">No image yet</span>
                    }
                    <span class="absolute bottom-1 bg-light-primary/80 text-light-on-primary text-[9px] font-mono px-1.5 py-0.2 rounded">{{ product.variants.length }} vars</span>
                  </div>

                  <div class="flex-1 flex flex-col justify-between">
                    <div>
                      <div class="flex items-start justify-between">
                        <span class="text-[10px] font-mono uppercase text-light-secondary">{{ product.category ?? 'Aba Line' }}</span>
                        <span class="text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.2 rounded whitespace-nowrap">MOQ: {{ p.moq }}u</span>
                      </div>
                      <h2 class="text-[14px] font-bold text-light-primary mt-0.5 leading-snug">{{ product.name }}</h2>
                      <span class="product-availability text-[11px] text-light-secondary">SKU {{ primarySku(product) }} • {{ availabilityLabel(product) }}</span>
                    </div>

                    <div class="product-price pt-1.5 border-t border-border flex items-end justify-between">
                      <div>
                        @if (hasDiscount()) {
                          <s class="text-[10px] text-light-secondary block">Retail {{ product.retailPrice | seMoney: 2 }}</s>
                          <span class="discount-badge text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.2 rounded">{{ discountPct() }}% off retail</span>
                        } @else {
                          <span class="discount-badge text-[10px] font-bold text-light-secondary bg-canvas-tint px-1.5 py-0.2 rounded">At retail</span>
                        }
                        <div class="font-mono font-bold text-light-primary text-[15px]"><strong>{{ product.wholesalePrice | seMoney: 2 }}</strong> <span class="text-[10px] font-normal text-light-secondary">/unit</span></div>
                      </div>
                      <a [routerLink]="['/catalogue', product.id, 'matrix']" class="product-cta px-3 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold hover:brightness-105 whitespace-nowrap">
                        Bulk Order
                      </a>
                    </div>
                  </div>
                </article>
              }

              @if (hasMore()) {
                @if (loadingMore()) {
                  <p class="text-[11px] text-light-secondary text-center md:col-span-2">Loading more…</p>
                } @else {
                  <div class="sentinel md:col-span-2" appInfiniteScroll (nearEnd)="loadMore()" aria-hidden="true"></div>
                }
                <p class="text-[11px] text-light-secondary text-center md:col-span-2">Showing {{ all().length }} of {{ total() }} products</p>
              }
              </div>
            }
          }
        </main>

      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .sentinel { height: 1px; }
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

  availabilityLabel(product: PricingProduct): string {
    const a = this.availability(product);
    return a === 'in_stock' ? 'In stock' : a === 'made_to_order' ? 'Made to order' : 'Out of stock';
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
