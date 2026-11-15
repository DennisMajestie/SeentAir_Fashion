import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SeFilter, SeFilterValue, SeMoneyPipe, SeToastService } from '@seentair/ui';
import { ApiService, Invoice } from '../api.service';
import { pill } from '../status-pill';
import { WholesaleTabBar } from '../tab-bar';
import { inTransit, isClosed, isPaid, orderRef, payMethod, summarise, units } from '../wholesale-format';

/**
 * W6 Orders & Invoices, carried verbatim from the Stitch screen: the full
 * procurement log. Home shows the latest five of the same list with the same
 * helpers, so the two never disagree. Every figure comes from the live
 * invoice ledger; the CSV export writes exactly the rows on screen.
 */
@Component({
  selector: 'app-orders',
  imports: [DatePipe, FormsModule, SeMoneyPipe, WholesaleTabBar],
  template: `
    <div class="stitch">
      <div class="bg-canvas text-light-on-surface min-h-screen pb-24 antialiased selection:bg-accent/20">
        <header class="px-4 pt-4 pb-3 border-b border-border/70 bg-canvas/90 backdrop-blur-md sticky top-0 z-30">
          <div class="flex items-center justify-between mb-3">
            <div class="min-w-0">
              <h1 class="text-[20px] font-bold text-light-primary tracking-tight">Orders & Invoices</h1>
              <span class="text-[11px] text-light-secondary font-medium block truncate summary-line">{{ summaryLine() }}</span>
            </div>
            <button type="button" class="export-btn w-9 h-9 rounded-full bg-light-surface border border-border flex items-center justify-center text-light-primary disabled:opacity-50" aria-label="Export CSV" [disabled]="invoices().length === 0" (click)="exportCsv()">
              <span class="material-symbols-outlined text-[18px]">download</span>
            </button>
          </div>

          <!-- Filter Tabs (Pill style) -->
          <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[12px]">
            <button type="button" class="px-3.5 py-1.5 rounded-full whitespace-nowrap" [class]="filterValue()['payment'] || filterValue()['status'] ? 'bg-light-surface border border-border text-light-secondary' : 'bg-light-primary text-light-on-primary font-semibold'" (click)="filterValue.set({})">
              All ({{ invoices().length }})
            </button>
            <button type="button" class="px-3.5 py-1.5 rounded-full bg-light-surface border border-border whitespace-nowrap flex items-center gap-1" [class]="filterValue()['payment']==='unpaid' ? 'bg-light-surface border border-warning/40 text-warning font-semibold' : 'border-border text-light-secondary'" (click)="filterValue.set({ payment: 'unpaid' })">
              <span class="w-1.5 h-1.5 rounded-full bg-warning"></span>
              Awaiting Payment ({{ summary().awaitingPayment }})
            </button>
            <button type="button" class="px-3.5 py-1.5 rounded-full whitespace-nowrap" [class]="filterValue()['status']==='open' ? 'bg-light-primary text-light-on-primary font-semibold' : 'bg-light-surface border border-border text-light-secondary'" (click)="filterValue.set({ status: 'open' })">
              Open
            </button>
            <button type="button" class="px-3.5 py-1.5 rounded-full whitespace-nowrap" [class]="filterValue()['status']==='closed' ? 'bg-light-primary text-light-on-primary font-semibold' : 'bg-light-surface border border-border text-light-secondary'" (click)="filterValue.set({ status: 'closed' })">
              Closed
            </button>
          </div>

          <div class="relative flex items-center pt-2.5">
            <span class="absolute left-3 text-light-secondary material-symbols-outlined text-[18px]">search</span>
            <input
              type="search"
              placeholder="Search by order ref or SKU"
              class="w-full pl-9 pr-3 py-2 rounded-full bg-light-surface border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent"
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
            />
          </div>
        </header>

        <main class="px-4 py-4 flex flex-col gap-3 max-w-[390px] mx-auto w-full">
          @if (summary().awaitingPayment > 0 && !loading()) {
            <button type="button" class="pay-banner p-3.5 rounded-xl bg-[#fff7eb] border border-warning/30 flex items-center justify-between active:scale-[0.99] transition-all text-left w-full" (click)="openInvoice(oldestUnpaid()!)">
              <div class="flex items-center gap-2.5">
                <span class="w-8 h-8 rounded-full bg-warning/20 text-warning flex items-center justify-center flex-shrink-0">
                  <span class="material-symbols-outlined text-[18px]">receipt_long</span>
                </span>
                <div>
                  <h2 class="text-[13px] font-bold text-warning">{{ paymentHeadline() }}</h2>
                  <span class="text-[11px] text-light-secondary">Wholesale is full payment upfront; nothing enters production until it clears.</span>
                </div>
              </div>
              <span class="text-[12px] font-bold text-warning flex items-center gap-0.5 flex-shrink-0">
                Pay oldest
                <span class="material-symbols-outlined text-[16px]">chevron_right</span>
              </span>
            </button>
          }

          @if (!loading() && !error() && invoices().length > 0) {
            <p class="count-line text-[11px] text-light-secondary px-1">{{ countLine() }}</p>
          }

          @if (loading()) {
            <div aria-busy="true">
              <span class="text-[11px] font-mono text-light-secondary uppercase tracking-wider block mb-2">Loading orders…</span>
              <div class="bg-light-surface/60 rounded-xl p-3.5 border border-dashed border-border flex gap-3.5 animate-pulse">
                <div class="w-24 h-16 rounded-lg bg-canvas-tint/80 flex-shrink-0"></div>
                <div class="flex-1 flex flex-col justify-between py-1">
                  <div class="space-y-2">
                    <div class="h-3 w-1/3 bg-canvas-tint rounded"></div>
                    <div class="h-4 w-4/5 bg-canvas-tint rounded"></div>
                  </div>
                  <div class="h-5 w-24 bg-canvas-tint rounded-full"></div>
                </div>
              </div>
            </div>
          } @else if (error()) {
            <div class="load-error p-3.5 rounded-xl bg-light-surface border border-danger/30 flex items-center justify-between gap-2">
              <div>
                <h2 class="text-[13px] font-bold text-danger">Orders could not be loaded</h2>
                <span class="text-[11px] text-light-secondary">{{ error() }}</span>
              </div>
              <button type="button" class="px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold flex-shrink-0" (click)="load()">Try again</button>
            </div>
          } @else if (filtered().length === 0) {
            <div class="empty-state bg-light-surface p-3.5 rounded-xl border border-border flex flex-col items-center gap-1.5 text-center">
              <span class="material-symbols-outlined text-[28px] text-light-secondary">receipt_long</span>
              <strong class="text-[14px] text-light-primary">{{ invoices().length === 0 ? 'No orders yet' : 'No orders match' }}</strong>
              <p class="text-[11px] text-light-secondary">{{ invoices().length === 0 ? 'Your first wholesale batch will appear here once it is placed.' : 'Clear the search or filters to see every order.' }}</p>
              <button type="button" class="mt-1 px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold" (click)="onEmptyAction()">
                {{ invoices().length === 0 ? 'Browse catalogue' : 'Clear filters' }}
              </button>
            </div>
          } @else {
            @for (inv of filtered(); track inv.orderId) {
              <article
                class="order-card bg-light-surface rounded-xl p-4 border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-2.5 relative overflow-hidden"
                [class.border-warning/40]="!isPaid(inv) && !isClosed(inv)"
                [class.border-border]="isPaid(inv) || isClosed(inv)"
              >
                @if (!isPaid(inv) && !isClosed(inv)) {
                  <div class="absolute top-0 right-0 w-2 h-full bg-warning"></div>
                }

                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-mono font-bold text-[14px] text-light-primary">{{ orderRef(inv.orderId) }}</span>
                    <span class="text-[11px] text-light-secondary">{{ inv.createdAt | date: 'd MMM y' }}</span>
                  </div>
                  <span [class]="statusPillClass(pill(inv.status))">{{ statusLabel(inv.status) }}</span>
                </div>

                <div>
                  <h2 class="text-[14px] font-bold text-light-primary">{{ units(inv) }} Units • {{ inv.items.length }} line item{{ inv.items.length === 1 ? '' : 's' }}</h2>
                  <span class="text-[11px] text-light-secondary">{{ statusNote(inv) }}</span>
                </div>

                <div class="flex items-baseline justify-between pt-1 gap-2">
                  @if (isPaid(inv)) {
                    <span class="text-[12px] text-success font-semibold">{{ paymentLine(inv) }}</span>
                  } @else {
                    <span [class]="statusPillClass('warn')">{{ paymentLine(inv) }}</span>
                  }
                  <span class="font-mono font-bold text-[16px] text-light-primary">{{ inv.totalAmount | seMoney: 2 }}</span>
                </div>

                <div class="pt-2.5 border-t border-border flex items-center justify-between gap-2 flex-wrap">
                  <button type="button" class="text-[12px] font-semibold text-light-secondary hover:text-light-primary flex items-center gap-0.5" aria-label="View invoice" (click)="openInvoice(inv)">
                    View Invoice
                    <span class="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>
                  <span class="flex items-center gap-1.5 flex-wrap justify-end">
                    @if (!isPaid(inv) && !isClosed(inv)) {
                      <button type="button" class="px-4 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-bold shadow-sm hover:brightness-105" aria-label="Pay now" (click)="openInvoice(inv)">
                        Pay now
                      </button>
                    }
                    <button type="button" class="px-3.5 py-1.5 rounded-full bg-canvas-tint border border-border text-light-primary text-[12px] font-semibold flex items-center gap-1" aria-label="Track" (click)="track(inv)">
                      <span class="material-symbols-outlined text-[15px]">location_on</span>
                      Track
                    </button>
                    <button type="button" class="text-accent text-[12px] font-semibold hover:underline flex items-center gap-1" aria-label="Reorder batch" (click)="reorder(inv)">
                      <span class="material-symbols-outlined text-[15px]">replay</span>
                      Reorder
                    </button>
                  </span>
                </div>
              </article>
            }
          }
        </main>

        <ws-tab-bar />
      </div>
    </div>
  `,
  styles: [`:host { display: block; }`],
})
export class OrdersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(SeToastService);
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
  readonly pill = pill;

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

  statusLabel(status: string): string {
    const words = status.replaceAll('_', ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  statusPillClass(tone: string): string {
    const base = 'px-2.5 py-0.5 rounded-full font-semibold text-[11px] whitespace-nowrap';
    if (tone === 'ok') return `${base} bg-success/15 text-success`;
    if (tone === 'warn') return `${base} bg-warning/15 text-warning`;
    if (tone === 'bad') return `${base} bg-danger/15 text-danger`;
    return `${base} bg-canvas-tint text-light-secondary`;
  }

  paymentLine(invoice: Invoice): string {
    return isPaid(invoice) ? `100% Paid • ${payMethod(invoice)}` : 'Awaiting 100% payment';
  }

  /** One factual line about where the batch stands. */
  statusNote(invoice: Invoice): string {
    if (isClosed(invoice)) return 'Batch closed and settled';
    if (!isPaid(invoice)) return 'Ready to cut once settled';
    if (inTransit(invoice)) return 'GIG freight waybill in transit';
    return 'On the Aba production line';
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
