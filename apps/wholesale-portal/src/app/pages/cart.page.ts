import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  SeBannerComponent,
  SeConfirmService,
  SeCurrencyService,
  SeEmptyStateComponent,
  SeMoneyPipe,
  SeToastService,
} from '@seentair/ui';
import { ApiService, Pricing } from '../api.service';
import { CartLine, CartService } from '../cart.service';

/**
 * Bulk cart and checkout. The cart lines live in `CartService` (shared with
 * the catalogue and the matrix); this page edits quantities, checks the batch
 * against the account's real minimum, places the order through POST /orders
 * (the server re-prices at the buyer's tier and enforces MOQ) and then sends
 * the buyer to Paystack for the full amount. Wholesale is full payment
 * upfront: there is no part-payment path here, by design.
 */
@Component({
  selector: 'app-cart',
  imports: [
    FormsModule,
    RouterLink,
    SeBannerComponent,
    SeEmptyStateComponent,
    SeMoneyPipe,
  ],
  template: `
    <div class="w5">
      <header class="w5-head">
        <a routerLink="/catalogue" class="icon-btn" aria-label="Back"><span class="material-symbols-outlined">arrow_back</span></a>
        <div>
          <h1>Bulk Cart & Allocation</h1>
          <span class="muted small">{{ cart.lines().length }} lines â€¢ {{ cart.units() }} total units</span>
        </div>
        @if (moqMet()) { <span class="badge ok">MOQs MET</span> } @else { <span class="badge warn">BELOW MOQ</span> }
      </header>

      @if (cart.lines().length === 0) {
        <se-empty-state heading="Your cart is empty" text="Add units from the catalogue, then come back to place the batch." actionLabel="Browse catalogue" (action)="router.navigate(['/catalogue'])" />
      } @else {
        <div class="notice card"><span class="material-symbols-outlined warn">account_balance_wallet</span><p><strong>Full 100% Upfront Payment:</strong> Aba Mill cutting schedules lock immediately upon cleared funds. Orders are non-cancellable once cut.</p></div>

        <section class="lines">
          @for (line of cart.lines(); track line.variantId) {
            <article class="card line">
              <div class="line-top">
                <div>
                  <span class="mono muted">{{ line.sku }}</span>
                  <h2>{{ line.productName }}</h2>
                  <span class="accent mono">{{ line.unitPrice | seMoney: 2 }} / unit</span>
                </div>
                <button type="button" class="trash" aria-label="Remove item" (click)="remove(line)"><span class="material-symbols-outlined">delete</span></button>
              </div>
              <div class="line-mid">
                <span class="muted small">{{ variantLabel(line) }}</span>
                <div class="qty-wrap">
                  <label class="sr" [for]="'q-'+line.variantId">Quantity</label>
                  <input [id]="'q-'+line.variantId" type="number" inputmode="numeric" min="1" step="1" [ngModel]="line.quantity" (ngModelChange)="setQuantity(line, $event)" />
                </div>
              </div>
              <div class="line-bot"><span class="muted small">Line total</span><strong class="mono">{{ (line.quantity * line.unitPrice) | seMoney: 2 }}</strong></div>
            </article>
          }
        </section>

        <section class="card form">
          <h3><span class="material-symbols-outlined accent">local_shipping</span> Dispatch & Destination</h3>
          <label class="field"><span>Delivery</span>
            <select [(ngModel)]="freight" name="freight">
              <option value="gigl">GIGL freight dispatch (tracked)</option>
              <option value="pickup">Factory pickup, Aba workshop</option>
            </select>
          </label>
          <label class="field"><span>Packing/Dispatch notes</span>
            <textarea rows="3" [(ngModel)]="notes" name="notes" placeholder="Consignee/contact notes for desk"></textarea>
          </label>
        </section>

        <section class="card summary">
          @if (moqKnown() && !moqMet()) {
            <se-banner tone="warning" title="Below the batch minimum">Add {{ moqShort() }} more units to place this batch (minimum {{ moq() }}).</se-banner>
          } @else if (!moqKnown()) {
            <se-banner tone="info" title="Minimum being confirmed">The server checks the batch minimum when you place the order.</se-banner>
          }
          <div class="rows">
            <div><span>Units</span><span class="mono">{{ cart.units() }}</span></div>
            <div><span>Minimum order</span><span class="mono">{{ moqKnown() ? moq() + ' units' : 'Confirmed by desk' }}</span></div>
            @if (pricing()?.tier; as tier) { <div><span>Rate card</span><span>{{ tier.name }} â€¢ {{ tier.discountPercent }}% off</span></div> }
            <div><span>Subtotal</span><span class="mono">{{ cart.amount() | seMoney: 2 }}</span></div>
            <div><span>Freight</span><span class="mono">On final invoice</span></div>
            <div class="total"><span>Total payable (100% upfront)</span><span class="mono accent">{{ cart.amount() | seMoney: 2 }}</span></div>
          </div>
        </section>

        <aside class="w5-bar">
          <div><span class="muted small">Payable in full now</span><strong>{{ cart.amount() | seMoney: 2 }}</strong></div>
          <button type="button" class="cta" [disabled]="!moqMet()" [attr.aria-busy]="placing()" (click)="placeOrder()">
            <span>{{ placing() ? 'Placingâ€¦' : 'Place order & pay' }}</span><span class="material-symbols-outlined">arrow_forward</span>
          </button>
        </aside>
      }
    </div>
  `,
  styles: [`
    :host{display:block;font-family:'Urbanist',sans-serif;}
    .w5{display:flex;flex-direction:column;gap:12px;padding-bottom:96px;}
    .w5-head{display:flex;align-items:center;gap:8px;}
    .w5-head h1{margin:0;font:700 17px/1.2 Urbanist,sans-serif;color:#1b1916;}
    .icon-btn{width:32px;height:32px;border-radius:999px;border:1px solid #e8e1d3;background:#fffdf9;display:inline-flex;align-items:center;justify-content:center;color:#1b1916;text-decoration:none;flex:none;}
    .badge{margin-left:auto;padding:4px 8px;border-radius:999px;font:600 11px/1 'JetBrains Mono',monospace;border:1px solid;}
    .badge.ok{background:rgba(35,128,77,.12);color:#23804d;border-color:rgba(35,128,77,.3);} .badge.warn{background:rgba(147,96,10,.12);color:#93600a;border-color:rgba(147,96,10,.3);}
    .card{background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;padding:14px;box-shadow:0 8px 24px -4px rgba(27,25,22,.05);}
    .notice{display:flex;gap:10px;align-items:flex-start;background:rgba(239,227,200,.6);} .notice p{margin:0;font-size:12px;line-height:1.45;}
    .notice .material-symbols-outlined{font-size:18px;} .warn{color:#93600a;}
    .lines{display:flex;flex-direction:column;gap:10px;}
    .line{display:flex;flex-direction:column;gap:8px;}
    .line-top{display:flex;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid #e8e1d3;}
    .line-top h2{margin:2px 0;font:700 14px/1.2 Urbanist,sans-serif;}
    .trash{border:0;background:none;color:#7b756a;padding:4px;} .trash:hover{color:#bf3a2d;}
    .line-mid{display:flex;justify-content:space-between;align-items:center;gap:8px;}
    .qty-wrap input{width:76px;text-align:center;border:1px solid #e8e1d3;border-radius:8px;padding:8px;font:700 13px/1 'JetBrains Mono',monospace;background:#f7f2ea;color:#1b1916;}
    .line-bot{display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #e8e1d3;font-size:13px;}
    .form h3{margin:0 0 8px;font:700 13px/1.2 Urbanist,sans-serif;display:flex;align-items:center;gap:6px;}
    .field{display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:12px;font-weight:600;color:#1b1916;}
    .field select,.field textarea{border:1px solid #e8e1d3;background:#f7f2ea;border-radius:10px;padding:10px 12px;font:400 13px/1.3 Urbanist,sans-serif;color:#1b1916;}
    .summary .rows{display:flex;flex-direction:column;gap:8px;margin-top:8px;font-size:13px;}
    .summary .rows>div{display:flex;justify-content:space-between;gap:8px;color:#7b756a;} .summary .rows>div span:last-child{color:#1b1916;}
    .summary .total{padding-top:8px;border-top:1px solid #e8e1d3;font-weight:700;color:#1b1916 !important;} .summary .total span:first-child{font-size:15px;}
    .w5-bar{position:fixed;left:0;right:0;bottom:0;max-width:390px;margin:0 auto;background:#fffdf9;border-top:1px solid #e8e1d3;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 -8px 20px rgba(27,25,22,.06);z-index:30;}
    .w5-bar strong{display:block;font:700 18px/1.1 'JetBrains Mono',monospace;color:#1b1916;}
    .w5-bar .cta{border:0;border-radius:999px;background:#c88a12;color:#1a1405;padding:14px 18px;font:600 14px/1 Urbanist,sans-serif;display:inline-flex;align-items:center;gap:8px;}
    .w5-bar .cta:disabled{opacity:.5;}
    .muted{color:#7b756a;} .small{font-size:11px;} .mono{font-family:'JetBrains Mono',monospace;} .accent{color:#c88a12;}
    .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);}
  `],
})
export class CartPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);
  readonly router = inject(Router);
  readonly cart = inject(CartService);
  readonly pricing = signal<Pricing | null>(null);
  readonly placing = signal(false);
  freight: 'gigl' | 'pickup' = 'gigl';
  notes = '';

  readonly tierLine = computed(() => {
    const t = this.pricing()?.tier;
    return t ? `${t.name} wholesale rate â€¢ ${t.discountPercent}% off retail` : '';
  });

  ngOnInit(): void {
    this.api.pricing().subscribe({ next: (p) => this.pricing.set(p), error: () => undefined });
  }

  variantLabel(line: CartLine): string {
    return [line.size || 'One size', line.colour || 'Standard'].join(' / ');
  }

  /**
   * The real MOQ, from the API. No hardcoded fallback: the account's actual
   * minimum is what the server enforces, so guessing could block a valid
   * order or wave through an invalid one.
   */
  moq(): number {
    return this.pricing()?.moq ?? 0;
  }

  /** False while pricing is still loading or the call failed. */
  moqKnown(): boolean {
    return this.moq() > 0;
  }

  /** With an unknown MOQ the client defers to the server, which enforces it regardless. */
  moqMet(): boolean {
    return !this.moqKnown() || this.cart.units() >= this.moq();
  }

  moqShort(): number {
    return Math.max(0, this.moq() - this.cart.units());
  }

  /** Quantity edits go through the cart service; a zero or blank removes the line. */
  setQuantity(line: CartLine, value: number | string | null): void {
    const qty = Math.floor(Number(value));
    if (!Number.isFinite(qty) || qty <= 0) {
      this.remove(line);
      return;
    }
    this.cart.lines.set(
      this.cart.lines().map((l) => (l.variantId === line.variantId ? { ...l, quantity: qty } : l)),
    );
  }

  remove(line: CartLine): void {
    this.cart.lines.set(this.cart.lines().filter((l) => l.variantId !== line.variantId));
  }

  async placeOrder(): Promise<void> {
    if (this.placing() || !this.moqMet() || this.cart.lines().length === 0) return;
    const units = this.cart.units();
    const total = this.currency.format(this.cart.amount(), 2);
    const ok = await this.confirm.ask({
      title: `Place this ${units}-unit order for ${total}?`,
      consequence: `Payment of ${total} is taken in full through Paystack now. Wholesale orders cannot be part-paid or changed once placed.`,
      confirmLabel: 'Place order & pay',
    });
    if (!ok) return;
    this.placing.set(true);
    const items = this.cart.toOrderItems();
    this.api
      .placeOrder(items, {
        deliveryMethod: this.freight === 'pickup' ? 'pickup' : 'freight',
        customerNote: this.notes,
      })
      .subscribe({
        next: (order) => {
          this.cart.clear();
          this.toast.show(
            `Order #${order.id.slice(0, 8).toUpperCase()} placed. Taking you to Paystack.`,
          );
          this.pay(order.id, order.totalAmount);
        },
        error: (err) => {
          this.placing.set(false);
          this.toast.show(err?.error?.message ?? 'The order could not be placed', {
            tone: 'danger',
            action: { label: 'Try again', run: () => void this.placeOrder() },
          });
        },
      });
  }

  /** Full amount, always: the API rejects any other figure. */
  private pay(orderId: string, amount: number): void {
    this.api.payWithPaystack(orderId, amount).subscribe({
      next: (res) => {
        this.placing.set(false);
        // Never navigate to an empty URL: fall back to the invoice, which
        // carries its own Pay now.
        if (!res?.authorizationUrl) {
          this.paymentFailed(orderId, 'Paystack did not return a payment page');
          return;
        }
        this.leaveFor(res.authorizationUrl);
      },
      error: (err) => {
        this.placing.set(false);
        this.paymentFailed(orderId, err?.error?.message ?? 'Payment could not be started');
      },
    });
  }

  /** Paystack hosts the payment and redirects back, so the app is left entirely. */
  leaveFor(url: string): void {
    window.location.href = url;
  }

  /** The order exists but is unpaid: send the buyer to its invoice, which has Pay now. */
  private paymentFailed(orderId: string, reason: string): void {
    this.toast.show(`${reason}. Pay from the invoice when ready.`, { tone: 'danger' });
    void this.router.navigate(['/orders', orderId, 'invoice']);
  }
}
