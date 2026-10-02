import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ApiService,
  AvailabilityStatus,
  Pricing,
  PricingProduct,
  PricingVariant,
} from '../api.service';
import { CartService } from '../cart.service';
import { StripComponent } from '../ui/primitives';

/**
 * W3, Catalogue. Products collapse to a compact row and expand in place to a
 * quantity grid. MOQ policy banner, SKU search, category chips, tier pricing
 * and the sticky draft-batch allocation bar.
 *
 * Three data rules this screen depends on, all enforced by the API:
 *  - `moq` is configured globally, not per account or tier.
 *  - `hasDiscount` is false when wholesale equals retail, so the retail
 *    comparison and discount badge are hidden rather than showing "0%".
 *  - There is one real price band. Volume tiers are not in the pricing API,
 *    so the ladder shows only what exists and labels the rest as a quote.
 */
@Component({
  selector: 'app-catalogue',
  imports: [CommonModule, FormsModule, RouterLink, StripComponent],
  template: `
    @if (needsAccount()) {
      <!-- Pre-approval apply flow (kept from the live baseline; W1 routes buyers here) -->
      <se-strip label="Wholesale account required" badge="B2B">
        <p class="apply-copy">
          Wholesale ordering needs an approved account (minimum order quantity applies). Apply below
          - our team reviews applications and assigns your price tier.
        </p>
        <button class="cta" (click)="apply()" [disabled]="applied()">
          {{
            applied() ? 'Application submitted: pending review' : 'Apply for a wholesale account'
          }}
        </button>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </se-strip>
    } @else if (pricing(); as p) {
      <div class="policy-strip" style="margin-top: var(--space-md)">
        <span class="material-symbols-outlined" aria-hidden="true">inventory</span>
        <div style="flex:1">
          <strong>MOQ threshold policy</strong>
          Minimum Order Quantity: {{ p.moq }} units across the catalogue. Mix &amp; match sizes and
          colours accepted.
        </div>
        <span class="chip soft">{{ p.tier?.name ?? 'Standard tier' }}</span>
      </div>

      <div class="search-row">
        <div class="search-box">
          <span class="material-symbols-outlined" aria-hidden="true">search</span>
          <input
            type="search"
            [(ngModel)]="query"
            name="q"
            placeholder="Search SKU, garment silhouette, fabric spec…"
            aria-label="Search catalogue"
          />
        </div>
      </div>

      <div class="filter-chips" role="tablist" aria-label="Categories">
        <button [class.active]="category() === null" (click)="category.set(null)">
          All garments <span class="n">{{ p.data.length }}</span>
        </button>
        @for (cat of categories(); track cat.name) {
          <button [class.active]="category() === cat.name" (click)="category.set(cat.name)">
            {{ cat.name }} <span class="n">{{ cat.count }}</span>
          </button>
        }
      </div>

      @for (product of filtered(); track product.id) {
        <article class="prodrow" [class.open]="isOpen(product.id)">
          <button
            type="button"
            class="pr-head"
            [attr.aria-expanded]="isOpen(product.id)"
            [attr.aria-controls]="panelId(product.id)"
            (click)="toggle(product.id)"
          >
            <span class="pr-thumb" aria-hidden="true">
              @if (product.imageUrl) {
                <img [src]="product.imageUrl" alt="" loading="lazy" />
              } @else {
                <span class="material-symbols-outlined">checkroom</span>
              }
            </span>
            <span class="pr-ident">
              <span class="pr-sku">SKU: {{ primarySku(product) }}</span>
              <span class="pr-name">{{ product.name }}</span>
              <span class="pr-cat">{{ product.category ?? 'garment' }}</span>
            </span>
            <span class="pr-ladder" aria-label="Pricing">
              @for (band of ladder(product); track band.label) {
                <span class="lad" [class.mine]="band.mine">
                  <span class="lad-range">{{ band.label }}</span>
                  <span class="lad-price">{{ band.price }}</span>
                </span>
              }
            </span>
            <span class="pr-tail">
              <span class="pr-price">
                <strong>₦{{ product.wholesalePrice | number: '1.0-2' }}</strong>
                @if (hasDiscount()) {
                  <s>₦{{ product.retailPrice | number: '1.0-2' }}</s>
                }
              </span>
              <!-- No badge when wholesale == retail; "At retail" instead of a fake 0%. -->
              @if (hasDiscount()) {
                <span class="margin">{{ discountPct() }}% off retail</span>
              } @else {
                <span class="margin at-retail">At retail</span>
              }
              <span class="material-symbols-outlined chev" aria-hidden="true">expand_more</span>
            </span>
          </button>

          @if (isOpen(product.id)) {
            <div class="pr-panel" [id]="panelId(product.id)">
              <div class="pr-grid-head">
                <span>Configure units by size / colour</span>
                <a class="link" [routerLink]="['/catalogue', product.id, 'matrix']">Full matrix</a>
              </div>
              <div class="pr-qty-head" aria-hidden="true">
                @for (col of columns(product); track col) {
                  <span class="qh-col">{{ col }}</span>
                }
              </div>
              <div class="pr-qty">
                @for (v of quickVariants(product); track v.id) {
                  <div class="qcell">
                    <label class="q-l" [for]="inputId(v)">
                      {{ v.size || 'OS' }} · {{ v.colour || '—' }}
                      @if (v.availabilityStatus !== 'in_stock') {
                        <span
                          class="avail"
                          [class.mto]="v.availabilityStatus === 'made_to_order'"
                          >{{ availabilityLabel(v) }}</span
                        >
                      }
                    </label>
                    <input
                      [id]="inputId(v)"
                      type="number"
                      min="0"
                      step="1"
                      inputmode="numeric"
                      [max]="stockCap(v)"
                      [ngModel]="qtyOf(v.id)"
                      (ngModelChange)="setQty(v.id, $event)"
                      [attr.aria-describedby]="stockNote(v) ? inputId(v) + '-stock' : null"
                      [attr.aria-label]="
                        product.name + ' ' + (v.size || 'OS') + ' ' + (v.colour || '')
                      "
                    />
                    <!-- Stock reads under its own cell so it survives the label
                         truncation at 360px, and is announced via
                         aria-describedby. -->
                    @if (stockNote(v); as note) {
                      <span class="q-stock" [id]="inputId(v) + '-stock'">{{ note }}</span>
                    }
                  </div>
                }
              </div>
              @if (product.variants.length > quickLimit) {
                <p class="muted small" style="margin: var(--space-xs) 0 0">
                  Showing the first {{ quickLimit }} colourways. The
                  <a class="link" [routerLink]="['/catalogue', product.id, 'matrix']"
                    >bulk matrix</a
                  >
                  lists all {{ product.variants.length }}.
                </p>
              }
              <div class="pr-foot">
                <span class="foot-units">
                  <strong>{{ productUnits(product) }}</strong> pcs selected
                  @if (productUnits(product) > 0) {
                    <span class="muted">· ₦{{ productAmount(product) | number: '1.0-2' }}</span>
                  }
                </span>
                <button
                  class="cta small"
                  (click)="addToOrder(product)"
                  [disabled]="productUnits(product) === 0"
                >
                  <span class="material-symbols-outlined" aria-hidden="true"
                    >add_shopping_cart</span
                  >
                  Add to bulk order
                </button>
              </div>
            </div>
          }
        </article>
      }
      @if (filtered().length === 0) {
        <p class="muted">No garments match “{{ query }}”.</p>
      }

      @if (message()) {
        <p class="success">{{ message() }}</p>
      }
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      <!-- Sticky MOQ-progress tray. Sits above the page's mobile bottom nav and
           reserves body padding so it can never cover the last row. -->
      <div
        class="moq-tray"
        role="region"
        aria-label="Order minimum progress"
        [class.active]="trayUnits() > 0"
      >
        <div class="mt-row">
          <div class="mt-counts">
            <span class="mt-units" [class.met]="moqMet()">{{ trayUnits() }}</span>
            <div class="mt-labels">
              <span class="mt-title">{{ trayTitle() }}</span>
              <span class="mt-sub">
                @if (moqMet()) {
                  MOQ of {{ moq() }} met
                } @else {
                  {{ moqShort() }} more to reach {{ moq() }}
                }
                @if (trayAmount() > 0) {
                  <span class="mt-amt">₦{{ trayAmount() | number: '1.0-2' }}</span>
                }
              </span>
            </div>
          </div>
          <a
            class="cta small mt-review"
            routerLink="/cart"
            [attr.aria-disabled]="trayUnits() === 0"
            [class.is-disabled]="trayUnits() === 0"
            (click)="onReview($event)"
          >
            Review bulk order
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </a>
        </div>
        <div
          class="mt-bar"
          role="progressbar"
          [attr.aria-valuenow]="trayUnits()"
          [attr.aria-valuemin]="0"
          [attr.aria-valuemax]="moq()"
          [attr.aria-label]="'Units selected toward the ' + moq() + '-unit minimum'"
        >
          <span class="mt-fill" [class.met]="moqMet()" [style.width.%]="moqProgress()"></span>
        </div>
      </div>
    } @else {
      <p class="muted">Loading catalogue…</p>
    }
  `,
})
export class CataloguePage implements OnInit {
  private readonly api = inject(ApiService);
  readonly cart = inject(CartService);
  readonly pricing = signal<Pricing | null>(null);
  readonly needsAccount = signal(false);
  readonly applied = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly category = signal<string | null>(null);
  readonly quickLimit = 6;
  query = '';

