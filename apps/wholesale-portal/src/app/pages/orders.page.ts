import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeCurrencyService,
  SeFilter,
  SeFilterBarComponent,
  SeFilterValue,
  SeIconComponent,
  SePageComponent,
  SeRowAction,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
  formatDate,
} from '@seentair/ui';
import { ApiService, Invoice } from '../api.service';
import { isClosed, isPaid, orderRef, summarise, units } from '../wholesale-format';

/**
 * Orders and invoices: the full procurement log. Home shows the latest five
 * of the same list with the same helpers, so the two never disagree. Every
 * figure comes from the live invoice ledger; the CSV export writes exactly
 * the rows on screen.
 */
@Component({
  selector: 'app-orders',
  imports: [
    SeBannerComponent,
    SeButtonDirective,
    SeCellDirective,
    SeFilterBarComponent,
    SeIconComponent,
    SePageComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Orders & invoices" [description]="summaryLine()">
      <button
        seButton
        sePageActions
        type="button"
        [disabled]="invoices().length === 0"
        (click)="exportCsv()"
      >
        <se-icon name="download" />
        Export CSV
      </button>

      @if (summary().awaitingPayment > 0) {
        <se-banner
          tone="warning"
          [title]="paymentHeadline()"
          actionLabel="Pay oldest"
          (action)="openInvoice(oldestUnpaid()!)"
        >
          Wholesale is full payment upfront; nothing enters production until it clears.
        </se-banner>
      }

      <se-table
        caption="Orders"
        [columns]="columns"
        [rows]="filtered()"
        [rowId]="rowId"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [actions]="actions"
        activatable
        (rowActivate)="openInvoice($event)"
        [pageSize]="25"
        [emptyHeading]="invoices().length === 0 ? 'No orders yet' : 'No orders match'"
        [emptyText]="
          invoices().length === 0
            ? 'Your first wholesale batch will appear here once it is placed.'
            : 'Clear the search or filters to see every order.'
        "
        [emptyActionLabel]="invoices().length === 0 ? 'Browse catalogue' : 'Clear filters'"
        (emptyAction)="onEmptyAction()"
      >
        <se-filter-bar
          seTableToolbar
          searchLabel="Search by order ref or SKU"
          searchPlaceholder="#A1B2C3D4 or SKU"
          [(query)]="query"
          [filters]="filters"
          [(value)]="filterValue"
          [summary]="countLine()"
        />
        <ng-template seCell="status" let-row>
          <se-status kind="order" [value]="row.status" />
        </ng-template>
        <ng-template seCell="payment" let-row>
          <se-status kind="payment" [value]="row.paymentStatus" />
        </ng-template>
      </se-table>
    </se-page>
  `,
})
export class OrdersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);
  readonly router = inject(Router);

  readonly invoices = signal<Invoice[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly query = signal('');
  readonly filterValue = signal<SeFilterValue>({});

  readonly filters: SeFilter[] = [
    {
      key: 'payment',
      label: 'Payment',
      anyLabel: 'Any payment',
      options: [
        { value: 'paid', label: 'Paid' },
        { value: 'unpaid', label: 'Unpaid' },
      ],
    },
    {
      key: 'status',
      label: 'Status',
      anyLabel: 'Any status',
      options: [
        { value: 'open', label: 'Open' },
        { value: 'closed', label: 'Closed' },
      ],
    },
  ];

  readonly summary = computed(() => summarise(this.invoices()));
  readonly oldestUnpaid = computed<Invoice | null>(() => {
    const due = this.invoices().filter((i) => !isPaid(i) && !isClosed(i));
    due.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return due[0] ?? null;
  });

  readonly filtered = computed<Invoice[]>(() => {
    const q = this.query().trim().toLowerCase().replace(/^#/, '');
    const { payment, status } = this.filterValue();
    return this.invoices().filter((i) => {
      if (payment === 'paid' && !isPaid(i)) return false;
      if (payment === 'unpaid' && isPaid(i)) return false;
      if (status === 'open' && isClosed(i)) return false;
      if (status === 'closed' && !isClosed(i)) return false;
      if (!q) return true;
      return (
        i.orderId.toLowerCase().includes(q) ||
        i.items.some((item) => item.sku.toLowerCase().includes(q))
      );
    });
  });

  readonly rowId = (i: Invoice) => i.orderId;
  readonly columns: SeColumn<Invoice>[] = [
    { key: 'ref', header: 'Order', value: (i) => orderRef(i.orderId) },
    {
      key: 'createdAt',
      header: 'Placed',
      sortable: true,
      format: (v) => formatDate(v as string),
    },
    { key: 'units', header: 'Units', numeric: true, value: (i) => units(i) },
    {
      key: 'totalAmount',
      header: 'Total',
      numeric: true,
      sortable: true,
      format: (v) => this.currency.format(v as number),
    },
    { key: 'status', header: 'Status' },
    { key: 'payment', header: 'Payment', value: (i) => i.paymentStatus },
  ];
  readonly actions: SeRowAction<Invoice>[] = [
    { label: 'View invoice', icon: 'receipt', run: (i) => this.openInvoice(i) },
    { label: 'Track', icon: 'truck', run: (i) => this.track(i) },
    {
      label: 'Pay now',
      icon: 'bank',
      hidden: (i) => isPaid(i) || isClosed(i),
      run: (i) => this.openInvoice(i),
    },
    { label: 'Reorder batch', icon: 'refresh', run: (i) => this.reorder(i) },
  ];

  ngOnInit(): void {
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

  /** "3 orders · Awaiting payment · Settle the outstanding total…" */
  summaryLine(): string {
    const n = this.invoices().length;
    if (this.loading() || n === 0) return 'Every wholesale batch, its invoice and its tracking.';
    const s = this.summary();
    return `${n} ${n === 1 ? 'order' : 'orders'} · ${s.open} open · ${s.inTransit} in transit · ${s.status}`;
  }

  countLine(): string {
    const shown = this.filtered().length;
    const all = this.invoices().length;
    return shown === all ? `${all} ${all === 1 ? 'order' : 'orders'}` : `${shown} of ${all} orders`;
  }

  paymentHeadline(): string {
    const { awaitingPayment } = this.summary();
    const total = this.invoices().length;
    return `${awaitingPayment} of ${total} ${total === 1 ? 'order' : 'orders'} awaiting payment`;
  }

  /** A new account goes to the catalogue; a filtered-out log clears its filters. */
  onEmptyAction(): void {
    if (this.invoices().length === 0) void this.router.navigate(['/catalogue']);
    else this.clearFilters();
  }

  clearFilters(): void {
    this.query.set('');
    this.filterValue.set({});
  }

  openInvoice(invoice: Invoice): void {
    void this.router.navigate(['/orders', invoice.orderId, 'invoice']);
  }

  track(invoice: Invoice): void {
    void this.router.navigate(['/orders', invoice.orderId, 'tracking']);
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

  /** Real export: the visible ledger, one row per invoice line. */
  exportCsv(): void {
    const rows = [
      [
        'order_id',
        'created_at',
        'status',
        'payment_status',
        'sku',
        'quantity',
        'unit_price',
        'line_total',
        'order_total',
      ],
      ...this.invoices().flatMap((i) =>
        i.items.map((item) => [
          i.orderId,
          i.createdAt,
          i.status,
          i.paymentStatus,
          item.sku,
          String(item.quantity),
          String(item.unitPrice),
          String(item.lineTotal),
          String(i.totalAmount),
        ]),
      ),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `seentair-batch-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
