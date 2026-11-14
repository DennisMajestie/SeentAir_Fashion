import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  SeBannerComponent,
  SeEmptyStateComponent,
  SeMoneyPipe,
  SeStatusComponent,
  SeToastService,
} from '@seentair/ui';
import { ApiService, Pricing, PricingProduct, PricingVariant } from '../api.service';
import { CartService } from '../cart.service';

/**
 * Bulk order form: a colour Ã— size quantity grid for one product.
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
    SeBannerComponent,
    SeEmptyStateComponent,
    SeMoneyPipe,
    SeStatusComponent,
  ],
  template: `
    <div class="w4">
      <header class="w4-head">
        <div class="w4-head-left">
          <a routerLink="/catalogue" class="icon-btn" aria-label="Back"><span class="material-symbols-outlined">arrow_back</span></a>
          <div>
            <div class="crumbs"><span>Catalogue</span><span>/</span><span class="mono">#{{ (product()?.id || '').slice(0,6) || 'SKU' }}</span></div>
            <h1>Bulk Order Matrix</h1>
          </div>
        </div>
        @if (moqKnown()) { <span class="pill mono">MOQ: {{ moq() }}u</span> }
      </header>

      @if (loadError()) {
        <se-banner tone="danger" title="The product could not be loaded" actionLabel="Try again" (action)="load()">{{ loadError() }}</se-banner>
      } @else if (loading()) {
        <div class="card muted small">Loading productâ€¦</div>
      } @else if (product(); as prod) {
        <section class="card w4-product">
          <div class="thumb">@if (prod.imageUrl) { <img [src]="prod.imageUrl" alt="" /> } @else { <span class="material-symbols-outlined">styler</span> }</div>
          <div class="copy">
            <h2>{{ prod.name }}</h2>
            <p class="muted small">{{ prod.category ?? 'Aba Mill Line' }}</p>
            <div class="price-line">
              <span class="price">{{ prod.wholesalePrice | seMoney: 2 }}</span>
              <span class="retail">{{ prod.retailPrice | seMoney: 2 }} Retail</span>
            </div>
            <se-status kind="stock" [value]="availability(prod)" />
          </div>
        </section>

        <section class="card w4-moq">
          <div class="row">
            <span class="title"><span class="material-symbols-outlined accent">pie_chart</span> Silhouette Batch MOQ</span>
            <span class="mono" [class.ok]="moqShort() <= 0" [class.warn]="moqShort() > 0">{{ committedUnits() }} / {{ moqKnown() ? moq() : 'â€”' }} Units</span>
          </div>
          <div class="bar"><div class="fill" [style.width.%]="moqKnown() ? (moq() ? Math.min(100, (committedUnits()/moq())*100) : 100) : 0"></div></div>
          <p class="muted small">@if (moqShort() > 0) { {{ moqShort() }} more units to meet minimum (includes {{ otherUnits() }} in cart). } @else { Batch minimum satisfied. Ready for Aba line queue scheduling. }</p>
          @if (moqShort() > 0) { <button type="button" class="link" (click)="autoFill()">Spread {{ moqShort() }} units across grid</button> }
        </section>

        <section class="w4-matrix">
          <div class="sec-head"><h3>Size & Variant Breakdown</h3><span class="mono muted">STEPPER</span></div>
          @for (colour of colours(); track colour) {
            <div class="card colour-card">
              <div class="colour-head">
                <span class="colour-name">{{ colour }}</span>
                <span class="mono muted">Subtotal: {{ colourSum(colour) }} units</span>
              </div>
              <div class="size-grid">
                @for (size of sizes(); track size) {
                  <div class="size-cell">
                    <span class="sz">{{ size }}</span>
                    @if (variantFor(colour, size); as v) {
                      <input
                        type="number" min="0" step="1" inputmode="numeric"
                        [max]="stockCap(v)"
                        [ngModel]="qtyOf(v.id)"
                        (ngModelChange)="setQty(v.id, $event)"
                        [attr.aria-label]="colour + ' size ' + size"
                      />
                      @if (stockNote(v); as note) { <span class="stock">{{ note }}</span> }
                    } @else {
                      <span class="na">â€”</span>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </section>

        <div class="note card muted small">Default packaging: Folded in biodegradable Aba mill polybags with barcoded size labels. Custom neck tags can be requested via Custom Orders.</div>

        <aside class="w4-bar" aria-label="Order summary">
          <div>
            <span class="muted small">{{ formUnits() }} Units Total</span>
            <strong>{{ formAmount() | seMoney: 2 }}</strong>
          </div>
          <button type="button" class="cta" [disabled]="formUnits() === 0" (click)="addToOrder()">
            <span>Add to Bulk Cart</span><span class="material-symbols-outlined">shopping_bag</span>
          </button>
        </aside>
      } @else {
        <se-empty-state heading="Product not in your catalogue" text="It may have been removed or is not priced for your tier." actionLabel="Back to catalogue" (action)="router.navigate(['/catalogue'])" />
      }
    </div>
  `,
  styles: [`
    :host{display:block;font-family:'Urbanist',sans-serif;}
    .w4{display:flex;flex-direction:column;gap:12px;padding-bottom:92px;}
    .w4-head{display:flex;justify-content:space-between;align-items:center;gap:8px;position:sticky;top:0;z-index:5;background:rgba(247,242,234,.92);backdrop-filter:blur(8px);padding:8px 0;margin:-4px 0 0;}
    .w4-head-left{display:flex;align-items:center;gap:8px;min-width:0;}
    .icon-btn{width:32px;height:32px;border-radius:999px;border:1px solid #e8e1d3;background:#fffdf9;display:inline-flex;align-items:center;justify-content:center;color:#1b1916;text-decoration:none;flex:none;}
    .crumbs{display:flex;gap:4px;font-size:11px;color:#7b756a;align-items:center;}
    .w4-head h1{margin:0;font:700 14px/1.2 Urbanist,sans-serif;color:#1b1916;}
    .pill{padding:4px 8px;border-radius:999px;background:#efe3c8;border:1px solid #e8e1d3;color:#1b1916;font-size:11px;}
    .mono{font-family:'JetBrains Mono',monospace;}
    .card{background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;padding:14px;box-shadow:0 8px 24px -4px rgba(27,25,22,.05);}
    .w4-product{display:flex;gap:14px;align-items:center;}
    .thumb{width:64px;height:80px;border-radius:10px;background:rgba(239,227,200,.6);border:1px solid #e8e1d3;display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden;color:#7b756a;}
    .thumb img{width:100%;height:100%;object-fit:cover;}
    .copy h2{margin:0;font:700 15px/1.25 Urbanist,sans-serif;}
    .copy p{margin:2px 0 4px;}
    .price-line{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;}
    .price{font:700 16px/1 'JetBrains Mono',monospace;color:#c88a12;}
    .retail{font-size:11px;color:#7b756a;text-decoration:line-through;}
    .w4-moq .row{display:flex;justify-content:space-between;gap:8px;font-size:12px;align-items:center;}
    .w4-moq .title{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:#1b1916;}
    .w4-moq .material-symbols-outlined{font-size:16px;} .accent{color:#c88a12;} .ok{color:#23804d;font-weight:700;} .warn{color:#93600a;font-weight:700;}
    .bar{height:8px;border-radius:999px;background:#e8e1d3;overflow:hidden;margin:8px 0;}
    .fill{height:100%;background:#23804d;border-radius:999px;}
    .w4-moq p{margin:0;} .link{margin-top:6px;border:0;background:none;color:#93600a;font:600 12px/1 Urbanist,sans-serif;padding:0;}
    .sec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;}
    .sec-head h3{margin:0;font:700 14px/1.2 Urbanist,sans-serif;}
    .w4-matrix{display:flex;flex-direction:column;gap:10px;}
    .colour-head{display:flex;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid #e8e1d3;margin-bottom:10px;font-size:13px;}
    .colour-name{font-weight:700;color:#1b1916;}
    .size-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}
    .size-cell{padding:8px;border-radius:10px;background:#f7f2ea;border:1px solid #e8e1d3;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;}
    .sz{font:700 11px/1 Urbanist,sans-serif;color:#7b756a;}
    .size-cell input{width:100%;max-width:52px;text-align:center;font:700 13px/1 'JetBrains Mono',monospace;background:#fffdf9;border:1px solid #e8e1d3;border-radius:6px;padding:4px 2px;color:#1b1916;}
    .stock{font-size:10px;color:#7b756a;} .na{color:#7b756a;}
    .note{font-size:11px;line-height:1.4;background:rgba(239,227,200,.5);}
    .w4-bar{position:fixed;left:0;right:0;bottom:0;max-width:390px;margin:0 auto;background:#fffdf9;border-top:1px solid #e8e1d3;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 -8px 20px rgba(27,25,22,.06);z-index:30;}
    .w4-bar strong{display:block;font:700 18px/1.1 'JetBrains Mono',monospace;color:#1b1916;}
    .w4-bar .cta{border:0;border-radius:999px;background:#c88a12;color:#1a1405;padding:14px 18px;font:600 14px/1 Urbanist,sans-serif;display:inline-flex;align-items:center;gap:8px;}
    .w4-bar .cta:disabled{opacity:.5;}
    .muted{color:#7b756a;} .small{font-size:12px;}
    @media (max-width:360px){.size-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
  `],
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
  readonly Math = Math;

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
