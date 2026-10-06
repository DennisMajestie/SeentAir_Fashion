import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  SE_STATUS,
  SeBannerComponent,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDatePipe,
  SeFilter,
  SeFilterBarComponent,
  SeMetricCardComponent,
  SePageComponent,
  SeRowAction,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AdminOrder, ApiService } from '../api.service';
import { downloadCsv } from '../csv.util';
import { urlFilters } from '../url-filters';
import {
  CHANNEL_OPTIONS,
  channelLabel,
  customerName,
  nextStep,
  orderRef,
  unitCount,
} from './order-format';

/** How often the list re-reads itself so staff never act on a stale queue. */
const ORDERS_POLL_MS = 20_000;
/** The API returns the newest orders first; this many are loaded. */
const LOAD_LIMIT = 100;

/**
 * Orders, across every channel (retail web, wholesale, in-store, custom): one
 * shared order resource, per architectural principle #1.
 *
 * The list finds an order; the order's own page (orders/:id) is where it is
 * worked on. The one action offered here is the next fulfilment step, because
 * moving a run of orders forward is the routine job on this screen.
 */
@Component({
  selector: 'app-orders',
  imports: [
    SeBannerComponent,
    SeButtonDirective,
    SeCellDirective,
    SeDatePipe,
    SeFilterBarComponent,
    SeMetricCardComponent,
    SePageComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Orders">
      <button seButton sePageActions type="button" (click)="print()">Print list</button>
      <button seButton sePageActions type="button" (click)="exportCsv()">Export CSV</button>

      <div class="se-metric-grid">
        <se-metric-card label="Orders" [value]="total()" [hint]="loadedHint()" />
        <se-metric-card label="Wholesale" [value]="countBy('wholesale')" [hint]="ofLoaded()" />
        <se-metric-card
          label="Retail web"
          [value]="countBy('retail')"
          [hint]="countBy('in_store') + ' in-store, ' + countBy('custom') + ' custom'"
        />
        <se-metric-card
          label="Awaiting payment"
          [value]="unpaidCount()"
          hint="An unpaid order cannot move forward"
        />
      </div>

      @if (attention().length > 0 && filterValue()['status'] !== 'stock_exception') {
        <se-banner
          tone="warning"
          [title]="
            attention().length === 1
              ? '1 paid order is short on stock'
              : attention().length + ' paid orders are short on stock'
          "
          actionLabel="Show them"
          (action)="showStockExceptions()"
        >
          The money is in, but there was not enough stock when they were paid. Each one needs stock
          allocated from a finished batch, or a refund.
        </se-banner>
      }

      <se-table
        caption="Orders"
        [columns]="columns"
        [rows]="rows()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [pageSize]="25"
        [actions]="actions"
        activatable
        (rowActivate)="open($event)"
        [emptyHeading]="filtering() ? 'No orders match these filters' : 'No orders yet'"
        [emptyText]="
          filtering()
            ? 'Remove a filter, or clear them all to see every order.'
            : 'Orders appear here as soon as a customer checks out.'
        "
        [emptyActionLabel]="filtering() ? 'Clear all filters' : ''"
        (emptyAction)="clearFilters()"
      >
        <se-filter-bar
          seTableToolbar
          searchLabel="Search orders"
          searchPlaceholder="Order ref or customer"
          [(query)]="query"
          [filters]="filters"
          [(value)]="filterValue"
          [summary]="summary()"
        />
        <ng-template seCell="placed" let-row>{{ row.createdAt | seDate: 'datetime' }}</ng-template>
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
export class OrdersPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);

  readonly orders = signal<AdminOrder[]>([]);
  /** Paid orders held on a stock exception, loaded on their own so none drop off the latest-100 list. */
  readonly attention = signal<AdminOrder[]>([]);
  readonly total = signal(0);
  /** True only until the first answer arrives; a refresh keeps the rows on screen. */
  readonly loading = signal(true);
  readonly error = signal('');

  // ---- filters: held here, mirrored in the URL so a filtered list can be shared ----
  private readonly urlState = urlFilters(['channel', 'payment', 'status']);
  readonly query = this.urlState.query;
  readonly filterValue = this.urlState.value;
  readonly filters: SeFilter[] = [
    { key: 'channel', label: 'Channel', options: CHANNEL_OPTIONS },
    {
      key: 'payment',
      label: 'Payment',
      options: ['paid', 'unpaid', 'refunded'].map((value) => ({
        value,
        label: SE_STATUS.payment[value].label,
      })),
    },
    {
      key: 'status',
      label: 'Status',
      options: Object.entries(SE_STATUS.order).map(([value, meaning]) => ({
        value,
        label: meaning.label,
      })),
    },
  ];
  readonly filtering = computed(
    () => !!this.query().trim() || Object.keys(this.filterValue()).length > 0,
  );

  /** What the table shows: the loaded orders, narrowed by the search and filters. */
  readonly rows = computed(() => {
    const filter = this.filterValue();
    const q = this.query().trim().toLowerCase().replace(/^#/, '');
    // Stock exceptions are merged in, so filtering to them finds every one
    // even when it is older than the latest hundred.
    const known = new Set(this.orders().map((o) => o.id));
    const all = [...this.orders(), ...this.attention().filter((o) => !known.has(o.id))];
    return all.filter((o) => {
      if (filter['channel'] && o.channel !== filter['channel']) return false;
      if (filter['payment'] && o.paymentStatus !== filter['payment']) return false;
      if (filter['status'] && o.status !== filter['status']) return false;
      if (!q) return true;
      return o.id.toLowerCase().includes(q) || customerName(o).toLowerCase().includes(q);
    });
  });
  readonly summary = computed(() => {
    const shown = this.rows().length;
    const noun = shown === 1 ? 'order' : 'orders';
    const loaded = this.orders().length;
    // Be honest that the list is the newest slice when there are more.
    return this.total() > loaded && !this.filtering()
      ? `Latest ${loaded} of ${this.total()} orders`
      : `${shown} ${noun}`;
  });

  readonly columns: SeColumn<AdminOrder>[] = [
    { key: 'ref', header: 'Order', value: (o) => orderRef(o.id) },
    { key: 'customer', header: 'Customer', sortable: true, value: (o) => customerName(o) },
    { key: 'channel', header: 'Channel', sortable: true, value: (o) => channelLabel(o.channel) },
    { key: 'placed', header: 'Placed', sortable: true, value: (o) => o.createdAt },
    { key: 'status', header: 'Status', sortable: true, value: (o) => o.status },
    { key: 'payment', header: 'Payment', value: (o) => o.paymentStatus },
    { key: 'items', header: 'Items', numeric: true, sortable: true, value: (o) => unitCount(o) },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      sortable: true,
      value: (o) => Number(o.totalAmount) || 0,
      format: (v) => this.currency.format(v as number),
    },
  ];

  /** The next fulfilment step, whichever one applies to the row. */
  readonly actions: SeRowAction<AdminOrder>[] = ['processing', 'shipped', 'delivered'].map(
    (status) => ({
      label: `Mark as ${status}`,
      hidden: (o) => nextStep(o)?.status !== status,
      run: (o) => void this.advance(o),
    }),
  );

  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private lastChannel = this.filterValue()['channel'] ?? '';

  constructor() {
    // The API returns the newest hundred FOR a channel, so changing the channel
    // filter re-reads from the server rather than narrowing what is loaded.
    effect(() => {
      const channel = this.filterValue()['channel'] ?? '';
      untracked(() => {
        if (channel !== this.lastChannel) {
          this.lastChannel = channel;
          this.load();
        }
      });
    });
  }

  ngOnInit(): void {
    this.load();
    this.pollTimer = setInterval(() => this.poll(), ORDERS_POLL_MS);
  }

  ngOnDestroy(): void {
    clearInterval(this.pollTimer);
  }

  /** Keeps the list current without a reload. Skipped while the tab is hidden. */
  private poll(): void {
    if (typeof document !== 'undefined' && document.hidden) return;
    this.load();
  }

  load(): void {
    this.api.orders(this.lastChannel || undefined, LOAD_LIMIT).subscribe({
      next: (res) => {
        this.orders.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        // A failed refresh must not wipe a list that is already on screen.
        if (this.orders().length === 0) {
          this.error.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
    this.api.orders(undefined, 50, 'stock_exception').subscribe({
      next: (res) => this.attention.set(res.data),
      error: () => undefined,
    });
  }

  // ---- metrics ----
  readonly unpaidCount = computed(
    () =>
      this.orders().filter((o) => o.paymentStatus === 'unpaid' && o.status !== 'cancelled').length,
  );
  readonly loadedHint = computed(() => {
    const value = this.orders().reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    return `${this.currency.format(value)} across the latest ${this.orders().length}`;
  });
  readonly ofLoaded = computed(() => `of the latest ${this.orders().length}`);
  countBy(channel: string): number {
    return this.orders().filter((o) => o.channel === channel).length;
  }

  // ---- actions ----
  open(order: AdminOrder): void {
    void this.router.navigate(['/orders', order.id]);
  }

  async advance(order: AdminOrder): Promise<void> {
    const step = nextStep(order);
    if (!step) return;
    const ok = await this.confirm.ask({
      title: `${step.label.replace('Mark as', 'Mark order ' + orderRef(order.id) + ' as')}?`,
      consequence: `${step.consequence} An order cannot be moved back to an earlier status.`,
      confirmLabel: step.label,
    });
    if (!ok) return;
    this.api.advanceOrder(order.id, step.status).subscribe({
      next: () => {
        this.toast.show(`Order ${orderRef(order.id)} marked as ${step.status}`);
        this.load();
      },
      error: (err) =>
        this.toast.show(err?.error?.message ?? `Order ${orderRef(order.id)} could not be updated`, {
          tone: 'danger',
          action: { label: 'Try again', run: () => void this.advance(order) },
        }),
    });
  }

  showStockExceptions(): void {
    this.query.set('');
    this.filterValue.set({ status: 'stock_exception' });
  }

  clearFilters(): void {
    this.query.set('');
    this.filterValue.set({});
  }

  print(): void {
    window.print();
  }

  exportCsv(): void {
    const rows = this.rows().map((o) => ({
      Order: orderRef(o.id),
      OrderID: o.id,
      Channel: channelLabel(o.channel),
      Status: o.status,
      Payment: o.paymentStatus,
      Customer: customerName(o),
      Items: unitCount(o),
      Value: o.totalAmount,
      Placed: o.createdAt,
    }));
    const channel = this.filterValue()['channel'] || 'all';
    downloadCsv(`orders-${channel}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }
}
