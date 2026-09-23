import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Pricing } from '../api.service';
import { CartLine, CartService } from '../cart.service';

interface CartGroup {
  productId: string;
  productName: string;
  units: number;
  unitPrice: number;
  amount: number;
  sku: string;
  colourways: Array<{ colour: string; breakdown: string; pcs: number }>;
}

/**
 * W5 — Bulk cart & checkout: batch production items, consignee destination,
 * freight options, factory policy & SLA, production cost summary and
 * settlement method. Commit places the order through POST /orders (the
 * server re-prices at the buyer's tier and enforces MOQ).
 */
@Component({
  selector: 'app-cart',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <a class="link backlink" routerLink="/catalogue">
      <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span> Bulk cart &amp; checkout
    </a>

    <div class="cart-strip">
      <span class="left"><span class="dot"></span>
        Wholesale cart ({{ cart.units() }} units total ·
        {{ moqMet() ? 'MOQ met' : 'MOQ ' + moq() + ' short by ' + moqShort() }})</span>
      <span class="chip">Draft batch</span>
    </div>

    @if (cart.units() === 0 && !orderResult()) {
      <p class="muted">Your draft batch is empty — build it from the
        <a class="link" routerLink="/catalogue">catalogue</a>.</p>
    }

    @if (cart.units() > 0) {
      <div class="section-head">
        <h2>1. Batch production items ({{ groups().length }})</h2>
        <span class="aside">{{ moqMet() ? 'Ready for cutting' : 'Below MOQ' }}</span>
      </div>
      @for (group of groups(); track group.productId) {
        <article class="ordercard">
          <div class="oc-top">
            <div>
              <span class="oc-id">{{ group.productName }}</span>
              <span class="oc-meta">SKU: {{ group.sku }}</span>
            </div>
            <span class="chip">{{ group.units }} units</span>
          </div>
          <div class="oc-line" style="display:block">
            <div style="display:flex; justify-content:space-between; gap: var(--space-md)">
              <span class="l">Colourway | cut breakdown</span>
              <span class="l" style="text-align:right">Allocated units</span>
            </div>
            @for (cw of group.colourways; track cw.colour) {
              <div style="display:flex; justify-content:space-between; gap: var(--space-md); margin-top: 4px">
                <span>{{ cw.colour }}: {{ cw.breakdown }}</span>
                <span class="num">{{ cw.pcs }} pcs</span>
              </div>
            }
          </div>
          <div class="oc-top" style="margin-top: var(--space-md); align-items:center">
            <span class="tabular small">₦{{ group.unitPrice | number: '1.0-2' }} / unit —
              <strong>₦{{ group.amount | number: '1.0-2' }}</strong></span>
            <span style="display:flex; gap: var(--space-lg)">
              <a class="link" [routerLink]="['/catalogue', group.productId, 'matrix']">Edit matrix</a>
              <button class="link" (click)="cart.removeProduct(group.productId)">Remove</button>
            </span>
          </div>
        </article>
      }

      <div class="section-head">
        <h2>2. Delivery consignee destination</h2>
      </div>
      <!-- GAP: no buyer address-book endpoint yet — destination is agreed with the
           Yaba desk after commit instead of rendering a stored consignee address. -->
      <section class="panel">
        <div class="oc-top">
          <div>
            <strong>{{ buyerName() ?? 'Wholesale account' }}</strong>
            <p class="muted small" style="margin: 2px 0 0">
              Delivery destination and consignee contact are confirmed with the Yaba desk
              once the batch is committed — GIGL dispatch or factory pickup.
            </p>
          </div>
          <span class="chip okc">Verified buyer</span>
        </div>
      </section>

      <div class="section-head">
        <h2>3. Freight waybill options</h2>
        <span class="aside">For {{ cart.units() }} units</span>
      </div>
      <!-- GAP: no delivery-fee quotation endpoint — freight is quoted on the waybill
           at dispatch, so no fee figures are shown against each option. -->
      <label class="radio-opt" [class.selected]="freight === 'gigl'">
        <input type="radio" name="freight" value="gigl" [(ngModel)]="freight" />
        <span class="r-body">
          <span class="r-title"><span>GIGL freight dispatch</span>
            <span class="r-price muted">Quoted at dispatch</span></span>
          <span class="r-sub">First-line carrier — doorstep commercial drop with tracked waybill.</span>
        </span>
      </label>
      <label class="radio-opt" [class.selected]="freight === 'pickup'">
        <input type="radio" name="freight" value="pickup" [(ngModel)]="freight" />
        <span class="r-body">
          <span class="r-title"><span>Factory pickup (Yaba workshop hub)</span>
            <span class="r-price">₦0 (Free)</span></span>
          <span class="r-sub">Collect directly from the Seentair production floor, Lagos.</span>
        </span>
      </label>

      <div class="policy-strip">
        <span class="material-symbols-outlined" aria-hidden="true">gavel</span>
        <div>
          <strong>Seentair factory policy &amp; SLA</strong>
          Full payment is required before production batch slot allocation and material
          cutting. No part-payments, cash on delivery, or staggered releases.
        </div>
      </div>

      <div class="section-head">
        <h2>4. Production cost summary</h2>
      </div>
      <section class="panel">
        <div class="ledger">
          <div class="lg-row"><span>Garment allocation units</span>
            <span class="v">{{ cart.units() }} units</span></div>
          <div class="lg-row"><span>Merchandise subtotal</span>
            <span class="v">₦{{ cart.amount() | number: '1.0-2' }}</span></div>
          @if (tier(); as t) {
            <div class="lg-row disc"><span>{{ t.name }} wholesale rate</span>
              <span class="v">{{ t.discountPercent }}% off retail — applied</span></div>
          }
          <!-- GAP: freight + any statutory charges appear on the final invoice; no
               quotation endpoint exists to price them here. -->
          <div class="lg-row"><span>Freight logistics waybill</span>
            <span class="v muted">On final invoice</span></div>
          <div class="lg-row total"><span>Total payable<br />
            <span class="muted" style="font-weight:400; font-size: var(--type-body-sm); text-transform:none; letter-spacing:normal">merchandise commit</span></span>
            <span class="v">₦{{ cart.amount() | number: '1.0-2' }}</span></div>
        </div>
      </section>

      <div class="section-head">
        <h2>5. Settlement method</h2>
      </div>
      <!-- GAP: Paystack is the confirmed processor, but the portal has no
           payment-initialisation endpoint yet — settlement today is bank
           transfer / POS confirmed by the desk, so commit places the order
           and the desk follows up with payment instructions. -->
      <label class="radio-opt" [class.selected]="settlement === 'transfer'">
        <input type="radio" name="settlement" value="transfer" [(ngModel)]="settlement" />
        <span class="r-body">
          <span class="r-title"><span>Direct corporate bank transfer / POS</span></span>
          <span class="r-sub">Current live flow — the desk confirms your payment, then the
            batch enters production.</span>
        </span>
      </label>
      <label class="radio-opt" [class.selected]="settlement === 'paystack'">
        <input type="radio" name="settlement" value="paystack" [(ngModel)]="settlement" />
        <span class="r-body">
          <span class="r-title"><span>Paystack direct merchant gateway</span>
            <span class="r-price muted">Coming online</span></span>
          <span class="r-sub">Instant confirmation — cards, NIBSS transfer, USSD. Awaiting
            production keys; the desk will settle this order manually meanwhile.</span>
        </span>
      </label>

      <button class="cta" style="width:100%; margin-top: var(--space-md)"
        (click)="commit()" [disabled]="!moqMet() || placing()">
        <span class="material-symbols-outlined" aria-hidden="true">lock</span>
        {{ placing() ? 'Committing batch…' : 'Commit batch — ₦' + (cart.amount() | number: '1.0-2') }}
      </button>
      @if (!moqMet()) {
        <p class="error" style="text-align:center">
          Minimum order is {{ moq() }} units — you have {{ cart.units() }}.</p>
      }
      <p class="muted small" style="text-align:center; margin-top: var(--space-sm)">
        Full payment upfront confirms the production slot — the cutting floor is notified
        once the desk verifies settlement.
      </p>
    }

    @if (orderResult(); as result) {
      <section class="panel">
        <div class="tagbar"><span>Batch committed</span><span class="success">OK</span></div>
        <p class="apply-copy">
          Order <code>{{ result.id.slice(0, 8).toUpperCase() }}</code> placed —
          <strong>₦{{ result.totalAmount | number: '1.0-2' }}</strong>.
          Payment: bank transfer / POS — our team confirms it, then production starts.
        </p>
        <div class="actions">
          <a class="cta small" [routerLink]="['/orders', result.id, 'invoice']">View pro-forma invoice</a>
          <a class="link" routerLink="/orders">Orders &amp; invoices</a>
        </div>
      </section>
    }
    @if (error()) { <p class="error">{{ error() }}</p> }

    <div class="cart-strip" style="margin-top: var(--space-xl)">
      <span class="left"><span class="material-symbols-outlined" style="font-size:16px"
        aria-hidden="true">support_agent</span> Need a custom wholesale invoice?</span>
      <a class="link" href="tel:+23418887400">Call hub</a>
    </div>
  `,
})
export class CartPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly cart = inject(CartService);
  readonly buyerName = signal<string | null>(null);
  readonly pricing = signal<Pricing | null>(null);
  readonly placing = signal(false);
  readonly error = signal<string | null>(null);
  readonly orderResult = signal<{ id: string; totalAmount: number } | null>(null);
  freight: 'gigl' | 'pickup' = 'gigl';
  settlement: 'transfer' | 'paystack' = 'transfer';

  readonly groups = computed<CartGroup[]>(() => {
    const map = new Map<string, CartLine[]>();
    for (const line of this.cart.lines()) {
      map.set(line.productId, [...(map.get(line.productId) ?? []), line]);
    }
    return [...map.entries()].map(([productId, lines]) => {
      const byColour = new Map<string, CartLine[]>();
      for (const l of lines) {
        const c = l.colour || 'standard';
        byColour.set(c, [...(byColour.get(c) ?? []), l]);
      }
      return {
        productId,
        productName: lines[0].productName,
        sku: lines[0].sku,
        unitPrice: lines[0].unitPrice,
        units: lines.reduce((n, l) => n + l.quantity, 0),
        amount:
          Math.round(lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0) * 100) / 100,
        colourways: [...byColour.entries()].map(([colour, cls]) => ({
          colour,
          breakdown: cls.map((l) => `${l.quantity}× ${l.size || 'OS'}`).join(' | '),
          pcs: cls.reduce((n, l) => n + l.quantity, 0),
        })),
      };
    });
  });

  ngOnInit(): void {
    this.api.me().subscribe({ next: (m) => this.buyerName.set(m.name), error: () => undefined });
    this.api.pricing().subscribe({ next: (p) => this.pricing.set(p), error: () => undefined });
  }

  tier() {
    return this.pricing()?.tier ?? null;
  }

  moq(): number {
    return this.pricing()?.moq ?? 20;
  }

  moqMet(): boolean {
    return this.cart.units() >= this.moq();
  }

  moqShort(): number {
    return Math.max(0, this.moq() - this.cart.units());
  }

  commit(): void {
    this.placing.set(true);
    this.error.set(null);
    this.api.placeOrder(this.cart.toOrderItems()).subscribe({
      next: (order) => {
        this.placing.set(false);
        this.orderResult.set(order);
        this.cart.clear();
      },
      error: (err) => {
        this.placing.set(false);
        this.error.set(err?.error?.message ?? 'Order failed.');
      },
    });
  }
}
