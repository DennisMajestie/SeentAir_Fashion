import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SeBadgeComponent,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeEmptyStateComponent,
  SeFilter,
  SeFilterBarComponent,
  SeFilterValue,
  SeIconComponent,
  SeMoneyPipe,
  SePageComponent,
  SeSkeletonComponent,
  SeStatusComponent,
  SeToastService,
} from '@seentair/ui';
import { AvailabilityStatus, Pricing, PricingProduct } from '../api.service';
import { ApiService } from '../api.service';
import { CartService } from '../cart.service';

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
    SeBadgeComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeEmptyStateComponent,
    SeFilterBarComponent,
    SeIconComponent,
    SeMoneyPipe,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
  ],
  template: `
    <se-page title="Wholesale catalogue" [description]="description()">
      @if (pricing(); as p) {
        <se-badge sePageStatus tone="info">{{ p.tier?.name ?? 'Standard tier' }}</se-badge>
      }
      @if (pricing()) {
        <a seButton variant="primary" sePageActions routerLink="/cart">
          Review bulk order ({{ cart.units() }})
        </a>
      }
      @if (pricing()) {
        <se-filter-bar
          sePageFilters
          searchLabel="Search catalogue"
          searchPlaceholder="Name, category or SKU"
          [filters]="filters()"
          [(query)]="query"
          [(value)]="filterValue"
          [summary]="filtered().length + ' of ' + (pricing()?.data?.length ?? 0) + ' products'"
        />
      }

      @if (needsAccount()) {
        <se-card title="Wholesale account required">
          <p>
            Wholesale ordering needs an approved account; the minimum order quantity applies. Our
            team reviews applications and assigns your price tier.
          </p>
          @if (applied()) {
            <se-banner tone="success" title="Application submitted">
              Your application is pending review. We will notify you once a tier is assigned.
            </se-banner>
          } @else {
            <button
              seButton
              variant="primary"
              type="button"
              [loading]="applying()"
              (click)="apply()"
            >
              Apply for a wholesale account
            </button>
          }
        </se-card>
      } @else if (loadError()) {
        <se-banner
          tone="danger"
          title="The catalogue could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          {{ loadError() }}
        </se-banner>
      } @else if (loading()) {
        <div aria-busy="true"><se-skeleton shape="block" [rows]="3" /></div>
      } @else if (pricing(); as p) {
        @if (cart.units() > 0 && !moqMet()) {
          <se-banner
            tone="warning"
            [title]="moqShort() + ' more units to reach the ' + moq() + '-unit minimum'"
          >
            Your bulk order holds {{ cart.units() }} units worth {{ cart.amount() | seMoney: 2 }}.
            Mix and match sizes and colours across products.
          </se-banner>
        }

        @if (filtered().length === 0) {
          <se-empty-state
            heading="No products match"
            text="Try a different search or clear the category filter."
            actionLabel="Clear filters"
            (action)="clearFilters()"
          />
        } @else {
          <div class="catalogue">
            @for (product of filtered(); track product.id) {
              <se-card [title]="product.name">
                <se-status seCardActions kind="stock" [value]="availability(product)" />
                <div class="product">
                  <div class="product__image">
                    @if (product.imageUrl) {
                      <img [src]="product.imageUrl" alt="" loading="lazy" />
                    } @else {
                      <span class="product__noimage"><se-icon name="tag" /> No image yet</span>
                    }
                  </div>
                  <p class="product__meta">
                    {{ product.category ?? 'Garment' }} · SKU {{ primarySku(product) }} ·
                    {{ product.variants.length }}
                    {{ product.variants.length === 1 ? 'variant' : 'variants' }}
                  </p>
                  <p class="product__price">
                    <strong>{{ product.wholesalePrice | seMoney: 2 }}</strong>
                    <span>per unit</span>
                    @if (hasDiscount()) {
                      <s>{{ product.retailPrice | seMoney: 2 }}</s>
                      <se-badge tone="success">{{ discountPct() }}% off retail</se-badge>
                    } @else {
                      <se-badge tone="neutral">At retail</se-badge>
                    }
                  </p>
                  <a
                    seButton
                    variant="primary"
                    class="product__cta"
                    [routerLink]="['/catalogue', product.id, 'matrix']"
                  >
                    Order in bulk
                  </a>
                </div>
              </se-card>
            }
          </div>
        }
      }
    </se-page>
  `,
  styles: `
    .catalogue {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--se-space-4);
    }
    .product {
      display: grid;
      gap: var(--se-space-2);
    }
    .product__image {
      aspect-ratio: 4 / 3;
      border-radius: var(--se-radius-md);
      background: var(--se-color-surface-sunken);
      overflow: hidden;
      display: grid;
      place-items: center;
    }
    .product__image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .product__noimage {
      display: inline-flex;
      gap: var(--se-space-2);
      align-items: center;
      color: var(--se-color-text-muted);
    }
    .product__meta {
      margin: 0;
      color: var(--se-color-text-muted);
    }
    .product__price {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--se-space-2);
      align-items: baseline;
    }
    .product__price s {
      color: var(--se-color-text-muted);
    }
    .product__cta {
      justify-self: start;
    }
  `,
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
    for (const product of this.pricing()?.data ?? []) {
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
    return (this.pricing()?.data ?? []).filter((product) => {
      if (category && (product.category ?? 'other') !== category) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        (product.category ?? '').toLowerCase().includes(q) ||
        product.variants.some((v) => v.sku.toLowerCase().includes(q))
      );
    });
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.pricing().subscribe({
      next: (p) => {
        this.pricing.set(p);
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
