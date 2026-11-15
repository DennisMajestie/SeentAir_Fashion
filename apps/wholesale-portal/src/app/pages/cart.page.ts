import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SeConfirmService, SeCurrencyService, SeMoneyPipe, SeToastService } from '@seentair/ui';
import { ApiService, Pricing } from '../api.service';
import { CartLine, CartService } from '../cart.service';

/**
 * W5 Bulk Cart & Checkout, carried verbatim from the Stitch screen. The cart
 * lines live in `CartService` (shared with the catalogue and the matrix);
 * this page edits quantities, checks the batch against the account's real
 * minimum, places the order through POST /orders (the server re-prices at the
 * buyer's tier and enforces MOQ) and then sends the buyer to Paystack for the
 * full amount. Wholesale is full payment upfront: there is no part-payment
 * path here, by design.
 */
@Component({
  selector: 'app-cart',
  imports: [FormsModule, RouterLink, SeMoneyPipe],
  template: `
    <div class="stitch">
      <div class="bg-canvas text-light-on-surface min-h-screen pb-32 antialiased selection:bg-accent/20">
        <header class="px-4 pt-4 pb-3 border-b border-border/70 bg-canvas/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <a routerLink="/catalogue" class="w-8 h-8 rounded-full bg-light-surface border border-border flex items-center justify-center text-light-primary" aria-label="Back to catalogue">
              <span class="material-symbols-outlined text-[18px]">arrow_back</span>
            </a>
            <div>
              <h1 class="text-[17px] font-bold text-light-primary">Bulk Cart & Allocation</h1>
              <span class="text-[11px] text-light-secondary">{{ cart.lines().length }} lines • {{ cart.units() }} total units</span>
            </div>
          </div>
          @if (cart.lines().length > 0) {
            @if (moqMet()) {
              <span class="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30">MOQs MET</span>
            } @else {
              <span class="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30">BELOW MOQ</span>
            }
          }
        </header>

        <main class="px-4 py-4 flex flex-col gap-4 max-w-[390px] mx-auto w-full">
          @if (cart.lines().length === 0) {
            <div class="empty-state bg-light-surface p-3.5 rounded-xl border border-border flex flex-col items-center gap-1.5 text-center">
              <span class="material-symbols-outlined text-[28px] text-light-secondary">shopping_bag</span>
              <strong class="text-[14px] text-light-primary">Your cart is empty</strong>
              <p class="text-[11px] text-light-secondary">Add units from the catalogue, then come back to place the batch.</p>
              <button type="button" class="mt-1 px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold" (click)="router.navigate(['/catalogue'])">Browse catalogue</button>
            </div>
          } @else {
            <!-- Batch Settlement Notice -->
            <div class="upfront-notice p-3.5 rounded-xl bg-canvas-tint/70 border border-border flex items-start gap-2.5">
              <span class="material-symbols-outlined text-warning text-[18px] mt-0.5">account_balance_wallet</span>
              <div class="text-[12px] leading-relaxed text-light-primary">
                <strong class="font-semibold text-light-primary">Full 100% Upfront Payment:</strong> Aba Mill cutting schedules lock immediately upon cleared funds. Orders are non-cancellable once cut. No part-payments.
              </div>
            </div>

            @for (group of groups(); track group.productId) {
              <article class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-3">
                <div class="flex items-start justify-between border-b border-border pb-2.5">
                  <div>
                    <span class="text-[10px] font-mono text-light-secondary uppercase">{{ group.lines.length }} variant{{ group.lines.length === 1 ? '' : 's' }} drafted</span>
                    <h2 class="text-[14px] font-bold text-light-primary">{{ group.productName }}</h2>
                    <span class="text-[12px] font-mono text-accent font-semibold">{{ groupPriceLabel(group.lines) }}</span>
                  </div>
                  <button type="button" aria-label="Remove {{ group.productName }}" class="text-light-secondary hover:text-danger p-1" (click)="removeProduct(group.productId)">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>

                <div class="flex flex-col gap-1.5 text-[12px]">
                  @for (line of group.lines; track line.variantId) {
                    <div class="line-row flex justify-between items-center py-1 bg-canvas/60 px-2.5 rounded-md gap-2">
                      <span class="text-light-secondary min-w-0 truncate">{{ line.sku }} • {{ variantLabel(line) }}</span>
                      <span class="flex items-center gap-2 flex-shrink-0">
                        <label class="sr-only" [for]="'q-' + line.variantId">Quantity for {{ line.sku }}</label>
                        <input
                          [id]="'q-' + line.variantId"
                          type="number"
                          inputmode="numeric"
                          min="1"
                          step="1"
                          class="w-14 text-center font-mono font-bold text-[12px] bg-light-surface border border-border rounded py-0.5 focus:outline-none focus:border-accent"
                          [ngModel]="line.quantity"
                          (ngModelChange)="setQuantity(line, $event)"
                        />
                        <span class="font-mono font-bold text-light-primary">{{ line.quantity * line.unitPrice | seMoney: 2 }}</span>
                      </span>
                    </div>
                  }
                </div>

                <div class="pt-2 border-t border-border flex items-center justify-between text-[13px]">
                  <span class="text-light-secondary">Subtotal ({{ group.units }} units)</span>
                  <span class="font-mono font-bold text-light-primary">{{ group.amount | seMoney: 2 }}</span>
                </div>
              </article>
            }

            <!-- Delivery & Notes -->
            <section class="bg-light-surface rounded-xl p-4 border border-border flex flex-col gap-3">
              <h3 class="text-[13px] font-bold text-light-primary flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[16px] text-accent">local_shipping</span>
                Dispatch & Destination
              </h3>
              <div class="p-2.5 rounded-lg bg-canvas border border-border text-[12px] flex justify-between items-center relative">
                <div>
                  <span class="font-bold text-light-primary block">{{ freightLabel() }}</span>
                  <span class="text-light-secondary block">{{ freightHint() }}</span>
                </div>
                <span class="text-warning font-semibold text-[11px]">Edit</span>
                <select class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Delivery method" [(ngModel)]="freight" name="freight">
                  <option value="gigl">GIGL freight dispatch (tracked)</option>
                  <option value="pickup">Factory pickup, Aba workshop</option>
                </select>
              </div>

              <label class="flex flex-col gap-1">
                <span class="text-[12px] font-semibold text-light-primary">Packing/Dispatch notes</span>
                <input
                  type="text"
                  placeholder="e.g. Include barcoded carton labels"
                  class="px-3 py-2 rounded-md bg-canvas border border-border text-[12px] text-light-primary focus:outline-none focus:border-accent"
                  [(ngModel)]="notes"
                  name="notes"
                />
              </label>
            </section>

            <!-- Order Cost Summary Breakdown -->
            <section class="bg-light-surface rounded-xl p-4 border border-border flex flex-col gap-2 text-[13px]">
              @if (moqKnown() && !moqMet()) {
                <div class="moq-warning p-2.5 rounded-lg bg-[#fff7eb] border border-warning/30 text-[12px]">
                  <strong class="font-semibold text-warning block">Below the batch minimum</strong>
                  <span class="text-light-secondary">Add {{ moqShort() }} more units: the batch minimum is at least {{ moq() }} units.</span>
                </div>
              } @else if (!moqKnown()) {
                <div class="moq-info p-2.5 rounded-lg bg-canvas border border-border text-[12px]">
                  <strong class="font-semibold text-light-primary block">Minimum being confirmed</strong>
                  <span class="text-light-secondary">The server checks the batch minimum when you place the order.</span>
                </div>
              }

              <div class="summary-rows flex flex-col gap-2">
                <div class="flex justify-between text-light-secondary">
                  <span>Units</span>
                  <span class="font-mono text-light-primary">{{ cart.units() }}</span>
                </div>
                <div class="flex justify-between text-light-secondary">
                  <span>Minimum order</span>
                  <span class="font-mono text-light-primary">{{ moqKnown() ? moq() + ' units' : 'Confirmed by desk' }}</span>
                </div>
                @if (pricing()?.tier; as tier) {
                  <div class="flex justify-between text-light-secondary">
                    <span>Rate card</span>
                    <span class="font-mono text-success">{{ tier.name }} · {{ tier.discountPercent }}% off retail</span>
                  </div>
                }
                <div class="flex justify-between text-light-secondary">
                  <span>Subtotal</span>
                  <span class="font-mono text-light-primary">{{ cart.amount() | seMoney: 2 }}</span>
                </div>
                <div class="flex justify-between text-light-secondary">
                  <span>Freight & Handling</span>
                  <span class="font-mono text-light-primary">On final invoice</span>
                </div>
                <div class="pt-2 border-t border-border flex justify-between items-baseline font-bold">
                  <span class="text-light-primary text-[15px]">Total Payable (100% Upfront)</span>
                  <span class="font-mono text-[18px] text-accent">{{ cart.amount() | seMoney: 2 }}</span>
                </div>
              </div>
            </section>
          }
        </main>

        @if (cart.lines().length > 0) {
          <!-- Sticky Bottom Checkout Action -->
          <aside aria-label="Checkout action" class="fixed bottom-0 left-0 right-0 max-w-[390px] mx-auto bg-light-surface border-t border-border px-4 py-3 flex items-center justify-between shadow-[0_-8px_20px_rgba(27,25,22,0.06)] z-30">
            <div>
              <span class="text-[11px] text-light-secondary block font-medium">Payable in full now</span>
              <span class="font-mono font-bold text-[18px] text-light-primary">{{ cart.amount() | seMoney: 2 }}</span>
            </div>
            <button
              type="button"
              class="place px-6 py-3.5 rounded-full bg-accent text-on-accent font-semibold text-[14px] flex items-center gap-2 shadow-sm hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
              [disabled]="!moqMet()"
              [attr.aria-busy]="placing()"
              (click)="placeOrder()"
            >
              <span>{{ placing() ? 'Placing…' : 'Place order & pay' }}</span>
              <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </aside>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
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

  /** Cart lines grouped per product, like the Stitch screen's line items. */
  readonly groups = computed(() => {
    const byProduct = new Map<string, { productId: string; productName: string; lines: CartLine[] }>();
    for (const l of this.cart.lines()) {
      const g = byProduct.get(l.productId) ?? {
        productId: l.productId,
        productName: l.productName,
        lines: [],
      };
      g.lines.push(l);
      byProduct.set(l.productId, g);
    }
    return [...byProduct.values()].map((g) => ({
      ...g,
      units: g.lines.reduce((n, l) => n + l.quantity, 0),
      amount: g.lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0),
    }));
  });

  ngOnInit(): void {
    this.api.pricing().subscribe({ next: (p) => this.pricing.set(p), error: () => undefined });
  }

  variantLabel(line: CartLine): string {
    return [line.size || 'One size', line.colour || 'Standard'].join(' / ');
  }

  /** One per-unit price when every variant of the product shares it. */
  groupPriceLabel(lines: CartLine[]): string {
    const prices = [...new Set(lines.map((l) => l.unitPrice))];
    if (prices.length === 1) return `${this.currency.format(prices[0], 2)} / unit`;
    return 'Per-variant rates';
  }

  freightLabel(): string {
    return this.freight === 'pickup' ? 'Factory pickup, Aba workshop' : 'GIGL freight dispatch';
  }

  freightHint(): string {
    return this.freight === 'pickup'
      ? 'Collect at the factory desk'
      : 'Tracked dispatch from the Aba hub';
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

  /** Removes every drafted variant of one product. */
  removeProduct(productId: string): void {
    this.cart.lines.set(this.cart.lines().filter((l) => l.productId !== productId));
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