  /** Expanded product ids. Starts empty - nothing is forced open. */
  readonly openIds = signal<ReadonlySet<string>>(new Set());

  /**
   * Quantities in progress, keyed by variant id. A plain record wrapped in a
   * signal so the running totals and the footer update as you type, without
   * committing to the draft batch.
   */
  private readonly qtyState = signal<Record<string, number>>({});
  readonly quantities = computed(() => this.qtyState());

  /**
   * Units typed but not yet added to the draft batch.
   *
   * The tray counts committed lines plus this, so the global total moves the
   * moment a quantity changes. `addToOrder` clears a product's entries as it
   * commits them, so the two never double count.
   */
  readonly pendingUnits = computed(() =>
    Object.values(this.qtyState()).reduce((n, q) => n + (q || 0), 0),
  );

  /**
   * Derived stock per variant id, loaded once the catalogue arrives.
   *
   * `null` is "not stocked" (made-to-order) or "unknown" - there is no cap in
   * that case, because inventing a limit would be worse than showing none.
   * A number caps the input client-side; the order service re-checks stock
   * from the ledger at commit, so this is a courtesy, not the gate.
   */
  private readonly stockState = signal<Record<string, number | null>>({});

  constructor() {
    effect(() => {
      const p = this.pricing();
      if (!p) return;
      const ids = p.data.flatMap((product) => product.variants.map((v) => v.id));
      if (ids.length === 0) return;
      this.api.stock(ids).subscribe({
        next: (s) => this.stockState.set(s),
        // No stock data: leave the map empty so every input stays uncapped.
        error: () => this.stockState.set({}),
      });
    });
  }

