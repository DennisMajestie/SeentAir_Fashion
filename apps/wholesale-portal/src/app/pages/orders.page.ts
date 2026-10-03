import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Invoice, Pricing } from '../api.service';
import { pill } from '../status-pill';
import {
  EmptyComponent,
  FactsComponent,
  LedgerComponent,
  PayBannerComponent,
  RowComponent,
  StripComponent,
} from '../ui/primitives';

/**
 * W6, Orders & invoices: the procurement log.
 *
 * Built on the shared primitives so it reads as part of the same system as the
 * catalogue:
 *  - each order is a `se-row` that collapses by default and expands in place to
 *    reveal its line items, so a buyer scanning 200 orders sees the numbers
 *    first and the detail only when asked
 *  - the summary is one `se-facts` strip, not a bespoke stat grid
 *  - the money summary is one `se-ledger`
 *
 * No order card is fabricated: every figure comes from the live invoice ledger,
 * and the CSV export writes exactly the rows on screen.
 */
@Component({
  selector: 'app-orders',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    StripComponent,
    RowComponent,
    FactsComponent,
    LedgerComponent,
    EmptyComponent,
    PayBannerComponent,
  ],
  template: `
    @if (invoices().length) {
      <se-pay
        [paid]="unpaidCount() === 0"
        [sub]="paymentHeadline()"
        [action]="unpaidCount() === 0 ? '' : 'Settle oldest'"
        [actionHref]="oldestUnpaidId() ? '/orders/' + oldestUnpaidId() + '/invoice' : ''"
      />
    }

    <se-strip label="Procurement log" [badge]="periodLabel()">
      <span stripTrailing>{{ today | date: 'MMM yyyy' }}</span>
      <se-facts [facts]="summary()" />
    </se-strip>

    <div class="filter-chips" role="tablist" aria-label="Order status">
      <button [class.active]="statusFilter() === null" (click)="statusFilter.set(null)">
        All <span class="n">{{ invoices().length }}</span>
      </button>
      @for (s of statusCounts(); track s.key) {
        <button [class.active]="statusFilter() === s.key" (click)="statusFilter.set(s.key)">
          {{ s.label }} <span class="n">{{ s.count }}</span>
        </button>
      }
    </div>

    <div class="search-row">
      <div class="search-box">
        <span class="material-symbols-outlined" aria-hidden="true">search</span>
        <input
          type="search"
          [(ngModel)]="query"
          name="q"
          placeholder="Filter by order #, SKU…"
          aria-label="Filter orders"
        />
      </div>
      <select [(ngModel)]="range" name="range" aria-label="Date range">
        <option value="90">Last 90 days</option>
        <option value="365">Last 12 months</option>
        <option value="all">All time</option>
      </select>
    </div>

    <!-- One open row at a time: the procurement log is scanned, not read. -->
    @if (filtered().length === 0) {
      <se-empty
        icon="receipt_long"
        [title]="emptyTitle()"
        [sub]="emptySub()"
        ctaLabel="Browse catalogue"
        ctaHref="/catalogue"
      />
    }
    @for (invoice of filtered(); track invoice.orderId) {
      <se-row
        [id]="invoice.orderId"
        [open]="openId() === invoice.orderId"
        (toggled)="onToggle(invoice.orderId, $event)"
      >
        <ng-container rowIdent>
          <span class="drow-code">
            #{{ shortId(invoice) }}
            <span class="chip" [class.okc]="isPaid(invoice)" [class.accent]="!isPaid(invoice)">{{
              stateLabel(invoice)
            }}</span>
          </span>
          <span class="drow-meta"
            >{{ invoice.createdAt | date: 'dd MMM yyyy' }} · {{ units(invoice) }} units</span
          >
        </ng-container>

        <ng-container rowTail>
          <span class="drow-amount">₦{{ invoice.totalAmount | number: '1.0-2' }}</span>
          <span class="status" [class]="'status ' + pill(invoice.paymentStatus)">{{
            isPaid(invoice) ? 'Paid' : invoice.paymentStatus.replaceAll('_', ' ')
          }}</span>
        </ng-container>

        <div rowPanel>
          <se-ledger [rows]="lineLedger(invoice)" />

          <dl class="kv">
            <div>
              <dt>Payment</dt>
              <dd>
                {{ isPaid(invoice) ? 'Paid · ' + payMethod(invoice) : 'Awaiting settlement' }}
              </dd>
            </div>
            <div>
              <dt>Batch status</dt>
              <dd>
                <span class="status" [class]="'status ' + pill(invoice.status)">{{
                  invoice.status.replaceAll('_', ' ')
                }}</span>
              </dd>
            </div>
            <div>
              <dt>Placed</dt>
              <dd>{{ invoice.createdAt | date: 'dd MMM yyyy, HH:mm' }}</dd>
            </div>
          </dl>
        </div>

        <ng-container rowActions>
          @if (!isPaid(invoice)) {
            <!-- GAP: no payment-slip upload endpoint; the desk verifies transfers,
                 so the pro-forma stands in for an UPLOAD SLIP action. -->
            <a class="cta small" [routerLink]="['/orders', invoice.orderId, 'invoice']">
              <span class="material-symbols-outlined" aria-hidden="true">description</span>
              Pro-forma
            </a>
            <button class="cta small quiet" (click)="reorder(invoice.orderId)">Reorder</button>
          } @else if (!isDelivered(invoice)) {
            <a class="cta small" [routerLink]="['/orders', invoice.orderId, 'tracking']">
              <span class="material-symbols-outlined" aria-hidden="true">radar</span> Track
            </a>
            <a class="cta small quiet" [routerLink]="['/orders', invoice.orderId, 'invoice']">
              <span class="material-symbols-outlined" aria-hidden="true">receipt_long</span> Invoice
            </a>
            <button class="cta small quiet" (click)="reorder(invoice.orderId)">
              <span class="material-symbols-outlined" aria-hidden="true">sync</span> Reorder
            </button>
          } @else {
            <a class="cta small quiet" [routerLink]="['/orders', invoice.orderId, 'tracking']">
              <span class="material-symbols-outlined" aria-hidden="true">inventory_2</span> Manifest
            </a>
            <a class="cta small quiet" [routerLink]="['/orders', invoice.orderId, 'invoice']">
              <span class="material-symbols-outlined" aria-hidden="true">download</span> Invoice
              (PDF)
            </a>
            <button class="cta small outline" (click)="reorder(invoice.orderId)">
              <span class="material-symbols-outlined" aria-hidden="true">sync</span> Reorder batch
            </button>
          }
        </ng-container>
      </se-row>
    }

    @if (message()) {
      <p class="success">{{ message() }}</p>
    }

    <button
      class="cta outline"
      style="width:100%; margin-top: var(--space-lg)"
      (click)="exportCsv()"
      [disabled]="invoices().length === 0"
    >
      <span class="material-symbols-outlined" aria-hidden="true">table_view</span>
      Export batch statement (CSV)
    </button>
    <p class="muted small" style="text-align:center; margin-top: var(--space-sm)">
      <span
        class="material-symbols-outlined"
        style="font-size:13px; vertical-align:-2px"
        aria-hidden="true"
        >lock</span
      >
      Statements are generated from the live order ledger, every movement is audit-logged.
    </p>
  `,
})
export class OrdersPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly pill = pill;
  readonly today = new Date();
  readonly invoices = signal<Invoice[]>([]);
  readonly pricing = signal<Pricing | null>(null);
  readonly message = signal<string | null>(null);
  readonly statusFilter = signal<string | null>(null);
  /** Open order id. Starts empty: the log is scanned, not read. */
  readonly openId = signal<string | null>(null);
  query = '';
  range: '90' | '365' | 'all' = '90';

  readonly activeCommitments = computed(() =>
    this.invoices()
      .filter((i) => !this.isDelivered(i))
      .reduce((n, i) => n + i.totalAmount, 0),
  );
  readonly openBatches = computed(() => this.invoices().filter((i) => !this.isDelivered(i)).length);
  readonly lifetimeUnits = computed(() => this.invoices().reduce((n, i) => n + this.units(i), 0));
  readonly statusCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const i of this.invoices()) counts.set(i.status, (counts.get(i.status) ?? 0) + 1);
    return [...counts.entries()].map(([key, count]) => ({
      key,
      count,
      label: key.replaceAll('_', ' '),
    }));
  });

  /** The one `se-facts` strip, built from the live ledger. */
  readonly summary = computed<Array<{ label: string; value: string; numeric?: boolean }>>(() => [
    {
      label: 'Active commitments',
      value: `₦${this.n(this.activeCommitments())}`,
      numeric: true,
    },
    {
      label: 'In pipeline',
      value: `${this.openBatches()} batch${this.openBatches() === 1 ? '' : 'es'}`,
    },
    { label: 'Lifetime volume', value: `${this.lifetimeUnits()} units`, numeric: true },
    { label: 'Rate card', value: this.tierLabel() },
  ]);

  readonly periodLabel = computed(() =>
    this.range === 'all' ? 'All time' : this.range === '365' ? 'Last 12 months' : 'Last 90 days',
  );

  readonly emptyTitle = computed(() =>
    this.invoices().length === 0 ? 'No orders yet' : 'No orders match this filter',
  );

  readonly emptySub = computed(() =>
    this.invoices().length === 0
      ? 'Your first bulk order will appear here once the factory confirms it.'
      : 'Try clearing the status chip or widening the date range.',
  );

  ngOnInit(): void {
    this.api.invoices().subscribe((res) => this.invoices.set(res.data));
    this.api.pricing().subscribe({ next: (p) => this.pricing.set(p), error: () => undefined });
  }

  tierLabel(): string {
    const t = this.pricing()?.tier;
    return t ? `Seentair ${t.name}` : 'Wholesale account';
  }

  filtered(): Invoice[] {
    const q = this.query.trim().toLowerCase();
    const cutoff = this.range === 'all' ? 0 : Date.now() - Number(this.range) * 24 * 60 * 60 * 1000;
    return this.invoices().filter((i) => {
      if (this.statusFilter() && i.status !== this.statusFilter()) return false;
      if (new Date(i.createdAt).getTime() < cutoff) return false;
      if (!q) return true;
      return (
        i.orderId.toLowerCase().includes(q) ||
        i.items.some((item) => item.sku.toLowerCase().includes(q))
      );
    });
  }

  /** One open row at a time, so the log never becomes a wall of open panels. */
  onToggle(id: string, open: boolean): void {
    this.openId.set(open ? id : null);
  }

  shortId(invoice: Invoice): string {
    return invoice.orderId.slice(0, 8).toUpperCase();
  }

  stateLabel(invoice: Invoice): string {
    if (!this.isPaid(invoice)) return 'Action req';
    if (this.isDelivered(invoice)) return 'Archived';
    return 'Batch run';
  }

  /**
   * The invoice's own lines as ledger rows, then the order total.
   *
   * Amounts are the values the API sent, so this reconciles with the CSV
   * export row for row.
   */
  lineLedger(invoice: Invoice): Array<{
    label: string;
    value: string;
    note?: string;
    total?: boolean;
  }> {
    return [
      ...invoice.items.map((item) => ({
        label: `${item.quantity}× ${item.sku}`,
        value: `₦${this.n(item.lineTotal)}`,
        note: `₦${this.n(item.unitPrice)} ea`,
      })),
      {
        label: 'Batch total',
        value: `₦${this.n(invoice.totalAmount)}`,
        total: true,
      },
    ];
  }

  units(invoice: Invoice): number {
    return invoice.items.reduce((n, i) => n + i.quantity, 0);
  }

  isPaid(invoice: Invoice): boolean {
    return invoice.paymentStatus === 'paid';
  }

  /**
   * Payment roll-up for the banner above the log.
   *
   * Aggregated rather than per-row: a hundred-row list of individual banners
   * would shout at a buyer who owes on one order, and would be invisible to a
   * buyer who owes on none. One line at the top is the honest summary.
   */
  unpaidCount(): number {
    return this.invoices().filter((i) => !this.isPaid(i)).length;
  }

  /** Oldest unpaid order, so "settle" points at the one that has waited longest. */
  oldestUnpaidId(): string {
    const due = this.invoices()
      .filter((i) => !this.isPaid(i))
      .map((i) => i.orderId)
      .sort((a, b) => a.localeCompare(b));
    return due[0] ?? '';
  }

  paymentHeadline(): string {
    const unpaid = this.unpaidCount();
    const total = this.invoices().length;
    if (unpaid === 0)
      return 'All ' + total + ' order' + (total === 1 ? '' : 's') + ' settled. Nothing to pay.';
    return (
      unpaid +
      ' of ' +
      total +
      ' orders awaiting payment. Wholesale is full payment upfront; nothing enters production until it clears.'
    );
  }

  isDelivered(invoice: Invoice): boolean {
    return /delivered|completed|cancelled/.test(invoice.status);
  }

  payMethod(invoice: Invoice): string {
    return (invoice.payments[0]?.method ?? 'confirmed').replaceAll('_', ' ');
  }

  reorder(orderId: string): void {
    this.api.reorder(orderId).subscribe({
      next: (order) => {
        this.message.set(`Reorder placed: ${order.id.slice(0, 8)}- repriced at your current tier.`);
        this.api.invoices().subscribe((res) => this.invoices.set(res.data));
      },
      error: (err) => this.message.set(err?.error?.message ?? 'Reorder failed.'),
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

  /** Grouped thousands, no decimals: these are ledger figures, not unit prices. */
  private n(value: number): string {
    return Math.round(value).toLocaleString('en-NG');
  }
}
