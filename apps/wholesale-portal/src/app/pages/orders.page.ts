import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  SeBannerComponent,
  SeCurrencyService,
  SeFilter,
  SeFilterValue,
  SeMoneyPipe,
  SeStatusComponent,
  SeToastService,
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
    DatePipe,
    FormsModule,
    SeBannerComponent,
    SeMoneyPipe,
    SeStatusComponent,
  ],
  template: `
    <div class="w6">
      <header class="w6-head">
        <div>
          <h1>Orders & Invoices</h1>
          <span class="muted small">Factory Batches & Commercial Invoices</span>
        </div>
        <button type="button" class="icon-btn" [disabled]="invoices().length === 0" (click)="exportCsv()" aria-label="Export CSV">
          <span class="material-symbols-outlined">download</span>
        </button>
      </header>

      <div class="chips">
        <button type="button" class="chip" [class.on]="!filterValue()['payment'] && !filterValue()['status']" (click)="filterValue.set({})">All ({{ invoices().length }})</button>
        <button type="button" class="chip warn" [class.on]="filterValue()['payment']==='unpaid'" (click)="filterValue.set({payment:'unpaid'})"><span class="dot"></span>Awaiting Payment ({{ summary().awaitingPayment }})</button>
        <button type="button" class="chip" [class.on]="filterValue()['status']==='open'" (click)="filterValue.set({status:'open'})">Open</button>
        <button type="button" class="chip" [class.on]="filterValue()['status']==='closed'" (click)="filterValue.set({status:'closed'})">Closed</button>
      </div>

      <label class="search cardish">
        <span class="material-symbols-outlined">search</span>
        <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search by order ref or SKU" />
      </label>

      @if (summary().awaitingPayment > 0) {
        <se-banner tone="warning" [title]="paymentHeadline()" actionLabel="Pay oldest" (action)="openInvoice(oldestUnpaid()!)">
          Wholesale is full payment upfront; nothing enters production until it clears.
        </se-banner>
      }

      @if (loading()) {
        <div class="card muted small">Loading orders…</div>
      } @else if (error()) {
        <se-banner tone="danger" title="Orders could not be loaded" actionLabel="Try again" (action)="load()">{{ error() }}</se-banner>
      } @else if (filtered().length === 0) {
        <div class="card empty">
          <strong>{{ invoices().length === 0 ? 'No orders yet' : 'No orders match' }}</strong>
          <p class="muted small">{{ invoices().length === 0 ? 'Your first wholesale batch will appear here once it is placed.' : 'Clear the search or filters to see every order.' }}</p>
          <button type="button" class="btn" (click)="onEmptyAction()">{{ invoices().length === 0 ? 'Browse catalogue' : 'Clear filters' }}</button>
        </div>
      } @else {
        <div class="list">
          @for (inv of filtered(); track inv.orderId) {
            <article class="card order" [class.due]="!isPaid(inv) && !isClosed(inv)">
              @if (!isPaid(inv) && !isClosed(inv)) { <div class="bar"></div> }
              <div class="row1">
                <div><span class="mono ref">{{ orderRef(inv.orderId) }}</span> <span class="muted small">{{ inv.createdAt | date:'d MMM y' }}</span></div>
                <se-status kind="order" [value]="inv.status" />
              </div>
              <div class="row2"><span class="muted small">{{ units(inv) }} units</span><span class="mono amt">{{ inv.totalAmount | seMoney: 2 }}</span></div>
              <div class="row3">
                <se-status kind="payment" [value]="inv.paymentStatus" />
                <div class="acts">
                  <button type="button" class="linkish" (click)="openInvoice(inv)">Invoice <span class="material-symbols-outlined">chevron_right</span></button>
                  @if (!isPaid(inv) && !isClosed(inv)) { <button type="button" class="btn primary" (click)="openInvoice(inv)">Pay now</button> }
                  <button type="button" class="btn ghost" (click)="track(inv)">Track</button>
                  <button type="button" class="btn ghost" (click)="reorder(inv)">Reorder</button>
                </div>
              </div>
            </article>
          }
        </div>
      }
    </div>
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
  readonly isPaid = isPaid;
  readonly isClosed = isClosed;
  readonly orderRef = orderRef;
  readonly units = units;

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
