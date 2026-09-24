import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, Pricing, PricingProduct } from '../api.service';
import { CartService } from '../cart.service';

/**
 * W4 — Bulk order form: colour × size allocation matrix for one product.
 * MOQ status counts this form plus the existing draft batch; the matrix
 * writes into the shared cart, and the server re-enforces MOQ on commit.
 */
@Component({
  selector: 'app-matrix',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <a class="link backlink" routerLink="/catalogue">
      <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span> Back to catalogue
    </a>

    @if (product(); as prod) {
      <section class="panel">
        <div class="tagbar"><span>Bulk order form</span><span>SKU: {{ prod.variants[0]?.sku }}</span></div>
        <h1 style="font-size: var(--type-heading-md)">{{ prod.name }}</h1>
        <p class="meta-line" style="margin: var(--space-xs) 0 0">
          <span class="muted">{{ tierName() }} wholesale:</span>
          <strong class="tabular" style="color: var(--primary); margin: 0 4px">₦{{ prod.wholesalePrice | number: '1.0-2' }}</strong>
          <span class="muted">/ unit</span>
        </p>
      </section>

      <div class="section-head" style="margin-top: var(--space-md)">
        <h2>Batch order status</h2>
        <span class="aside tabular">
          <strong [style.color]="moqShort() > 0 ? 'var(--primary)' : 'var(--ok)'">{{ committedUnits() }}</strong>
          / {{ moq() }} units MOQ
        </span>
      </div>

      @if (moqShort() > 0) {
        <div class="moq-banner" role="status">
          <span class="material-symbols-outlined" aria-hidden="true">warning</span>
          <div>
            <strong>Add {{ moqShort() }} more units to meet the {{ moq() }}-unit minimum requirement.</strong>
            <span class="sub">The count includes the {{ cart.units() }} units already in your draft batch.
              Your tier price is already applied.</span>
          </div>
        </div>
      } @else {
        <div class="moq-banner met" role="status">
          <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
          <div>
            <strong>MOQ met — {{ committedUnits() }} units committed across the batch.</strong>
            <span class="sub">Review the order to commit the batch to production.</span>
          </div>
        </div>
      }

      <div class="scroll-hint">
        <span><span class="material-symbols-outlined" style="font-size:14px; vertical-align:-2px"
          aria-hidden="true">swipe</span> Scroll matrix horizontally</span>
        @if (moqShort() > 0) {
          <button class="cta small quiet" (click)="autoFill()">
            <span class="material-symbols-outlined" aria-hidden="true">bolt</span> +{{ moqShort() }} auto fill
          </button>
        }
      </div>

      <!-- GAP: per-cell availability counts ("av: 60") from the reference need a
           stock-visibility endpoint for wholesale buyers; omitted, not faked. -->
      <div class="matrix-scroll">
        <table class="table compact">
          <thead>
            <tr>
              <th>Colour</th>
              @for (size of sizes(); track size) { <th class="num">{{ size }}</th> }
            </tr>
          </thead>
          <tbody>
            @for (colour of colours(); track colour) {
              <tr>
                <td class="rowhead">
                  <span class="c-name"><span class="swatch"></span>{{ colour }}</span>
                  <span class="c-sub">{{ prod.category ?? 'garment' }}</span>
                </td>
                @for (size of sizes(); track size) {
                  <td class="num">
                    @if (variantFor(colour, size); as v) {
                      <input type="number" min="0" [(ngModel)]="quantities[v.id]"
                        [attr.aria-label]="colour + ' size ' + size" />
                    } @else { <span class="na">—</span> }
                  </td>
                }
              </tr>
            }
            <tr class="sumrow">
              <td>Size sum</td>
              @for (size of sizes(); track size) { <td class="num">{{ sizeSum(size) }}</td> }
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section-head">
        <h2>Production notes</h2>
        <span class="aside">Seentair factory — Aba</span>
      </div>
      <!-- GAP: fabric density and lead-time specs are not in the pricing API yet;
           the boxes carry the real category and factory policy instead. -->
      <div class="note-boxes">
        <div class="nb">
          <span class="n-l">Garment line</span>
          <span class="n-v">{{ prod.category ?? 'Garment' }}</span>
        </div>
        <div class="nb">
          <span class="n-l">MOQ policy</span>
          <span class="n-v">{{ moq() }} units · mix &amp; match</span>
        </div>
      </div>

      <div class="commit-row">
        <div class="c-cell">
          <span class="c-l">Batch commitment</span>
          <strong>{{ formUnits() }}</strong> <span class="muted small">/ {{ moq() }} MOQ units</span>
        </div>
        <div class="c-cell right">
          <span class="c-l">Estimated total</span>
          <strong>₦{{ formAmount() | number: '1.0-2' }}</strong>
        </div>
      </div>

      @if (moqShort() > 0 && formUnits() > 0) {
        <button class="cta outline" style="width:100%; margin-bottom: var(--space-sm)" (click)="autoFill()">
          <span class="material-symbols-outlined" aria-hidden="true">auto_fix_high</span>
          + Add {{ moqShort() }} units automatically to meet MOQ
        </button>
      }
      <button class="cta" style="width:100%" (click)="addToOrder()" [disabled]="formUnits() === 0">
        <span class="material-symbols-outlined" aria-hidden="true">
          {{ moqShort() > 0 ? 'lock' : 'lock_open' }}</span>
        {{ moqShort() > 0 ? 'Add to order (need ' + moqShort() + ' more)' : 'Add to order' }}
      </button>
      <p class="muted small" style="text-align:center; margin-top: var(--space-sm)">
        The {{ moq() }}-unit minimum applies to the whole batch and is re-checked by the factory API.
      </p>
    } @else if (missing()) {
      <p class="error">Product not found in your catalogue. <a class="link" routerLink="/catalogue">Back</a></p>
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
  quantities: Record<string, number> = {};

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.api.pricing().subscribe({
      next: (p) => {
        this.pricingData.set(p);
        const prod = p.data.find((x) => x.id === id) ?? null;
        this.product.set(prod);
        this.missing.set(!prod);
        // Seed from any existing draft lines for this product so EDIT MATRIX round-trips.
        for (const line of this.cart.lines()) {
          if (line.productId === id) this.quantities[line.variantId] = line.quantity;
        }
      },
      error: () => this.missing.set(true),
    });
  }

  tierName(): string {
    return this.pricingData()?.tier?.name ?? 'Standard';
  }

  moq(): number {
    return this.pricingData()?.moq ?? 20;
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

  formUnits(): number {
    return (this.product()?.variants ?? []).reduce((n, v) => n + (this.quantities[v.id] || 0), 0);
  }

  formAmount(): number {
    const prod = this.product();
    if (!prod) return 0;
    return (
      Math.round(
        prod.variants.reduce((n, v) => n + (this.quantities[v.id] || 0) * v.wholesalePrice, 0) * 100,
      ) / 100
    );
  }

  /** Units already drafted for other products + this form. */
  committedUnits(): number {
    const otherUnits = this.cart
      .lines()
      .filter((l) => l.productId !== this.product()?.id)
      .reduce((n, l) => n + l.quantity, 0);
    return otherUnits + this.formUnits();
  }

  moqShort(): number {
    return Math.max(0, this.moq() - this.committedUnits());
  }

  sizeSum(size: string): number {
    return (this.product()?.variants ?? [])
      .filter((v) => (v.size || 'OS') === size)
      .reduce((n, v) => n + (this.quantities[v.id] || 0), 0);
  }

  /** Spread the missing MOQ units across the matrix round-robin. */
  autoFill(): void {
    const variants = this.product()?.variants ?? [];
    if (variants.length === 0) return;
    let remaining = this.moqShort();
    let i = 0;
    while (remaining > 0) {
      const v = variants[i % variants.length];
      this.quantities[v.id] = (this.quantities[v.id] || 0) + 1;
      remaining--;
      i++;
    }
  }

  addToOrder(): void {
    const prod = this.product();
    if (!prod) return;
    const lines = prod.variants
      .filter((v) => (this.quantities[v.id] || 0) > 0)
      .map((v) => ({
        variantId: v.id,
        productId: prod.id,
        productName: prod.name,
        sku: v.sku,
        size: v.size,
        colour: v.colour,
        unitPrice: v.wholesalePrice,
        quantity: this.quantities[v.id] || 0,
      }));
    this.cart.setProduct(prod.id, lines);
    void this.router.navigate(['/cart']);
  }
}
