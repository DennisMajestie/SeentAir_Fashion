import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  SeActivityComponent,
  SeActivityEntry,
  SeBadgeComponent,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeCellDirective,
  SeColumn,
  SeCurrencyService,
  SeKvDirective,
  SeKvItemComponent,
  SeMetricCardComponent,
  SePageComponent,
  SeRowAction,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
  formatDate,
} from '@seentair/ui';
import { ApiService, Invoice, Pricing } from '../api.service';
import {
  PIPELINE,
  isClosed,
  isPaid,
  orderRef,
  pipelineStep,
  summarise,
  units,
} from '../wholesale-format';

/**
 * Wholesale buyer home: what state the account is in, what to do next, and
 * the latest batches. Every figure comes from the API (auth/me,
 * wholesale/pricing, wholesale/invoices, notifications); nothing is invented.
 */
@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    SeActivityComponent,
    SeBadgeComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeCellDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMetricCardComponent,
    SePageComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page [title]="buyerName() ?? 'Wholesale buyer'" [description]="accountLine()">
      <se-badge sePageStatus [tone]="approved() ? 'success' : 'warning'">
        {{ approved() ? 'Verified account' : 'Pending review' }}
      </se-badge>
      <a seButton variant="primary" sePageActions routerLink="/catalogue">Browse catalogue</a>

      @if (summary().awaitingPayment > 0) {
        <se-banner
          tone="warning"
          [title]="paymentHeadline()"
          actionLabel="View invoices"
          (action)="router.navigate(['/orders'])"
        >
          Wholesale is full payment upfront; nothing enters production until it clears.
        </se-banner>
      }

      <div class="se-metric-grid">
        <se-metric-card label="Open orders" [value]="summary().open" [hint]="stageLine()" />
        <se-metric-card
          label="Awaiting payment"
          [value]="summary().awaitingPayment === 0 ? 'Clear' : summary().awaitingPayment"
          [hint]="summary().awaitingPayment === 0 ? 'Nothing to pay' : 'Full payment upfront'"
        />
        <se-metric-card label="In transit" [value]="summary().inTransit" hint="With the courier" />
        <se-metric-card
          label="Last order"
          [value]="lastOrder() ? formatDate(lastOrder()!.createdAt) : 'None yet'"
          [hint]="lastOrder() ? statusLabel(lastOrder()!.status) : ''"
        />
      </div>

      <se-card [title]="summary().status">
        <se-badge seCardActions [tone]="summary().tone">{{ stageLine() }}</se-badge>
        <p class="next">{{ summary().next }}</p>
        <ol
          class="track"
          [attr.aria-label]="'Batch progress: ' + stageLine()"
          role="progressbar"
          aria-valuemin="0"
          [attr.aria-valuemax]="pipeline.length"
          [attr.aria-valuenow]="step() + 1"
        >
          @for (s of pipeline; track s.key; let i = $index) {
            <li class="track__step" [class.track__step--on]="i <= step()">{{ s.label }}</li>
          }
        </ol>
      </se-card>

      <se-card title="Recent orders" flush>
        <a seButton size="sm" seCardActions routerLink="/orders">View all orders</a>
        <se-table
          caption="Recent orders"
          [columns]="columns"
          [rows]="recent()"
          [rowId]="rowId"
          [loading]="loading()"
          [error]="error()"
          (retry)="load()"
          [actions]="actions"
          activatable
          (rowActivate)="openInvoice($event)"
          hideDensity
          emptyHeading="No orders yet"
          emptyText="Your first wholesale batch will appear here."
          emptyActionLabel="Browse catalogue"
          (emptyAction)="router.navigate(['/catalogue'])"
        >
          <ng-template seCell="status" let-row>
            <se-status kind="order" [value]="row.status" />
          </ng-template>
          <ng-template seCell="payment" let-row>
            <se-status kind="payment" [value]="row.paymentStatus" />
          </ng-template>
        </se-table>
      </se-card>

      @if (notices().length > 0) {
        <se-card title="Desk notices">
          <se-activity [entries]="noticeEntries()" />
        </se-card>
      }

      <!-- No account-manager endpoint yet: this is the factory's wholesale
           desk, not a per-buyer rep. -->
      <se-card title="Factory desk">
        <dl seKv>
          <div seKvItem label="Desk">Aba Wholesale Desk</div>
          <div seKvItem label="Phone"><a href="tel:+23418887400">+234 1 888 7400</a></div>
          <div seKvItem label="WhatsApp">Not yet available</div>
        </dl>
      </se-card>
    </se-page>
  `,
  styles: [
    `
      .next {
        margin: 0 0 var(--se-space-4);
      }
      .track {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--se-space-2);
        margin: 0;
        padding: 0;
        list-style: none;
        counter-reset: step;
      }
      .track__step {
        padding-top: var(--se-space-2);
        border-top: 3px solid var(--se-color-border);
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
      .track__step--on {
        border-top-color: var(--se-color-primary);
        color: var(--se-color-text);
      }
    `,
  ],
})
export class HomePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);
  readonly router = inject(Router);

  readonly formatDate = formatDate;
  readonly pipeline = PIPELINE;

  readonly buyerName = signal<string | null>(null);
  readonly pricing = signal<Pricing | null>(null);
  readonly approved = signal(false);
  readonly invoices = signal<Invoice[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notices = signal<Array<{ id: string; type: string; message: string; sentAt: string }>>(
    [],
  );

  readonly summary = computed(() => summarise(this.invoices()));
  readonly step = computed(() => pipelineStep(this.invoices()));
  readonly recent = computed(() => this.invoices().slice(0, 5));
  readonly lastOrder = computed(() => this.invoices()[0] ?? null);

  /** Tier, discount and batch minimum in one line; or where the application stands. */
  readonly accountLine = computed(() => {
    const p = this.pricing();
    if (!p) return 'Your wholesale application is being reviewed. Prices show once it is approved.';
    const parts = [p.tier?.name ?? 'Standard tier'];
    if (p.tier && p.hasDiscount) parts.push(`${p.tier.discountPercent}% off retail`);
    if (p.moq > 0) parts.push(`${p.moq}-unit minimum per batch`);
    return parts.join(' · ');
  });

  readonly noticeEntries = computed<SeActivityEntry[]>(() =>
    this.notices().map((n) => ({
      at: n.sentAt,
      text: n.message,
      actor: n.type.replaceAll('_', ' '),
    })),
  );

  readonly rowId = (i: Invoice) => i.orderId;
  readonly columns: SeColumn<Invoice>[] = [
    { key: 'ref', header: 'Order', value: (i) => orderRef(i.orderId) },
    { key: 'createdAt', header: 'Placed', format: (v) => formatDate(v as string) },
    { key: 'units', header: 'Units', numeric: true, value: (i) => units(i) },
    {
      key: 'totalAmount',
      header: 'Total',
      numeric: true,
      format: (v) => this.currency.format(v as number),
    },
    { key: 'status', header: 'Status' },
    { key: 'payment', header: 'Payment', value: (i) => i.paymentStatus },
  ];
  readonly actions: SeRowAction<Invoice>[] = [
    {
      label: 'Pay now',
      icon: 'bank',
      hidden: (i) => isPaid(i) || isClosed(i),
      run: (i) => this.openInvoice(i),
    },
    { label: 'Reorder batch', icon: 'refresh', run: (i) => this.reorder(i) },
  ];

  ngOnInit(): void {
    this.api.me().subscribe({ next: (m) => this.buyerName.set(m.name), error: () => undefined });
    this.api.pricing().subscribe({
      next: (p) => {
        this.pricing.set(p);
        this.approved.set(true);
      },
      error: () => this.approved.set(false),
    });
    this.api.notifications().subscribe({
      next: (r) => this.notices.set(r.data.slice(0, 3)),
      error: () => undefined,
    });
    this.load();
  }

  load(): void {
    this.api.invoices().subscribe({
      next: (r) => {
        this.invoices.set(r.data);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (this.invoices().length === 0) {
          this.error.set(err?.error?.message ?? 'The server did not respond.');
        }
      },
    });
  }

  /** "Shipped · 2 open orders", or "Nothing in flight". */
  stageLine(): string {
    const step = this.step();
    if (step < 0) return 'Nothing in flight';
    const n = this.summary().open;
    return `${PIPELINE[step].label} · ${n} open ${n === 1 ? 'order' : 'orders'}`;
  }

  statusLabel(status: string): string {
    const words = status.replaceAll('_', ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  paymentHeadline(): string {
    const { awaitingPayment } = this.summary();
    const total = this.invoices().length;
    return `${awaitingPayment} of ${total} ${total === 1 ? 'order' : 'orders'} awaiting payment`;
  }

  openInvoice(invoice: Invoice): void {
    void this.router.navigate(['/orders', invoice.orderId, 'invoice']);
  }

  reorder(invoice: Invoice): void {
    this.api.reorder(invoice.orderId).subscribe({
      next: (order) => {
        this.toast.show(`Reorder ${orderRef(order.id)} placed at your current tier`, {
          action: { label: 'View', run: () => this.openInvoice({ ...invoice, orderId: order.id }) },
        });
        this.load();
      },
      error: (err) =>
        this.toast.show(err?.error?.message ?? 'The reorder could not be placed', {
          tone: 'danger',
          action: { label: 'Try again', run: () => this.reorder(invoice) },
        }),
    });
  }
}
