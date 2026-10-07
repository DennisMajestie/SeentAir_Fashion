import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  SeBadgeComponent,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeEmptyStateComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMoneyPipe,
  SePageComponent,
  SeSkeletonComponent,
  SeStatusComponent,
  SeToastService,
} from '@seentair/ui';
import { ApiService, Pricing, PricingProduct, PricingVariant } from '../api.service';
import { CartService } from '../cart.service';

/**
 * Bulk order form: a colour × size quantity grid for one product.
 *
 * The grid writes into the shared cart; the MOQ counts this form plus the
 * other products already drafted, and the server re-checks it on commit.
 * A shortfall is a warning, never a block: the cart states the rule again.
 */
@Component({
  selector: 'app-matrix',
  imports: [
    FormsModule,
    RouterLink,
    SeBadgeComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeEmptyStateComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMoneyPipe,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
  ],
  template: `
    <se-page
      [title]="product()?.name ?? 'Bulk order form'"
      [breadcrumbs]="[{ label: 'Catalogue', link: '/catalogue' }, { label: 'Bulk order' }]"
      [description]="moqKnown() ? moq() + '-unit minimum per batch, mixed across products' : ''"
    >
      @if (product(); as prod) {
        <se-status sePageStatus kind="stock" [value]="availability(prod)" />
      }

      @if (loadError()) {
        <se-banner
          tone="danger"
          title="The product could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          {{ loadError() }}
        </se-banner>
      } @else if (loading()) {
        <div aria-busy="true"><se-skeleton shape="detail" /></div>
      } @else if (product(); as prod) {
        <se-card title="Product">
          <dl seKv>
            <div seKvItem label="SKU">{{ prod.variants[0]?.sku ?? '—' }}</div>
            <div seKvItem label="Category">{{ prod.category ?? 'Garment' }}</div>
            <div seKvItem label="Wholesale price" numeric>
              {{ prod.wholesalePrice | seMoney: 2 }} per unit
            </div>
            <div seKvItem label="Retail price" numeric>{{ prod.retailPrice | seMoney: 2 }}</div>
            <div seKvItem label="Rate card">{{ tierName() }}</div>
            <div seKvItem label="Minimum order">
              {{ moqKnown() ? moq() + ' units across the batch' : 'Being confirmed' }}
            </div>
          </dl>
        </se-card>

        @if (moqShort() > 0) {
          <se-banner tone="warning" [title]="moqShort() + ' more units to reach the minimum'">
            The {{ moq() }}-unit minimum counts this form ({{ formUnits() }}) and the
            {{ otherUnits() }} units already in your draft. You can still add this product; the cart
            will show the shortfall before you commit.
          </se-banner>
        }

        <se-card title="Quantities by colour and size" flush>
          @if (moqShort() > 0) {
            <button seButton size="sm" seCardActions type="button" (click)="autoFill()">
              Spread {{ moqShort() }} units across the grid
            </button>
          }
          <div class="se-table se-table--compact grid-scroll">
            <table class="se-table__table">
              <caption>
                Units per colour and size for
                {{
                  prod.name
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Colour</th>
                  @for (size of sizes(); track size) {
                    <th scope="col" class="se-num">{{ size }}</th>
                  }
                  <th scope="col" class="se-num">Row total</th>
                </tr>
              </thead>
              <tbody>
                @for (colour of colours(); track colour) {
                  <tr>
                    <th scope="row">{{ colour }}</th>
                    @for (size of sizes(); track size) {
                      <td class="se-num">
                        @if (variantFor(colour, size); as v) {
                          <input
                            seInput
                            type="number"
                            min="0"
                            step="1"
                            inputmode="numeric"
                            class="qty"
                            [max]="stockCap(v)"
                            [ngModel]="qtyOf(v.id)"
                            (ngModelChange)="setQty(v.id, $event)"
                            [attr.aria-label]="colour + ' size ' + size"
                            [attr.aria-describedby]="stockNote(v) ? 'stock-' + v.id : null"
                          />
                          @if (stockNote(v); as note) {
                            <span class="stock" [id]="'stock-' + v.id">{{ note }}</span>
                          }
                        } @else {
                          <span aria-hidden="true">—</span>
                        }
                      </td>
                    }
                    <td class="se-num">{{ colourSum(colour) }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Size total</th>
                  @for (size of sizes(); track size) {
                    <td class="se-num">{{ sizeSum(size) }}</td>
                  }
                  <td class="se-num">
                    <strong>{{ formUnits() }}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </se-card>

        <div class="se-form__actions se-form__actions--sticky">
          <span class="total" aria-live="polite">
            <strong>{{ formUnits() }}</strong> {{ formUnits() === 1 ? 'unit' : 'units' }} ·
            {{ formAmount() | seMoney: 2 }}
            @if (moqKnown()) {
              <se-badge [tone]="moqShort() > 0 ? 'warning' : 'success'">
                {{ moqShort() > 0 ? 'Batch ' + committedUnits() + ' / ' + moq() : 'MOQ met' }}
              </se-badge>
            }
          </span>
          <a seButton variant="secondary" routerLink="/catalogue">Back to catalogue</a>
          <button
            seButton
            variant="primary"
            type="button"
            [disabled]="formUnits() === 0"
            (click)="addToOrder()"
          >
            Add to bulk cart
          </button>
        </div>
      } @else {
        <se-empty-state
          heading="Product not in your catalogue"
          text="It may have been removed or is not priced for your tier."
          actionLabel="Back to catalogue"
          (action)="router.navigate(['/catalogue'])"
        />
      }
    </se-page>
  `,
  styles: `
    .grid-scroll {
      overflow-x: auto;
    }
    .qty {
      width: 5.5rem;
    }
    .stock {
      display: block;
      color: var(--se-color-text-muted);
    }
    .total {
      margin-right: auto;
      display: inline-flex;
      flex-wrap: wrap;
      gap: var(--se-space-2);
      align-items: center;
    }
  `,
})
export class MatrixPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(SeToastService);
  readonly router = inject(Router);
  readonly cart = inject(CartService);

  readonly product = signal<PricingProduct | null>(null);
  readonly pricingData = signal<Pricing | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  /** Quantities on this form, keyed by variant id. */
  readonly quantities = signal<Record<string, number>>({});

  /** Derived stock per variant. `null` or absent means no cap. */
  readonly stockState = signal<Record<string, number | null>>({});

  readonly formUnits = computed(() =>
    (this.product()?.variants ?? []).reduce((n, v) => n + this.qtyOf(v.id), 0),
  );

  readonly formAmount = computed(() => {
    const prod = this.product();
    if (!prod) return 0;
    const sum = prod.variants.reduce((n, v) => n + this.qtyOf(v.id) * v.wholesalePrice, 0);
    return Math.round(sum * 100) / 100;
  });

  /** Units drafted for other products. */
  readonly otherUnits = computed(() =>
    this.cart
      .lines()
      .filter((l) => l.productId !== this.product()?.id)
      .reduce((n, l) => n + l.quantity, 0),
  );

  readonly committedUnits = computed(() => this.otherUnits() + this.formUnits());

  readonly moq = computed(() => this.pricingData()?.moq ?? 0);
  /** False while pricing is loading or failed: nothing to warn about yet. */
  readonly moqKnown = computed(() => this.moq() > 0);
  readonly moqShort = computed(() =>
    this.moqKnown() ? Math.max(0, this.moq() - this.committedUnits()) : 0,
  );

  readonly sizes = computed(() => distinct(this.product()?.variants ?? [], (v) => v.size || 'OS'));
  readonly colours = computed(() =>
    distinct(this.product()?.variants ?? [], (v) => v.colour || 'standard'),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading.set(true);
    this.loadError.set(null);
    this.api.pricing().subscribe({
      next: (p) => {
        this.pricingData.set(p);
        const prod = p.data.find((x) => x.id === id) ?? null;
        this.product.set(prod);
        this.loading.set(false);
        // Seed from existing draft lines so editing a product round-trips.
        const seeded: Record<string, number> = {};
        for (const line of this.cart.lines()) {
          if (line.productId === id) seeded[line.variantId] = line.quantity;
        }
        this.quantities.set(seeded);
        if (prod && prod.variants.length > 0) {
          this.api.stock(prod.variants.map((v) => v.id)).subscribe({
            next: (s) => this.stockState.set(s),
            error: () => this.stockState.set({}),
          });
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message ?? 'Check your connection and try again.');
      },
    });
  }

  tierName(): string {
    return this.pricingData()?.tier?.name ?? 'Standard';
  }

  availability(prod: PricingProduct): string {
    const states = prod.variants.map((v) => v.availabilityStatus);
    if (states.includes('in_stock')) return 'in_stock';
    if (states.includes('made_to_order')) return 'made_to_order';
    return 'out_of_stock';
  }

  qtyOf(variantId: string): number {
    return this.quantities()[variantId] ?? 0;
  }

  /** Coerce to a non-negative integer, clamped to real derived stock. */
  setQty(variantId: string, raw: unknown): void {
    const variant = this.product()?.variants.find((v) => v.id === variantId);
    const cap = variant ? this.stockCap(variant) : null;
    let n = Math.max(0, Math.floor(Number(raw) || 0));
    if (cap !== null && n > cap) n = cap;
    this.quantities.update((s) => ({ ...s, [variantId]: n }));
  }

  /** Made-to-order variants carry no shelf stock, so they are never capped. */
  stockCap(v: PricingVariant): number | null {
    if (v.availabilityStatus === 'made_to_order') return null;
    const raw = this.stockState()[v.id];
    return raw === undefined ? null : raw;
  }

  stockNote(v: PricingVariant): string {
    const cap = this.stockCap(v);
    if (cap === null) return '';
    return cap === 0 ? 'None in stock' : `${cap} in stock`;
  }

  variantFor(colour: string, size: string): PricingVariant | undefined {
    return this.product()?.variants.find(
      (v) => (v.colour || 'standard') === colour && (v.size || 'OS') === size,
    );
  }

  colourSum(colour: string): number {
    return (this.product()?.variants ?? [])
      .filter((v) => (v.colour || 'standard') === colour)
      .reduce((n, v) => n + this.qtyOf(v.id), 0);
  }

  sizeSum(size: string): number {
    return (this.product()?.variants ?? [])
      .filter((v) => (v.size || 'OS') === size)
      .reduce((n, v) => n + this.qtyOf(v.id), 0);
  }

  /** Spread the missing MOQ units across the grid round-robin, never past stock. */
  autoFill(): void {
    const variants = this.product()?.variants ?? [];
    if (variants.length === 0) return;
    let remaining = this.moqShort();
    let i = 0;
    const limit = variants.length * (remaining + 1);
    while (remaining > 0 && i < limit) {
      const v = variants[i % variants.length];
      const cap = this.stockCap(v);
      if (cap === null || this.qtyOf(v.id) < cap) {
        this.setQty(v.id, this.qtyOf(v.id) + 1);
        remaining--;
      }
      i++;
    }
    if (remaining > 0) {
      this.toast.show(`Stock covers only part of the shortfall: ${remaining} units unfilled.`);
    }
  }

  addToOrder(): void {
    const prod = this.product();
    if (!prod) return;
    const lines = prod.variants
      .filter((v) => this.qtyOf(v.id) > 0)
      .map((v) => ({
        variantId: v.id,
        productId: prod.id,
        productName: prod.name,
        sku: v.sku,
        size: v.size,
        colour: v.colour,
        unitPrice: v.wholesalePrice,
        quantity: this.qtyOf(v.id),
      }));
    this.cart.setProduct(prod.id, lines);
    this.toast.show(`${prod.name}: ${this.formUnits()} units in your bulk cart.`);
    void this.router.navigate(['/cart']);
  }
}

function distinct<T>(items: T[], key: (item: T) => string): string[] {
  const seen: string[] = [];
  for (const item of items) {
    const k = key(item);
    if (!seen.includes(k)) seen.push(k);
  }
  return seen;
}