  /**
   * Stock cap for a variant, or null when there is none to enforce.
   * A made-to-order variant carries no shelf stock, so it is never capped.
   */
  stockCap(v: PricingVariant): number | null {
    if (v.availabilityStatus === 'made_to_order') return null;
    const raw = this.stockState()[v.id];
    if (raw === undefined) return null;
    return raw;
  }

  stockNote(v: PricingVariant): string {
    const cap = this.stockCap(v);
    if (cap === null) return '';
    if (cap === 0) return 'None in stock — made to order';
    return `${cap} available`;
  }

  readonly categories = computed(() => {
    const counts = new Map<string, number>();
    for (const product of this.pricing()?.data ?? []) {
      const c = product.category ?? 'other';
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  });

  /** The account's real discount. False means wholesale == retail. */
  readonly hasDiscount = computed(() => this.pricing()?.hasDiscount === true);

  readonly discountPct = computed(() => {
    const t = this.pricing()?.tier;
    return t ? Math.round(t.discountPercent * 10) / 10 : 0;
  });

  ngOnInit(): void {
    this.api.pricing().subscribe({
      next: (p) => this.pricing.set(p),
      error: () => this.needsAccount.set(true),
    });
  }

  filtered(): PricingProduct[] {
    const q = this.query.trim().toLowerCase();
    return (this.pricing()?.data ?? []).filter((product) => {
      if (this.category() && (product.category ?? 'other') !== this.category()) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        (product.category ?? '').toLowerCase().includes(q) ||
        product.variants.some((v) => v.sku.toLowerCase().includes(q))
      );
    });
  }

