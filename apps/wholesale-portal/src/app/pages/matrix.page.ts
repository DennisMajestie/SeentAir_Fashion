import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, Pricing, PricingProduct, PricingVariant } from '../api.service';
import { CartService } from '../cart.service';
import { FactsComponent, LedgerComponent, StripComponent } from '../ui/primitives';

/**
 * W4, Bulk order form: colour × size allocation matrix for one product.
 *
 * MOQ status counts this form plus the existing draft batch; the matrix writes
 * into the shared cart, and the server re-enforces MOQ on commit.
 *
 * Built on the shared primitives. The matrix itself stays a real `<table>`: a
 * numeric grid is the one thing a CSS grid would make harder to read, because
 * the row and column totals have to line up under their own cells.
 */
@Component({
  selector: 'app-matrix',
  imports: [CommonModule, FormsModule, RouterLink, StripComponent, FactsComponent, LedgerComponent],
  template: `
    <a class="link backlink" routerLink="/catalogue">
      <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span> Back to catalogue
    </a>

    @if (product(); as prod) {
      <se-strip label="Bulk order form" [badge]="'SKU: ' + (prod.variants[0]?.sku ?? '—')">
        <h1 class="matrix-title">{{ prod.name }}</h1>
        <se-facts [facts]="headerFacts(prod)" />
      </se-strip>

      <!-- MOQ state as a tone on a flat strip. Same primitive as the cart and
           catalogue tray, so the threshold reads the same everywhere. -->
      <div class="status-strip" [class.ok]="moqShort() === 0" [class.warn]="moqShort() > 0">
        <span class="dot" aria-hidden="true"></span>
        @if (moqShort() > 0) {
          <span>
            <strong>{{ committedUnits() }} / {{ moq() }} units.</strong> Add {{ moqShort() }} more
            to reach the {{ moq() }}-unit batch minimum, which counts the {{ cart.units() }} units
            already in your draft.
          </span>
        } @else {
          <span>
            <strong>MOQ met: {{ committedUnits() }} units across the batch.</strong> Review the
            order to commit it to production.
          </span>
        }
      </div>

      <div class="matrix-toolbar">
        <span class="muted small">
          <span class="material-symbols-outlined" aria-hidden="true">swipe</span> Scroll
          horizontally to reach every size
        </span>
        @if (moqShort() > 0) {
          <button class="cta small quiet" (click)="autoFill()">
            <span class="material-symbols-outlined" aria-hidden="true">bolt</span> +{{ moqShort() }}
            auto fill
          </button>
        }
      </div>

      <div class="matrix-scroll">
        <table class="matrix">
          <caption class="sr-only">
            Units per colour and size for
            {{
              prod.name
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">Colour</th>
              @for (size of sizes(); track size) {
                <th scope="col" class="num">{{ size }}</th>
              }
              <th scope="col" class="num">Row</th>
            </tr>
          </thead>
          <tbody>
            @for (colour of colours(); track colour) {
              <tr>
                <th scope="row" class="rowhead">
                  <span class="c-name"
                    ><span class="swatch" aria-hidden="true"></span>{{ colour }}</span
                  >
                </th>
                @for (size of sizes(); track size) {
                  <td class="num">
                    @if (variantFor(colour, size); as v) {
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputmode="numeric"
                        [max]="stockCap(v)"
                        [ngModel]="qtyOf(v.id)"
                        (ngModelChange)="setQty(v.id, $event)"
                        [attr.aria-label]="colour + ' size ' + size"
                      />
                      <!-- Derived stock, from the wholesale availability endpoint.
                           null means made-to-order or unknown: no cap, no note. -->
                      @if (stockNote(v); as note) {
                        <span class="cell-stock">{{ note }}</span>
                      }
                    } @else {
                      <span class="na" aria-hidden="true">—</span>
                    }
                  </td>
                }
                <td class="num rowsum">{{ colourSum(colour) }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Size sum</th>
              @for (size of sizes(); track size) {
                <td class="num">{{ sizeSum(size) }}</td>
              }
              <td class="num grand">{{ formUnits() }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- GAP: fabric density and lead-time specs are not in the pricing API yet;
           the strip carries the real category and factory policy instead. -->
      <se-strip label="Production notes" badge="Seentair factory: Aba">
        <se-ledger [rows]="noteRows(prod)" />
      </se-strip>

      <se-strip label="Batch commitment" [badge]="moqShort() === 0 ? 'Ready' : 'Below MOQ'">
        <se-ledger [rows]="commitRows()" />

        @if (moqShort() > 0 && formUnits() > 0) {
          <button
            class="cta outline"
            style="width:100%; margin-top: var(--space-md)"
            (click)="autoFill()"
          >
            <span class="material-symbols-outlined" aria-hidden="true">auto_fix_high</span>
            + Add {{ moqShort() }} units automatically to meet MOQ
          </button>
        }
        <button
          class="cta"
          style="width:100%; margin-top: var(--space-sm)"
          (click)="addToOrder()"
          [disabled]="formUnits() === 0"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            {{ moqShort() > 0 ? 'lock' : 'lock_open' }}</span
          >
          {{ moqShort() > 0 ? 'Add to order (need ' + moqShort() + ' more)' : 'Add to order' }}
        </button>
        <p class="muted small" style="text-align:center; margin-top: var(--space-sm)">
          @if (moqKnown()) {
            The {{ moq() }}-unit minimum applies to the whole batch and is re-checked by the factory
            API.
          } @else {
            The batch minimum is being confirmed; the factory API re-checks it on commit.
          }
        </p>
      </se-strip>
    } @else if (missing()) {
      <p class="error">
        Product not found in your catalogue. <a class="link" routerLink="/catalogue">Back</a>
      </p>
    } @else {
      <p class="muted">Loading bulk order form…</p>
    }
  `,
})
export class MatrixPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly cart = inject(CartService);
  readonly product = signal<PricingProduct | null>(null);
  readonly pricingData = signal<Pricing | null>(null);
  readonly missing = signal(false);

  /**
   * Quantities on this form, in a signal rather than a plain object so the
   * row sums, column sums and commit total all recompute from one source.
   */
  readonly quantities = signal<Record<string, number>>({});

  /**
   * Derived stock per variant, from GET /wholesale/stock.
   * `null` is made-to-order or unknown, and means "no cap": inventing a limit
   * would block orderable goods.
   */
  readonly stockState = signal<Record<string, number | null>>({});

  readonly formUnits = computed(() =>
    (this.product()?.variants ?? []).reduce((n, v) => n + (this.qtyOf(v.id) ?? 0), 0),
  );

  readonly formAmount = computed(() => {
    const prod = this.product();
    if (!prod) return 0;
    const sum = prod.variants.reduce((n, v) => n + this.qtyOf(v.id) * v.wholesalePrice, 0);
    return Math.round(sum * 100) / 100;
  });

  /** Units already drafted for other products, plus this form. */
  readonly committedUnits = computed(() => {
    const otherUnits = this.cart
      .lines()
      .filter((l) => l.productId !== this.product()?.id)
      .reduce((n, l) => n + l.quantity, 0);
    return otherUnits + this.formUnits();
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.api.pricing().subscribe({
      next: (p) => {
        this.pricingData.set(p);
        const prod = p.data.find((x) => x.id === id) ?? null;
        this.product.set(prod);
        this.missing.set(!prod);
        // Seed from any existing draft lines for this product so EDIT MATRIX round-trips.
        const seeded: Record<string, number> = {};
        for (const line of this.cart.lines()) {
          if (line.productId === id) seeded[line.variantId] = line.quantity;
        }
        this.quantities.set(seeded);
        if (prod && prod.variants.length > 0) {
          this.api
            .stock(prod.variants.map((v) => v.id))
            .subscribe({
              next: (s) => this.stockState.set(s),
              error: () => this.stockState.set({}),
            });
        }
      },
      error: () => this.missing.set(true),
    });
  }

  tierName(): string {
    return this.pricingData()?.tier?.name ?? 'Standard';
  }

  /**
   * The real MOQ, from the API. No hardcoded fallback: 20 is the configured
   * default, but guessing one here could block a valid allocation or wave
   * through an invalid one. The server re-checks on commit either way.
   */
  moq(): number {
    return this.pricingData()?.moq ?? 0;
  }

  /** False while pricing is still loading or the call failed. */
  moqKnown(): boolean {
    return this.moq() > 0;
  }

  /** Unknown minimum means "nothing to warn about yet", not "no minimum". */
  moqShort(): number {
    if (!this.moqKnown()) return 0;
    return Math.max(0, this.moq() - this.committedUnits());
  }

  qtyOf(variantId: string): number {
    return this.quantities()[variantId] ?? 0;
  }

  /** Coerce to a non-negative integer, clamped to real derived stock. */
  setQty(variantId: string, raw: unknown): void {
    const variant = this.variantById(variantId);
    const cap = variant ? this.stockCap(variant) : null;
    let n = Math.max(0, Math.floor(Number(raw) || 0));
    if (cap !== null && n > cap) n = cap;
    this.quantities.update((s) => ({ ...s, [variantId]: n }));
  }

  stockCap(v: PricingVariant): number | null {
    if (v.availabilityStatus === 'made_to_order') return null;
    const raw = this.stockState()[v.id];
    return raw === undefined ? null : raw;
  }

  stockNote(v: PricingVariant): string {
    const cap = this.stockCap(v);
    if (cap === null) return '';
    if (cap === 0) return 'MTO';
    return String(cap);
  }

  headerFacts(prod: PricingProduct): Array<{ label: string; value: string; numeric?: boolean }> {
    return [
      { label: 'Wholesale rate', value: `₦${this.money(prod.wholesalePrice)} / unit` },
      { label: 'Retail', value: `₦${this.money(prod.retailPrice)}` },
      { label: 'Garment line', value: prod.category ?? 'Garment' },
      { label: 'Rate card', value: this.tierName() },
    ];
  }

  noteRows(prod: PricingProduct): Array<{ label: string; value: string; numeric?: boolean }> {
    return [
      { label: 'Garment line', value: prod.category ?? 'Garment', numeric: false },
      {
        label: 'Batch minimum',
        value: this.moqKnown() ? `${this.moq()} units · mix & match` : 'Being confirmed',
        numeric: false,
      },
      { label: 'Factory', value: 'Seentair, Aba', numeric: false },
    ];
  }

  commitRows(): Array<{
    label: string;
    value: string;
    note?: string;
    total?: boolean;
    numeric?: boolean;
  }> {
    return [
      { label: 'This form', value: `${this.formUnits()} units`, numeric: false },
      {
        label: 'Other products in draft',
        value: `${this.committedUnits() - this.formUnits()} units`,
        numeric: false,
      },
      {
        label: 'Batch total',
        value: this.moqKnown()
          ? `${this.committedUnits()} / ${this.moq()} units`
          : `${this.committedUnits()} units`,
        numeric: false,
        note: this.moqShort() > 0 ? `${this.moqShort()} short` : 'MOQ met',
      },
      { label: 'Estimated total', value: `₦${this.money(this.formAmount())}`, total: true },
    ];
  }

  sizes(): string[] {
    const seen: string[] = [];
    for (const v of this.product()?.variants ?? []) {
      const s = v.size || 'OS';
      if (!seen.includes(s)) seen.push(s);
    }
    return seen;
  }

  colours(): string[] {
    const seen: string[] = [];
    for (const v of this.product()?.variants ?? []) {
      const c = v.colour || 'standard';
      if (!seen.includes(c)) seen.push(c);
    }
    return seen;
  }

  variantFor(colour: string, size: string) {
    return this.product()?.variants.find(
      (v) => (v.colour || 'standard') === colour && (v.size || 'OS') === size,
    );
  }

  private variantById(id: string): PricingVariant | undefined {
    return this.product()?.variants.find((v) => v.id === id);
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

  /** Spread the missing MOQ units across the matrix round-robin, never past stock. */
  autoFill(): void {
    const variants = this.product()?.variants ?? [];
    if (variants.length === 0) return;
    let remaining = this.moqShort();
    let i = 0;
    while (remaining > 0) {
      const v = variants[i % variants.length];
      const cap = this.stockCap(v);
      // A cell at its ceiling cannot absorb a unit; skip to the next variant
      // rather than silently overselling it.
      if (cap === null || this.qtyOf(v.id) < cap) {
        this.setQty(v.id, this.qtyOf(v.id) + 1);
        remaining--;
      }
      i++;
      if (i > variants.length * Math.max(remaining, 1) + variants.length) break;
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
    void this.router.navigate(['/cart']);
  }

  private money(value: number): string {
    return value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
