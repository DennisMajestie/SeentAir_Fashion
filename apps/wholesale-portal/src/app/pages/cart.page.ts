import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeEmptyStateComponent,
  SeFieldComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMoneyPipe,
  SePageComponent,
  SeRowAction,
  SeTableComponent,
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
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeCellDirective,
    SeEmptyStateComponent,
    SeFieldComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMoneyPipe,
    SePageComponent,
    SeTableComponent,
  ],
  template: `
    <se-page
      title="Bulk cart"
      [breadcrumbs]="[{ label: 'Catalogue', link: '/catalogue' }, { label: 'Cart' }]"
      [description]="tierLine()"
    >
      @if (cart.lines().length === 0) {
        <se-empty-state
          heading="Your cart is empty"
          text="Add units from the catalogue, then come back to place the batch."
          actionLabel="Browse catalogue"
          (action)="router.navigate(['/catalogue'])"
        />
      } @else {
        <div class="se-detail">
          <div class="se-detail__main">
            <se-card title="Batch lines" flush>
              <se-table
                caption="Cart lines"
                [columns]="columns"
                [rows]="cart.lines()"
                [rowId]="rowId"
                [actions]="actions"
                hideDensity
              >
                <ng-template seCell="item" let-row>
                  <strong>{{ row.productName }}</strong>
                  <div class="sub">{{ row.sku }} · {{ variantLabel(row) }}</div>
                </ng-template>
                <ng-template seCell="quantity" let-row>
                  <se-field [label]="'Quantity for ' + row.sku" hideLabel>
                    <input
                      seInput
                      type="number"
                      inputmode="numeric"
                      min="1"
                      step="1"
                      class="qty"
                      [ngModel]="row.quantity"
                      (ngModelChange)="setQuantity(row, $event)"
                      [name]="'qty-' + row.variantId"
                    />
                  </se-field>
                </ng-template>
              </se-table>
            </se-card>

            <se-card title="Delivery and notes">
              <div class="se-form">
                <se-field
                  label="Delivery"
                  hint="Freight is quoted on the waybill at dispatch; pickup is free."
                >
                  <select seInput [(ngModel)]="freight" name="freight">
                    <option value="gigl">GIGL freight dispatch (tracked)</option>
                    <option value="pickup">Factory pickup, Aba workshop</option>
                  </select>
                </se-field>
                <se-field
                  label="Notes for the factory desk"
                  optional
                  hint="Consignee contact and destination are confirmed with the desk after payment."
                >
                  <textarea seInput rows="3" [(ngModel)]="notes" name="notes"></textarea>
                </se-field>
              </div>
            </se-card>
          </div>

          <div class="se-detail__aside">
            <se-card title="Order summary">
              @if (moqKnown() && !moqMet()) {
                <se-banner tone="warning" title="Below the batch minimum">
                  Wholesale orders are at least {{ moq() }} units. Add {{ moqShort() }} more to
                  place this batch.
                </se-banner>
              } @else if (!moqKnown()) {
                <se-banner tone="info" title="Minimum being confirmed">
                  The server checks the batch minimum when you place the order.
                </se-banner>
              }
              <dl seKv>
                <div seKvItem label="Units" numeric>{{ cart.units() }}</div>
                <div seKvItem label="Minimum order" numeric>
                  {{ moqKnown() ? moq() + ' units' : 'Confirmed by the desk' }}
                </div>
                @if (pricing()?.tier; as tier) {
                  <div seKvItem label="Rate card">
                    {{ tier.name }} · {{ tier.discountPercent }}% off retail
                  </div>
                }
                <div seKvItem label="Subtotal" numeric>{{ cart.amount() | seMoney: 2 }}</div>
                <div seKvItem label="Freight" numeric>On final invoice</div>
                <div seKvItem label="Total payable" numeric>
                  <strong>{{ cart.amount() | seMoney: 2 }}</strong>
                </div>
              </dl>
              <p class="rule">
                Full payment upfront. No part-payments: the batch enters production once Paystack
                confirms the full amount.
              </p>
              <ng-container seCardFooter>
                <button
                  seButton
                  variant="primary"
                  type="button"
                  class="place"
                  [disabled]="!moqMet()"
                  [loading]="placing()"
                  (click)="placeOrder()"
                >
                  Place order &amp; pay
                </button>
              </ng-container>
            </se-card>
          </div>
        </div>
      }
    </se-page>
  `,
  styles: [
    `
      .sub {
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
      .qty {
        width: 5.5rem;
      }
      .rule {
        margin: var(--se-space-3) 0 0;
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
      .place {
        width: 100%;
      }
    `,
  ],
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

  readonly rowId = (l: CartLine) => l.variantId;
  readonly columns: SeColumn<CartLine>[] = [
    { key: 'item', header: 'Item', value: (l) => l.productName },
    {
      key: 'unitPrice',
      header: 'Unit price',
      numeric: true,
      format: (v) => this.currency.format(v as number, 2),
    },
    { key: 'quantity', header: 'Qty', numeric: true, width: '7rem' },
    {
      key: 'lineTotal',
      header: 'Line total',
      numeric: true,
      value: (l) => l.quantity * l.unitPrice,
      format: (v) => this.currency.format(v as number, 2),
    },
  ];
  readonly actions: SeRowAction<CartLine>[] = [
    { label: 'Remove', icon: 'trash', danger: true, run: (l) => this.remove(l) },
  ];

  readonly tierLine = computed(() => {
    const t = this.pricing()?.tier;
    return t ? `${t.name} wholesale rate · ${t.discountPercent}% off retail` : '';
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
