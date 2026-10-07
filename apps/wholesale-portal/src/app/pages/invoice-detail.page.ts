import { Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDatePipe,
  SeEmptyStateComponent,
  SeKvDirective,
  SeKvItemComponent,
  SeMoneyPipe,
  SePageComponent,
  SeSkeletonComponent,
  SeStatusComponent,
  SeTableComponent,
  formatDate,
} from '@seentair/ui';
import { ApiService, Invoice } from '../api.service';
import { isClosed, isPaid, orderRef, payMethod, units } from '../wholesale-format';

type Line = Invoice['items'][number];

/**
 * Invoice detail: the commercial document for one wholesale order.
 *
 * Nothing on it collapses, because the page doubles as the printable
 * invoice. The money comes from the server-computed order total; the
 * amount handed to Paystack is that total, never an editable field, because
 * wholesale is full payment upfront.
 */
@Component({
  selector: 'app-invoice-detail',
  imports: [
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeDatePipe,
    SeEmptyStateComponent,
    SeKvDirective,
    SeKvItemComponent,
    SeMoneyPipe,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page [title]="invoice() ? 'Invoice ' + ref() : 'Invoice'" [breadcrumbs]="crumbs()">
      @if (invoice(); as inv) {
        <ng-container sePageStatus>
          <se-status kind="order" [value]="inv.status" />
          <se-status kind="payment" [value]="inv.paymentStatus" />
        </ng-container>
      }
      @if (invoice(); as inv) {
        <p sePageMeta>
          {{ paid(inv) ? 'Commercial tax invoice' : 'Pro-forma invoice' }} issued
          {{ inv.createdAt | seDate }}{{ paid(inv) ? '. ' + settledLine(inv) : ''
          }}{{ closedNote(inv) }}
        </p>
      }
      @if (invoice(); as inv) {
        <ng-container sePageActions>
          <button seButton type="button" (click)="print()">Print</button>
          @if (payable(inv)) {
            <button
              seButton
              variant="primary"
              type="button"
              [loading]="paying()"
              (click)="payNow(inv)"
            >
              Pay now
            </button>
          }
        </ng-container>
      }

      @if (invoice(); as inv) {
        @if (payable(inv)) {
          <se-banner tone="warning" title="Payable in full before production starts">
            Wholesale is full payment upfront; there are no part-payments. Prefer a transfer? Call
            the finance desk on <a href="tel:+23418887400">+234 1 888 7400</a>.
          </se-banner>
        }
        @if (payError(); as msg) {
          <se-banner tone="danger" title="Payment could not start">{{ msg }}</se-banner>
        }

        <div class="se-detail">
          <div class="se-detail__main">
            <se-card [title]="lineSummary(inv)" flush>
              <se-table
                [caption]="'Items on invoice ' + ref()"
                [columns]="columns"
                [rows]="inv.items"
                [rowId]="rowId"
                hideDensity
              />
            </se-card>
            <se-card title="Manufacturing quality guarantee">
              <p class="invoice-note">
                Every batch passes factory quality control before dispatch. Defective rejects are
                destroyed and never shipped; garments with minor factory errors are repaired and
                restocked under a recorded reason code.
              </p>
            </se-card>
          </div>
          <aside class="se-detail__aside">
            <se-card title="Totals">
              <dl seKv>
                <div seKvItem [label]="'Merchandise (' + units(inv) + ' units)'" numeric>
                  {{ subtotal(inv) | seMoney: 2 }}
                </div>
                <div seKvItem label="Wholesale tier rate">Applied at order time</div>
                <div
                  seKvItem
                  [label]="paid(inv) ? 'Total settled' : payable(inv) ? 'Total payable' : 'Total'"
                  numeric
                >
                  <strong>{{ inv.totalAmount | seMoney: 2 }}</strong>
                </div>
              </dl>
            </se-card>
            <se-card title="Payments">
              @if (inv.payments.length) {
                <dl seKv>
                  @for (payment of inv.payments; track payment.id) {
                    <div seKvItem [label]="payment.date | seDate: 'datetime'" numeric>
                      {{ payment.amount | seMoney: 2 }} via {{ method(payment.method) }}
                    </div>
                  }
                </dl>
              } @else {
                <p class="invoice-note">No payment recorded yet.</p>
              }
            </se-card>
            <se-card title="Parties">
              <dl seKv>
                <div seKvItem label="Issuer">Seentair Limited, Aba, Nigeria</div>
                <div seKvItem label="Finance desk">
                  <a href="tel:+23418887400">+234 1 888 7400</a>
                </div>
                <div seKvItem label="Billed to">{{ buyer()?.name ?? '—' }}</div>
                <div seKvItem label="Account email">{{ buyer()?.email ?? '—' }}</div>
                <div seKvItem label="Order">{{ ref() }}</div>
                <div seKvItem label="Channel">Wholesale portal</div>
              </dl>
            </se-card>
          </aside>
        </div>
      } @else if (failed()) {
        <se-banner
          tone="danger"
          title="The invoice could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          Check your connection and try again.
        </se-banner>
      } @else if (missing()) {
        <se-empty-state
          heading="Invoice not found"
          text="This order is not on your account."
          actionLabel="Back to orders"
          (action)="router.navigate(['/orders'])"
        />
      } @else {
        <div aria-busy="true"><se-skeleton shape="detail" /></div>
      }
    </se-page>
  `,
  styles: [
    `
      .invoice-note {
        margin: 0;
        color: var(--se-color-text-muted);
      }
      /* The printed invoice is the page body alone: no shell chrome, no
         buttons, no banners. Unencapsulated so the rule reaches the shell. */
      @media print {
        .se-shell__sidebar,
        .se-shell__topbar,
        .se-shell__scrim,
        .se-page__actions,
        se-banner {
          display: none !important;
        }
      }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
})
export class InvoiceDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(SeConfirmService);
  private readonly currency = inject(SeCurrencyService);
  readonly router = inject(Router);

  readonly invoice = signal<Invoice | null>(null);
  readonly buyer = signal<{ name: string; email: string } | null>(null);
  readonly missing = signal(false);
  readonly failed = signal(false);
  /** True while the Paystack handoff is in flight, so the button cannot double-fire. */
  readonly paying = signal(false);
  readonly payError = signal<string | null>(null);

  readonly units = units;
  readonly paid = isPaid;
  /** Why an unpaid invoice has no Pay button. */
  closedNote(inv: Invoice): string {
    if (isPaid(inv) || !isClosed(inv)) return '';
    return `. This order is ${inv.status.replaceAll('_', ' ')}, so nothing is payable.`;
  }
  /** Only an open, unpaid order can be paid: a cancelled or returned one never. */
  readonly payable = (inv: Invoice): boolean => !isPaid(inv) && !isClosed(inv);
  readonly ref = computed(() => orderRef(this.invoice()?.orderId ?? this.id));
  readonly crumbs = computed(() => [{ label: 'Orders', link: '/orders' }, { label: this.ref() }]);

  readonly columns: SeColumn<Line>[] = [
    { key: 'sku', header: 'Item / SKU' },
    { key: 'quantity', header: 'Qty', numeric: true },
    {
      key: 'unitPrice',
      header: 'Unit price',
      numeric: true,
      format: (v) => this.currency.format(v as number, 2),
    },
    {
      key: 'lineTotal',
      header: 'Line total',
      numeric: true,
      format: (v) => this.currency.format(v as number, 2),
    },
  ];
  readonly rowId = (row: Line): string => row.sku;

  private id = '';

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
    this.api.me().subscribe({ next: (m) => this.buyer.set(m), error: () => undefined });
  }

  load(): void {
    this.failed.set(false);
    this.missing.set(false);
    this.api.invoices().subscribe({
      next: (res) => {
        const inv = res.data.find((i) => i.orderId === this.id) ?? null;
        this.invoice.set(inv);
        this.missing.set(!inv);
      },
      error: () => this.failed.set(true),
    });
  }

  lineSummary(inv: Invoice): string {
    const n = inv.items.length;
    return `${n} ${n === 1 ? 'line' : 'lines'}, ${units(inv)} units`;
  }

  method(raw: string): string {
    return raw.replaceAll('_', ' ');
  }

  subtotal(inv: Invoice): number {
    return inv.items.reduce((n, i) => n + i.lineTotal, 0);
  }

  /**
   * Hands the invoice to Paystack and leaves the app, after the buyer has
   * confirmed the amount. The amount is the invoice total, never an editable
   * field: wholesale is full payment upfront.
   */
  async payNow(inv: Invoice): Promise<void> {
    if (this.paying() || !this.payable(inv)) return;
    const amount = this.currency.format(inv.totalAmount, 2);
    const ok = await this.confirm.ask({
      title: `Pay ${amount} for order ${orderRef(inv.orderId)}?`,
      consequence: `You will be taken to Paystack to settle ${amount} in full. Wholesale orders have no part-payments; production starts once payment clears.`,
      confirmLabel: `Pay ${amount}`,
    });
    if (!ok) return;
    this.paying.set(true);
    this.payError.set(null);
    this.api.payWithPaystack(inv.orderId, inv.totalAmount).subscribe({
      next: (res) => {
        // Never navigate to an empty URL: a blank authorizationUrl would
        // reload the invoice in place and look like a silent failure.
        if (!res?.authorizationUrl) {
          this.paying.set(false);
          this.payError.set('Paystack returned no checkout URL. Nothing has been charged.');
          return;
        }
        window.location.href = res.authorizationUrl;
      },
      error: (err) => {
        this.paying.set(false);
        this.payError.set(
          err?.error?.message ??
            'Could not reach Paystack. Nothing has been charged. Try again, or call the finance desk.',
        );
      },
    });
  }

  print(): void {
    window.print();
  }

  /** How and when the invoice was settled, for the meta line. */
  settledLine(inv: Invoice): string {
    const p = inv.payments[0];
    return p ? `Settled ${payMethod(inv)} on ${formatDate(p.date)}` : 'Settled';
  }
}
