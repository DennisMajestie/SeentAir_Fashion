import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SeActivityComponent,
  SeActivityEntry,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDatePipe,
  SeDrawerComponent,
  SeEmptyStateComponent,
  SeFieldComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMoneyPipe,
  SePageComponent,
  SeSkeletonComponent,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
  statusMeaning,
} from '@seentair/ui';
import { AdminOrder, ApiService } from '../api.service';
import { channelLabel, customerName, nextStep, orderRef, unitCount } from './order-format';

type OrderLine = NonNullable<AdminOrder['items']>[number];

/**
 * One order: what was bought, where it is going, what has happened to it, and
 * the next thing to do with it.
 *
 * The page's primary action is always the single next step for this order:
 * the next fulfilment status, or allocating stock when it is held on a stock
 * exception. Anything that cannot be taken back is confirmed first, with what
 * it will do stated in the dialog.
 */
@Component({
  selector: 'app-order-detail',
  imports: [
    FormsModule,
    SeActivityComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeDatePipe,
    SeDrawerComponent,
    SeEmptyStateComponent,
    SeFieldComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMoneyPipe,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page [title]="'Order ' + ref" [breadcrumbs]="crumbs">
      @if (order(); as o) {
        <ng-container sePageStatus>
          <se-status kind="order" [value]="o.status" />
          <se-status kind="payment" [value]="o.paymentStatus" />
        </ng-container>
      }
      @if (order(); as o) {
        <p sePageMeta>
          Placed {{ o.createdAt | seDate: 'datetime' }} by {{ name(o) }}, {{ channel(o) }}
        </p>
      }
      @if (order(); as o) {
        <ng-container sePageActions>
          @if (o.customer) {
            <button seButton type="button" (click)="messaging.set(true)">Message customer</button>
          }
          @if (o.status === 'stock_exception') {
            <button seButton type="button" [loading]="busy() === 'refund'" (click)="refund(o)">
              Refund
            </button>
            <button
              seButton
              variant="primary"
              type="button"
              [loading]="busy() === 'allocate'"
              (click)="allocate(o)"
            >
              Allocate stock
            </button>
          } @else if (next(); as step) {
            <button
              seButton
              variant="primary"
              type="button"
              [loading]="busy() === 'advance'"
              (click)="advance(o)"
            >
              {{ step.label }}
            </button>
          }
        </ng-container>
      }

      @if (loading()) {
        <div class="se-detail" aria-busy="true">
          <div class="se-detail__main">
            <se-card><se-skeleton shape="table" [rows]="3" [columns]="5" /></se-card>
          </div>
          <aside class="se-detail__aside">
            <se-card><se-skeleton shape="detail" [rows]="4" /></se-card>
          </aside>
        </div>
      } @else if (missing()) {
        <se-card>
          <se-empty-state
            heading="This order does not exist"
            text="It may have been removed, or the link may be wrong."
            actionLabel="Back to orders"
            (action)="back()"
          />
        </se-card>
      } @else if (loadError()) {
        <se-banner
          tone="danger"
          title="The order could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          {{ loadError() }}
        </se-banner>
      } @else if (order(); as o) {
        @if (o.status === 'stock_exception') {
          <se-banner tone="warning" title="Paid, but short on stock">
            {{ shortSummary(o) }} Allocate stock once a finished batch has landed, or refund the
            order.
          </se-banner>
        } @else if (o.paymentStatus === 'unpaid' && o.status !== 'cancelled') {
          <se-banner tone="info" title="Awaiting payment">
            Orders are paid in full upfront. This one cannot move forward until the payment is in.
          </se-banner>
        }

        <div class="se-detail">
          <div class="se-detail__main">
            <se-card title="Items" flush>
              <button seButton size="sm" seCardActions type="button" (click)="print()">
                Print packing slip
              </button>
              <se-table
                caption="Items in this order"
                [columns]="lineColumns"
                [rows]="o.items ?? []"
                hideDensity
                emptyHeading="This order has no items"
              />
              <ng-container seCardFooter>
                <dl seKv class="order-total">
                  <div seKvItem [label]="units(o) + (units(o) === 1 ? ' unit' : ' units')" numeric>
                    {{ o.totalAmount | seMoney }}
                  </div>
                </dl>
              </ng-container>
            </se-card>

            <se-card title="Pack-out">
              <button seButton size="sm" seCardActions type="button" (click)="openPackOut()">
                Record pack-out
              </button>
              <dl seKv>
                <div seKvItem label="Gross weight" numeric>
                  {{ o.grossWeightKg ? o.grossWeightKg + ' kg' : '–' }}
                </div>
                <div seKvItem label="Pallet">{{ o.palletRef || '–' }}</div>
                <div seKvItem label="QR dispatch stencil">
                  {{ o.qrStencilRef || 'Not generated' }}
                </div>
              </dl>
            </se-card>
          </div>

          <aside class="se-detail__aside">
            <se-card title="Details">
              <dl seKv>
                <div seKvItem label="Customer">{{ name(o) }}</div>
                @if (!o.customer && o.guestEmail) {
                  <div seKvItem label="Email">{{ o.guestEmail }}</div>
                }
                <div seKvItem label="Channel">{{ channel(o) }}</div>
                <div seKvItem label="Placed">{{ o.createdAt | seDate: 'datetime' }}</div>
                <div seKvItem label="Delivered">{{ o.deliveredAt | seDate: 'datetime' }}</div>
                <div seKvItem label="Total" numeric>{{ o.totalAmount | seMoney }}</div>
              </dl>
              <ng-container seCardFooter>
                <button seButton size="sm" type="button" (click)="copyRef(o.id)">
                  Copy full reference
                </button>
              </ng-container>
            </se-card>

            <se-card title="Delivery">
              <button seButton size="sm" seCardActions type="button" (click)="openAddress(o)">
                {{ o.shippingAddress ? 'Change address' : 'Add address' }}
              </button>
              @if (o.shippingAddress; as a) {
                <dl seKv>
                  <div seKvItem label="Address">{{ a.line }}, {{ a.city }}, {{ a.state }}</div>
                  @if (a.landmark) {
                    <div seKvItem label="Landmark">{{ a.landmark }}</div>
                  }
                  <div seKvItem label="Phone">{{ a.phone }}</div>
                  <div seKvItem label="Waybill note">{{ o.deliveryNote || '–' }}</div>
                </dl>
              } @else {
                <p class="se-type-body">No delivery address on this order.</p>
              }
              @if (o.deliveryMethod || o.customerNote) {
                <dl seKv>
                  @if (o.deliveryMethod) {
                    <div seKvItem label="Requested delivery">
                      {{
                        o.deliveryMethod === 'pickup'
                          ? 'Factory pickup, Aba'
                          : 'Courier freight (GIGL)'
                      }}
                    </div>
                  }
                  @if (o.customerNote) {
                    <div seKvItem label="Buyer note">{{ o.customerNote }}</div>
                  }
                </dl>
              }
            </se-card>

            <se-card title="Activity">
              <se-activity [entries]="activity()" />
            </se-card>
          </aside>
        </div>
      }
    </se-page>

    <!-- Change the delivery address: six fields, so a drawer. -->
    <se-drawer [title]="'Delivery address for ' + ref" [(open)]="addressOpen">
      @if (saveError()) {
        <se-banner
          tone="danger"
          title="The address was not saved"
          actionLabel="Try again"
          (action)="saveAddress()"
        >
          {{ saveError() }} What you typed is still here.
        </se-banner>
      }
      <form class="se-form" (submit)="$event.preventDefault(); saveAddress()">
        <se-field label="Street address" [error]="addressError('line')">
          <input seInput name="line" [(ngModel)]="address.line" autocomplete="off" />
        </se-field>
        <div class="se-form__row">
          <se-field label="City or LGA" [error]="addressError('city')">
            <input seInput name="city" [(ngModel)]="address.city" autocomplete="off" />
          </se-field>
          <se-field label="State" [error]="addressError('state')">
            <input seInput name="state" [(ngModel)]="address.state" autocomplete="off" />
          </se-field>
        </div>
        <se-field
          label="Delivery phone"
          hint="Include the country code"
          [error]="addressError('phone')"
        >
          <input seInput type="tel" name="phone" [(ngModel)]="address.phone" autocomplete="off" />
        </se-field>
        <se-field label="Landmark" optional>
          <input seInput name="landmark" [(ngModel)]="address.landmark" autocomplete="off" />
        </se-field>
        <se-field label="Waybill note" hint="Gate code, call on arrival, best time" optional>
          <textarea seInput rows="2" name="note" [(ngModel)]="address.note"></textarea>
        </se-field>
      </form>
      <ng-container seDrawerFooter>
        <button seButton type="button" (click)="addressOpen.set(false)">Cancel</button>
        <button
          seButton
          variant="primary"
          type="button"
          [loading]="saving()"
          (click)="saveAddress()"
        >
          Save address
        </button>
      </ng-container>
    </se-drawer>

    <se-drawer [title]="'Pack-out for ' + ref" [(open)]="packOutOpen">
      @if (saveError()) {
        <se-banner
          tone="danger"
          title="The pack-out was not recorded"
          actionLabel="Try again"
          (action)="savePackOut()"
        >
          {{ saveError() }} What you typed is still here.
        </se-banner>
      }
      <form class="se-form" (submit)="$event.preventDefault(); savePackOut()">
        <se-field label="Gross weight" hint="In kilograms" optional>
          <input
            seInput
            type="number"
            min="0"
            step="0.1"
            name="weight"
            [(ngModel)]="packOut.weight"
          />
        </se-field>
        <se-field label="Pallet reference" optional>
          <input seInput name="pallet" [(ngModel)]="packOut.pallet" autocomplete="off" />
        </se-field>
        <label class="se-choice">
          <input type="checkbox" name="qr" [(ngModel)]="packOut.qr" />
          <span>Generate a QR dispatch stencil for the top carton</span>
        </label>
      </form>
      <ng-container seDrawerFooter>
        <button seButton type="button" (click)="packOutOpen.set(false)">Cancel</button>
        <button
          seButton
          variant="primary"
          type="button"
          [loading]="saving()"
          (click)="savePackOut()"
        >
          Record pack-out
        </button>
      </ng-container>
    </se-drawer>

    <se-drawer [title]="'Message about ' + ref" [(open)]="messaging">
      @if (saveError()) {
        <se-banner
          tone="danger"
          title="The message was not sent"
          actionLabel="Try again"
          (action)="sendMessage()"
        >
          {{ saveError() }} What you typed is still here.
        </se-banner>
      }
      <form class="se-form" (submit)="$event.preventDefault(); sendMessage()">
        <se-field
          label="Message"
          hint="Sent to the customer's account on the storefront"
          [error]="messageError()"
        >
          <textarea seInput rows="4" name="message" [(ngModel)]="message"></textarea>
        </se-field>
      </form>
      <ng-container seDrawerFooter>
        <button seButton type="button" (click)="messaging.set(false)">Cancel</button>
        <button
          seButton
          variant="primary"
          type="button"
          [loading]="saving()"
          (click)="sendMessage()"
        >
          Send message
        </button>
      </ng-container>
    </se-drawer>
  `,
})
export class OrderDetailPage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly ref = orderRef(this.id);
  readonly crumbs = [{ label: 'Orders', link: '/orders' }, { label: this.ref }];

  readonly order = signal<AdminOrder | null>(null);
  private readonly events = signal<
    Array<{ status: string; note?: string | null; createdAt: string }>
  >([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly missing = signal(false);
  /** Which page action is running, for its button's loading state. */
  readonly busy = signal<'' | 'advance' | 'allocate' | 'refund'>('');

  readonly next = computed(() => {
    const o = this.order();
    return o ? nextStep(o) : null;
  });

  /** Status events, newest first. An order with none still shows when it was placed. */
  readonly activity = computed<SeActivityEntry[]>(() => {
    const o = this.order();
    if (!o) return [];
    const entries = [...this.events()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((e) => {
        const meaning = statusMeaning('order', e.status);
        return {
          at: e.createdAt,
          text: e.note ? `${meaning.label}: ${e.note}` : meaning.label,
          tone: meaning.tone === 'neutral' || meaning.tone === 'info' ? undefined : meaning.tone,
        };
      });
    return entries.length > 0 ? entries : [{ at: o.createdAt, text: 'Order placed' }];
  });

  readonly lineColumns: SeColumn<OrderLine>[] = [
    { key: 'sku', header: 'SKU', value: (l) => l.variant.sku },
    {
      key: 'description',
      header: 'Description',
      value: (l) =>
        [l.variant.colour, l.variant.size ? `size ${l.variant.size}` : '']
          .filter(Boolean)
          .join(', '),
    },
    { key: 'quantity', header: 'Qty', numeric: true },
    {
      key: 'unitPrice',
      header: 'Unit price',
      numeric: true,
      format: (v) => this.currency.format(v as number),
    },
    {
      key: 'line',
      header: 'Line total',
      numeric: true,
      value: (l) => l.quantity * l.unitPrice,
      format: (v) => this.currency.format(v as number),
    },
  ];

  constructor() {
    this.load();
  }

  load(): void {
    this.loadError.set('');
    this.missing.set(false);
    this.api.order(this.id).subscribe({
      next: (o) => {
        this.order.set(o as unknown as AdminOrder);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (err?.status === 404 || err?.status === 400) this.missing.set(true);
        else
          this.loadError.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
      },
    });
    this.api.orderTracking(this.id).subscribe({
      next: (t) => this.events.set(((t as { events?: never[] }).events ?? []) as never),
      error: () => this.events.set([]),
    });
  }

  // ---- display helpers ----
  name = customerName;
  channel(o: AdminOrder): string {
    return channelLabel(o.channel) + (o.source ? ` via ${o.source}` : '');
  }
  units = unitCount;
  shortSummary(o: AdminOrder): string {
    const short = (o.items ?? []).filter((l) => (l.shortfall ?? 0) > 0);
    if (short.length === 0) return 'Some lines could not be allocated when this order was paid.';
    return short.map((l) => `${l.variant.sku} is short ${l.shortfall} of ${l.quantity}.`).join(' ');
  }

  // ---- page actions ----
  async advance(o: AdminOrder): Promise<void> {
    const step = nextStep(o);
    if (!step) return;
    const ok = await this.confirm.ask({
      title: `${step.label.replace('Mark as', 'Mark order ' + this.ref + ' as')}?`,
      consequence: `${step.consequence} An order cannot be moved back to an earlier status.`,
      confirmLabel: step.label,
    });
    if (!ok) return;
    this.busy.set('advance');
    this.api.advanceOrder(o.id, step.status).subscribe({
      next: () => this.done(`Order ${this.ref} marked as ${step.status}`),
      error: (err) =>
        this.failed(err, 'The order could not be updated', () => void this.advance(o)),
    });
  }

  allocate(o: AdminOrder): void {
    this.busy.set('allocate');
    this.api.allocateStockException(o.id).subscribe({
      next: (res) =>
        this.done(
          res.status === 'stock_exception'
            ? 'Some lines are still short: the order stays on hold'
            : `Stock allocated: order ${this.ref} is back in fulfilment`,
        ),
      error: (err) => this.failed(err, 'Stock could not be allocated', () => this.allocate(o)),
    });
  }

  async refund(o: AdminOrder): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Refund order ${this.ref}?`,
      consequence: `Any stock set aside for it is released, a refund of ${this.currency.format(o.totalAmount)} is recorded in the ledger and the order is cancelled. This cannot be undone. The money itself still has to be returned to the customer in Paystack.`,
      confirmLabel: 'Record refund',
      danger: true,
    });
    if (!ok) return;
    this.busy.set('refund');
    this.api.refundStockException(o.id).subscribe({
      next: () => this.done(`Refund recorded: order ${this.ref} cancelled`),
      error: (err) =>
        this.failed(err, 'The refund could not be recorded', () => void this.refund(o)),
    });
  }

  private done(message: string): void {
    this.busy.set('');
    this.toast.show(message);
    this.load();
  }

  /** A page action failed and there is no form to hold a banner: a toast with a retry. */
  private failed(err: { error?: { message?: string } }, fallback: string, retry: () => void): void {
    this.busy.set('');
    this.toast.show(err?.error?.message ?? fallback, {
      tone: 'danger',
      action: { label: 'Try again', run: retry },
    });
  }

  copyRef(id: string): void {
    navigator.clipboard?.writeText(id).then(
      () => this.toast.show('Order reference copied'),
      () => this.toast.show('Could not copy the reference', { tone: 'danger' }),
    );
  }

  print(): void {
    window.print();
  }

  back(): void {
    void this.router.navigate(['/orders']);
  }

  // ---- drawers ----
  readonly addressOpen = signal(false);
  readonly packOutOpen = signal(false);
  readonly messaging = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');
  private readonly submitted = signal(false);

  address = { line: '', city: '', state: '', phone: '', landmark: '', note: '' };
  packOut = { weight: null as number | null, pallet: '', qr: false };
  message = '';

  openAddress(o: AdminOrder): void {
    const a = o.shippingAddress;
    this.address = {
      line: a?.line ?? '',
      city: a?.city ?? '',
      state: a?.state ?? '',
      phone: a?.phone ?? '',
      landmark: a?.landmark ?? '',
      note: o.deliveryNote ?? '',
    };
    this.resetForm();
    this.addressOpen.set(true);
  }

  /** The address is all four parts or it is not an address the courier can use. */
  addressError(field: 'line' | 'city' | 'state' | 'phone'): string {
    if (!this.submitted() || this.address[field].trim()) return '';
    return {
      line: 'Enter the street address.',
      city: 'Enter the city or LGA.',
      state: 'Enter the state.',
      phone: 'Enter a phone number the courier can call.',
    }[field];
  }

  saveAddress(): void {
    this.submitted.set(true);
    const a = this.address;
    if (![a.line, a.city, a.state, a.phone].every((v) => v.trim())) return;
    this.save(
      {
        shippingAddress: {
          line: a.line.trim(),
          city: a.city.trim(),
          state: a.state.trim(),
          phone: a.phone.trim(),
          ...(a.landmark.trim() ? { landmark: a.landmark.trim() } : {}),
        },
        ...(a.note.trim() ? { deliveryNote: a.note.trim() } : {}),
      },
      'Delivery address saved',
      this.addressOpen,
    );
  }

  openPackOut(): void {
    this.packOut = { weight: null, pallet: '', qr: false };
    this.resetForm();
    this.packOutOpen.set(true);
  }

  savePackOut(): void {
    const p = this.packOut;
    this.save(
      {
        generateQrStencil: p.qr,
        ...(p.weight !== null && p.weight !== undefined ? { grossWeightKg: Number(p.weight) } : {}),
        ...(p.pallet.trim() ? { palletRef: p.pallet.trim() } : {}),
      },
      'Pack-out recorded',
      this.packOutOpen,
    );
  }

  private save(
    body: Record<string, unknown>,
    success: string,
    drawer: { set(open: boolean): void },
  ): void {
    this.saving.set(true);
    this.saveError.set('');
    this.api.fulfilOrder(this.id, body).subscribe({
      next: () => {
        this.saving.set(false);
        drawer.set(false);
        this.toast.show(success);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'The server did not respond.');
      },
    });
  }

  messageError(): string {
    return this.submitted() && !this.message.trim() ? 'Write the message to send.' : '';
  }

  sendMessage(): void {
    this.submitted.set(true);
    const o = this.order();
    const text = this.message.trim();
    if (!text || !o?.customer) return;
    this.saving.set(true);
    this.saveError.set('');
    this.api
      .sendNotification({
        recipientId: o.customer.id,
        channel: 'in_platform',
        type: 'order_update',
        message: text,
        relatedOrderId: o.id,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.messaging.set(false);
          this.message = '';
          this.resetForm();
          this.toast.show(`Message sent to ${o.customer?.name}`);
        },
        error: (err) => {
          this.saving.set(false);
          this.saveError.set(err?.error?.message ?? 'The server did not respond.');
        },
      });
  }

  private resetForm(): void {
    this.submitted.set(false);
    this.saveError.set('');
  }
}
