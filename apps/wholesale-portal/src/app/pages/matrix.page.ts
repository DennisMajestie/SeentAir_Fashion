import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SeMoneyPipe, SeToastService } from '@seentair/ui';
import { ApiService, Pricing, PricingProduct, PricingVariant } from '../api.service';
import { CartService } from '../cart.service';

/**
 * W4 Bulk Order Form Matrix, carried verbatim from the Stitch screen: a
 * colour × size quantity grid for one product.
 *
 * The grid writes into the shared cart; the MOQ counts this form plus the
 * other products already drafted, and the server re-checks it on commit.
 * A shortfall is a warning, never a block: the cart states the rule again.
 */
@Component({
  selector: 'app-matrix',
  imports: [FormsModule, RouterLink, SeMoneyPipe],
  template: `
    <div class="stitch">
      <div class="bg-canvas text-light-on-surface min-h-screen md:pl-56 pb-28 antialiased md:pb-8 selection:bg-accent/20">
        <header class="px-4 pt-4 pb-3 border-b border-border/70 bg-canvas/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <a routerLink="/catalogue" class="w-8 h-8 rounded-full bg-light-surface border border-border flex items-center justify-center text-light-primary" aria-label="Back to catalogue">
              <span class="material-symbols-outlined text-[18px]">arrow_back</span>
            </a>
            <div>
              <div class="flex items-center gap-1 text-[11px] text-light-secondary">
                <span>Catalogue</span>
                <span>/</span>
                <span class="font-mono text-light-primary">#{{ (product()?.id || '').slice(0, 6) || 'SKU' }}</span>
              </div>
              <h1 class="text-[14px] font-bold text-light-primary">Bulk Order Matrix</h1>
            </div>
          </div>
          @if (moqKnown()) {
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-canvas-tint text-light-primary border border-border">MOQ: {{ moq() }}u</span>
          }
        </header>

        <main class="px-4 py-4 flex flex-col gap-4 max-w-[390px] mx-auto w-full md:max-w-5xl">
          @if (loadError()) {
            <div class="load-error p-3.5 rounded-xl bg-light-surface border border-danger/30 flex items-center justify-between gap-2">
              <div>
                <h2 class="text-[13px] font-bold text-danger">The product could not be loaded</h2>
                <span class="text-[11px] text-light-secondary">{{ loadError() }}</span>
              </div>
              <button type="button" class="px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold flex-shrink-0" (click)="load()">Try again</button>
            </div>
          } @else if (loading()) {
            <div aria-busy="true">
              <span class="text-[11px] font-mono text-light-secondary uppercase tracking-wider block mb-2">Loading product…</span>
              <div class="bg-light-surface/60 rounded-xl p-3.5 border border-dashed border-border flex gap-3.5 animate-pulse">
                <div class="w-16 h-20 rounded-lg bg-canvas-tint/80 flex-shrink-0"></div>
                <div class="flex-1 flex flex-col justify-between py-1">
                  <div class="space-y-2">
                    <div class="h-3 w-1/3 bg-canvas-tint rounded"></div>
                    <div class="h-4 w-4/5 bg-canvas-tint rounded"></div>
                  </div>
                  <div class="h-5 w-24 bg-canvas-tint rounded-full"></div>
                </div>
              </div>
            </div>
          } @else if (product(); as prod) {
            <!-- Product Summary Card -->
            <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex gap-3.5 items-center">
              <div class="w-16 h-20 rounded-lg bg-canvas-tint flex items-center justify-center flex-shrink-0 border border-border overflow-hidden">
                @if (prod.imageUrl) {
                  <img [src]="prod.imageUrl" alt="" class="w-full h-full object-cover" />
                } @else {
                  <span class="material-symbols-outlined text-[32px] text-light-secondary">styler</span>
                }
              </div>
              <div class="flex-1">
                <h2 class="text-[15px] font-bold text-light-primary">{{ prod.name }}</h2>
                <p class="text-[12px] text-light-secondary">
                  @if (moqKnown()) {
                    {{ prod.category ?? 'Aba Mill Line' }} • {{ moq() }}-unit minimum per batch
                  } @else {
                    {{ prod.category ?? 'Aba Mill Line' }}
                  }
                </p>
                <div class="mt-1 flex items-baseline gap-2 flex-wrap">
                  <span class="font-mono font-bold text-accent text-[16px]">{{ prod.wholesalePrice | seMoney: 2 }}</span>
                  <span class="text-[10px] font-normal text-light-secondary">/unit</span>
                  <span class="text-[11px] text-light-secondary line-through">{{ prod.retailPrice | seMoney: 2 }} Retail</span>
                  @if (pricingData()?.hasDiscount) {
                    <span class="text-[10px] text-success font-semibold">{{ discountPct() }}% Wholesale</span>
                  }
                  <span
                    class="text-[10px] font-semibold"
                    [class.text-success]="availability(prod) === 'in_stock'"
                    [class.text-warning]="availability(prod) === 'made_to_order'"
                    [class.text-danger]="availability(prod) === 'out_of_stock'"
                  >
                    {{ availabilityLabel(prod) }}
                  </span>
                </div>
              </div>
            </section>

            <!-- MOQ Progress Tracker -->
            <div class="p-3.5 rounded-xl bg-light-surface border border-border flex flex-col gap-2">
              <div class="flex items-center justify-between text-[12px]">
                <span class="font-semibold text-light-primary flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px] text-accent">pie_chart</span>
                  Silhouette Batch MOQ
                </span>
                <span class="font-mono font-bold" [class.text-success]="moqShort() <= 0" [class.text-warning]="moqShort() > 0">
                  {{ committedUnits() }} / {{ moqKnown() ? moq() : '—' }} Units{{ moqKnown() && moqShort() <= 0 ? ' Met' : '' }}
                </span>
              </div>
              <div class="w-full h-2 rounded-full bg-border overflow-hidden">
                <div class="h-full rounded-full" [class.bg-success]="moqShort() <= 0" [class.bg-accent]="moqShort() > 0" [style.width.%]="fillPercent()"></div>
              </div>
              @if (moqShort() > 0) {
                <span class="moq-short text-[11px] text-light-secondary">{{ moqShort() }} more units to reach the minimum (includes {{ otherUnits() }} in cart).</span>
                <button type="button" class="self-start text-[12px] font-semibold text-warning underline-offset-2" (click)="autoFill()">Spread {{ moqShort() }} units across grid</button>
              } @else {
                <span class="moq-met text-[11px] text-light-secondary">Batch minimum satisfied. Ready for Aba line queue scheduling.</span>
              }
            </div>

            <!-- Variant Matrix: Colourways x Sizes -->
            <section class="matrix flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <h3 class="text-[14px] font-bold text-light-primary">Size & Variant Breakdown</h3>
                <span class="text-[11px] text-light-secondary font-mono">STEPPER CONTROLS</span>
              </div>

              @for (colour of colours(); track colour) {
                <div class="colour-card bg-light-surface rounded-xl p-3.5 border border-border flex flex-col gap-3">
                  <div class="flex items-center justify-between border-b border-border pb-2">
                    <span class="text-[13px] font-bold text-light-primary">{{ colour }}</span>
                    <span class="font-mono text-[11px] text-light-secondary">Subtotal: {{ colourSum(colour) }} units</span>
                  </div>

                  <div class="grid grid-cols-4 gap-2 text-center">
                    @for (size of sizes(); track size) {
                      <div class="p-2 rounded-lg bg-canvas border border-border flex flex-col items-center">
                        <span class="text-[11px] font-bold text-light-secondary">{{ size }}</span>
                        @if (variantFor(colour, size); as v) {
                          <input
                            type="number" min="0" step="1" inputmode="numeric"
                            class="w-10 text-center font-mono font-bold text-[13px] bg-light-surface border border-border rounded py-0.5 mt-1 focus:outline-none focus:border-accent"
                            [max]="stockCap(v)"
                            [ngModel]="qtyOf(v.id)"
                            (ngModelChange)="setQty(v.id, $event)"
                            [attr.aria-label]="colour + ' size ' + size"
                          />
                          @if (stockNote(v); as note) {
                            <span class="stock text-[10px] text-light-secondary">{{ note }}</span>
                          }
                        } @else {
                          <span class="na text-light-secondary mt-1">—</span>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
            </section>

            <!-- Notes on Trims & Labelling -->
            <div class="p-3 rounded-lg bg-canvas-tint/70 border border-border text-[11px] text-light-secondary leading-normal">
              Default packaging: Folded in biodegradable Aba mill polybags with barcoded size labels. Custom neck tags can be requested via Custom Orders.
            </div>
          } @else {
            <div class="empty-state bg-light-surface p-3.5 rounded-xl border border-border flex flex-col items-center gap-1.5 text-center">
              <span class="material-symbols-outlined text-[28px] text-light-secondary">inventory_2</span>
              <strong class="text-[14px] text-light-primary">Product not in your catalogue</strong>
              <p class="text-[11px] text-light-secondary">It may have been removed or is not priced for your tier.</p>
              <button type="button" class="mt-1 px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold" (click)="router.navigate(['/catalogue'])">Back to catalogue</button>
            </div>
          }
        </main>

        <!-- Sticky Bottom Checkout Bar -->
        <aside aria-label="Order summary" class="fixed bottom-0 left-0 right-0 max-w-[390px] mx-auto md:left-56 md:max-w-none md:mx-0 bg-light-surface border-t border-border px-4 py-3 flex items-center justify-between shadow-[0_-8px_20px_rgba(27,25,22,0.06)] z-30">
          <div>
            <span class="text-[11px] text-light-secondary block font-medium">{{ formUnits() }} Units Total</span>
            <span class="font-mono font-bold text-[18px] text-light-primary leading-tight">{{ formAmount() | seMoney: 2 }}</span>
          </div>
          <button
            type="button"
            class="add-cta px-6 py-3.5 rounded-full bg-accent text-on-accent font-semibold text-[14px] flex items-center gap-2 shadow-sm hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
            [disabled]="formUnits() === 0"
            (click)="addToOrder()"
          >
            <span>Add to Bulk Cart</span>
            <span class="material-symbols-outlined text-[18px]">shopping_bag</span>
          </button>
        </aside>
      </div>
    </div>
  `,
  styles: [`:host { display: block; }`],
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

  readonly discountPct = computed(() => {
    const t = this.pricingData()?.tier;
    return t ? Math.round(t.discountPercent * 10) / 10 : 0;
  });

  readonly sizes = computed(() => distinct(this.product()?.variants ?? [], (v) => v.size || 'OS'));
  readonly colours = computed(() =>
    distinct(this.product()?.variants ?? [], (v) => v.colour || 'standard'),
  );
  readonly Math = Math;

  /** Width of the MOQ bar, in percent. */
  fillPercent(): number {
    if (!this.moqKnown()) return 0;
    if (this.moq() === 0) return 100;
    return Math.min(100, (this.committedUnits() / this.moq()) * 100);
  }

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

  availability(prod: PricingProduct): string {
    const states = prod.variants.map((v) => v.availabilityStatus);
    if (states.includes('in_stock')) return 'in_stock';
    if (states.includes('made_to_order')) return 'made_to_order';
    return 'out_of_stock';
  }

  availabilityLabel(prod: PricingProduct): string {
    const a = this.availability(prod);
    return a === 'in_stock' ? 'In stock' : a === 'made_to_order' ? 'Made to order' : 'Out of stock';
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
