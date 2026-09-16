import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Pricing } from '../api.service';

/** Tier-priced catalogue + bulk order builder. MOQ is enforced server-side too. */
@Component({
  selector: 'app-catalogue',
  imports: [CommonModule, FormsModule],
  template: `
    @if (needsAccount()) {
      <section class="panel">
        <h2>Wholesale account required</h2>
        <p>
          Wholesale ordering needs an approved account (minimum order quantity applies).
          Apply below — our team reviews applications and assigns your price tier.
        </p>
        <button class="cta" (click)="apply()" [disabled]="applied()">
          {{ applied() ? 'Application submitted — pending review' : 'Apply for a wholesale account' }}
        </button>
        @if (error()) { <p class="error">{{ error() }}</p> }
      </section>
    } @else if (pricing(); as p) {
      <div class="tier-banner">
        Tier: <strong>{{ p.tier?.name ?? 'Standard' }}</strong>
        @if (p.tier) { ({{ p.tier.discountPercent }}% off retail) }
        · MOQ: <strong>{{ p.moq }} units</strong> per order
      </div>

      <table class="table">
        <thead>
          <tr><th>Product</th><th>SKU</th><th>Retail</th><th>Your price</th><th>Qty</th></tr>
        </thead>
        <tbody>
          @for (product of p.data; track product.id) {
            @for (v of product.variants; track v.id) {
              <tr>
                <td>{{ product.name }} <span class="muted">{{ v.size }}/{{ v.colour }}</span></td>
                <td><code>{{ v.sku }}</code></td>
                <td class="muted">₦{{ v.retailPrice | number: '1.0-2' }}</td>
                <td><strong>₦{{ v.wholesalePrice | number: '1.0-2' }}</strong></td>
                <td>
                  <input type="number" min="0" [(ngModel)]="quantities[v.id]" (ngModelChange)="recalc(p)" />
                </td>
              </tr>
            }
          }
        </tbody>
      </table>

      <div class="order-bar">
        <span>{{ totalUnits() }} units · <strong>₦{{ totalAmount() | number: '1.0-2' }}</strong></span>
        <button class="cta" (click)="placeOrder()" [disabled]="totalUnits() === 0 || placing()">
          {{ placing() ? 'Placing…' : 'Place bulk order' }}
        </button>
      </div>
      @if (totalUnits() > 0 && totalUnits() < p.moq) {
        <p class="error">Minimum order is {{ p.moq }} units — you have {{ totalUnits() }}.</p>
      }
      @if (orderMessage()) { <p class="success">{{ orderMessage() }}</p> }
      @if (error()) { <p class="error">{{ error() }}</p> }
    } @else {
      <p class="muted">Loading catalogue…</p>
    }
  `,
})
export class CataloguePage implements OnInit {
  private readonly api = inject(ApiService);
  readonly pricing = signal<Pricing | null>(null);
  readonly needsAccount = signal(false);
  readonly applied = signal(false);
  readonly placing = signal(false);
  readonly error = signal<string | null>(null);
  readonly orderMessage = signal<string | null>(null);
  readonly totalUnits = signal(0);
  readonly totalAmount = signal(0);
  quantities: Record<string, number> = {};

  ngOnInit(): void {
    this.api.pricing().subscribe({
      next: (p) => this.pricing.set(p),
      error: () => this.needsAccount.set(true),
    });
  }

  apply(): void {
    this.error.set(null);
    this.api.applyForAccount().subscribe({
      next: () => this.applied.set(true),
      error: (err) => this.error.set(err?.error?.message ?? 'Application failed.'),
    });
  }

  recalc(p: Pricing): void {
    let units = 0;
    let amount = 0;
    for (const product of p.data) {
      for (const v of product.variants) {
        const q = this.quantities[v.id] || 0;
        units += q;
        amount += q * v.wholesalePrice;
      }
    }
    this.totalUnits.set(units);
    this.totalAmount.set(Math.round(amount * 100) / 100);
  }

  placeOrder(): void {
    this.placing.set(true);
    this.error.set(null);
    this.orderMessage.set(null);
    const items = Object.entries(this.quantities)
      .filter(([, q]) => q > 0)
      .map(([variantId, quantity]) => ({ variantId, quantity }));
    this.api.placeOrder(items).subscribe({
      next: (order) => {
        this.placing.set(false);
        this.orderMessage.set(
          `Order ${order.id.slice(0, 8)} placed (₦${order.totalAmount}). Payment: bank transfer/POS — our team confirms it, then production ships. See Invoices for history.`,
        );
        this.quantities = {};
        this.totalUnits.set(0);
        this.totalAmount.set(0);
      },
      error: (err) => {
        this.placing.set(false);
        this.error.set(err?.error?.message ?? 'Order failed.');
      },
    });
  }
}