  isOpen(id: string): boolean {
    return this.openIds().has(id);
  }

  /** Only one row open at a time: expanding one collapses the other. */
  toggle(id: string): void {
    this.openIds.update((open) => {
      const next = new Set(open);
      if (next.has(id)) next.delete(id);
      else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  }

  panelId(id: string): string {
    return `cat-panel-${id}`;
  }

  inputId(v: PricingVariant): string {
    return `cat-qty-${v.id}`;
  }

  primarySku(product: PricingProduct): string {
    return product.variants[0]?.sku ?? product.id.slice(0, 8);
  }

  /**
   * The pricing ladder for one row, built only from prices the API sent.
   * A volume-break ladder is not backed by data, so higher volumes are labelled
   * a quote rather than given an invented price.
   *
   * Takes the row's own product: the "1+" retail comparison must come from
   * this product's first variant, never the catalogue's first product.
   */
  ladder(product: PricingProduct): Array<{ label: string; price: string; mine: boolean }> {
    const moq = this.moq();
    const bands: Array<{ label: string; price: string; mine: boolean }> = [];
    if (this.hasDiscount()) {
      bands.push({ label: '1+', price: `₦${this.firstVariantRetail(product)}`, mine: false });
      bands.push({ label: `${moq}+`, price: 'Your tier', mine: true });
    } else {
      bands.push({ label: `${moq}+`, price: 'Flat rate', mine: true });
    }
    bands.push({ label: 'Volume', price: 'Desk quote', mine: false });
    return bands;
  }

  /** Retail reference for a single row: its own first variant. */
  firstVariantRetail(product: PricingProduct): string {
    const v = product.variants[0];
    return v ? Math.round(v.retailPrice).toLocaleString('en-NG') : '—';
  }

  /** Real MOQ from the API. 0 only while pricing is still loading. */
  readonly moq = computed(() => this.pricing()?.moq ?? 0);

  /** Units selected across every product: committed lines plus live typing. */
  readonly trayUnits = computed(() => this.cart.units() + this.pendingUnits());

  /** Running value of the selection, priced at the account's wholesale rate. */
  readonly trayAmount = computed(() => {
    const pending = this.qtyState();
    let sum = this.cart.amount();
    for (const product of this.pricing()?.data ?? []) {
      for (const v of product.variants) {
        sum += (pending[v.id] ?? 0) * v.wholesalePrice;
      }
    }
    return Math.round(sum * 100) / 100;
  });

  readonly moqMet = computed(() => this.moq() > 0 && this.trayUnits() >= this.moq());

  readonly moqShort = computed(() => Math.max(0, this.moq() - this.trayUnits()));

  /** 0-100, clamped: overshooting the MOQ must not overflow the bar. */
  readonly moqProgress = computed(() => {
    const moq = this.moq();
    if (moq <= 0) return 100;
    return Math.min(100, Math.round((this.trayUnits() / moq) * 100));
  });

  readonly trayTitle = computed(() => {
    const n = this.trayUnits();
    return n === 1 ? '1 unit selected' : `${n} units selected`;
  });

  /**
   * The variants shown in the inline grid, capped at `quickLimit`.
   *
   * The cap is real: the copy below the grid tells the buyer only the first
   * N are shown, so rendering all of them would contradict it. Longer product
   * lists go through the bulk matrix.
   */
  quickVariants(product: PricingProduct): PricingVariant[] {
    return product.variants.slice(0, this.quickLimit);
  }

  /** Grid columns are the distinct sizes/colours, in variant order. */
  columns(product: PricingProduct): string[] {
    const seen: string[] = [];
    // Must mirror quickVariants: a header column for a size the grid no longer
    // renders would misalign the whole row.
    for (const v of this.quickVariants(product)) {
      const label = v.size || v.colour || 'OS';
      if (!seen.includes(label)) seen.push(label);
    }
    return seen;
  }

  availabilityLabel(v: PricingVariant): string {
    const map: Record<AvailabilityStatus, string> = {
      in_stock: 'In stock',
      out_of_stock: 'Out of stock',
      made_to_order: 'Made to order',
    };
    return map[v.availabilityStatus];
  }

  qtyOf(variantId: string): number {
    return this.qtyState()[variantId] ?? 0;
  }

  /** Coerce to a non-negative integer; blanks and junk become 0. */
  setQty(variantId: string, raw: unknown): void {
    const variant = this.findVariant(variantId);
    const cap = variant ? this.stockCap(variant) : null;
    let n = Math.max(0, Math.floor(Number(raw) || 0));
    // Clamp rather than silently accept an oversell: the buyer is told, and
    // the value settles at the real ceiling.
    if (cap !== null && n > cap) n = cap;
    this.qtyState.update((s) => ({ ...s, [variantId]: n }));
  }

  private findVariant(variantId: string): PricingVariant | null {
    for (const product of this.pricing()?.data ?? []) {
      const v = product.variants.find((x) => x.id === variantId);
      if (v) return v;
    }
    return null;
  }

  productUnits(product: PricingProduct): number {
    const q = this.qtyState();
    return product.variants.reduce((n, v) => n + (q[v.id] ?? 0), 0);
  }

  productAmount(product: PricingProduct): number {
    const q = this.qtyState();
    return (
      Math.round(
        product.variants.reduce((n, v) => n + (q[v.id] ?? 0) * v.wholesalePrice, 0) * 100,
      ) / 100
    );
  }

  /**
   * Guard the review link at zero units.
   *
   * `aria-disabled` alone does not stop an anchor, so the click is cancelled
   * too and the reason is surfaced. Below the MOQ we deliberately let the
   * buyer through to /cart: the shortfall is a server-side rule and the cart
   * states it properly.
   */
  onReview(event: Event): void {
    if (this.trayUnits() > 0) return;
    event.preventDefault();
    this.error.set('Select at least one unit before reviewing your bulk order.');
  }

  apply(): void {
    this.error.set(null);
    this.api.applyForAccount().subscribe({
      next: () => this.applied.set(true),
      error: (err) => this.error.set(err?.error?.message ?? 'Application failed.'),
    });
  }

  addToOrder(product: PricingProduct): void {
    const q = this.qtyState();
    const lines = product.variants
      .filter((v) => (q[v.id] ?? 0) > 0)
      .map((v) => ({
        variantId: v.id,
        productId: product.id,
        productName: product.name,
        sku: v.sku,
        size: v.size,
        colour: v.colour,
        unitPrice: v.wholesalePrice,
        quantity: q[v.id] ?? 0,
      }));
    if (lines.length === 0) return;
    this.cart.add(lines);
    // Clear only this product's inputs, so its selection stays in the draft.
    this.qtyState.update((s) => {
      const next = { ...s };
      for (const v of product.variants) delete next[v.id];
      return next;
    });
    this.openIds.update((open) => {
      const next = new Set(open);
      next.delete(product.id);
      return next;
    });
    this.message.set(`${product.name} added to the draft batch: review the order below.`);
  }
}
