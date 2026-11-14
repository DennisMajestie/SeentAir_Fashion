import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  SeActivityEntry,
  SeColumn,
  SeCurrencyService,
  SeRowAction,
  SeStatusComponent,
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
  imports: [RouterLink, DecimalPipe, SeStatusComponent],
  template: `
    <div class="w2">
      <section class="w2-hero card">
        <div class="w2-hero-top">
          <div>
            <span class="muted small">Welcome back,</span>
            <h1>{{ buyerName() ?? 'Wholesale buyer' }}</h1>
          </div>
          <span class="pill" [class.pill--ok]="approved()" [class.pill--warn]="!approved()">
            <span class="dot"></span>{{ approved() ? 'Verified account' : 'Pending review' }}
          </span>
        </div>
        <div class="w2-hero-meta">
          <span><span class="material-symbols-outlined">rule</span>{{ accountLine() }}</span>
          <span class="ok"><span class="dot"></span>{{ stageLine() }}</span>
        </div>
      </section>

      @if (summary().awaitingPayment > 0) {
        <button type="button" class="w2-alert" (click)="router.navigate(['/orders'])">
          <span class="w2-alert-icon"><span class="material-symbols-outlined">receipt_long</span></span>
          <span class="w2-alert-copy">
            <strong>{{ paymentHeadline() }}</strong>
            <small>{{ summary().next }}</small>
          </span>
          <span class="w2-alert-cta">View <span class="material-symbols-outlined">chevron_right</span></span>
        </button>
      }

      <section class="w2-metrics">
        <div class="metric cardish">
          <div class="metric-head"><span>Open Orders</span><span class="material-symbols-outlined accent">inventory_2</span></div>
          <strong>{{ summary().open }}</strong>
          <small>{{ stageLine() }}</small>
        </div>
        <div class="metric cardish">
          <div class="metric-head"><span>Awaiting Payment</span><span class="material-symbols-outlined warn">pending</span></div>
          <strong [class.warn-t]="summary().awaitingPayment > 0">{{ summary().awaitingPayment === 0 ? 'Clear' : summary().awaitingPayment }}</strong>
          <small>{{ summary().awaitingPayment === 0 ? 'Nothing to pay' : 'Full payment upfront' }}</small>
        </div>
        <div class="metric cardish">
          <div class="metric-head"><span>In Transit</span><span class="material-symbols-outlined ok-t">local_shipping</span></div>
          <strong>{{ summary().inTransit }}</strong>
          <small>With the courier</small>
        </div>
        <div class="metric cardish">
          <div class="metric-head"><span>Last Order</span><span class="material-symbols-outlined muted">history</span></div>
          <strong class="date">{{ lastOrder() ? formatDate(lastOrder()!.createdAt) : 'None yet' }}</strong>
          <small [class.ok-t]="lastOrder()">{{ lastOrder() ? statusLabel(lastOrder()!.status) : '' }}</small>
        </div>
      </section>

      <section class="card w2-progress">
        <div class="w2-progress-head">
          <div><span class="pulse"></span><strong>Live Batch Progress</strong></div>
          <span class="mono muted">{{ lastOrder() ? orderRef(lastOrder()!.orderId) : '—' }}</span>
        </div>
        <p class="muted small">{{ summary().next }}</p>
        <ol class="track" [attr.aria-label]="'Batch progress: ' + stageLine()" role="progressbar" aria-valuemin="0" [attr.aria-valuemax]="pipeline.length" [attr.aria-valuenow]="step() + 1">
          @for (s of pipeline; track s.key; let i = $index) {
            <li [class.on]="i <= step()" [class.active]="i === step()">
              <span class="n">@if (i < step()) { ✓ } @else { {{ i + 1 }} }</span>
              <span class="l">{{ s.label }}</span>
            </li>
          }
        </ol>
      </section>

      <section class="w2-list">
        <div class="w2-list-head">
          <h2>Recent Orders</h2>
          <a routerLink="/orders" class="accent-link">View all</a>
        </div>

        @if (loading()) {
          <div class="card muted small">Loading orders…</div>
        } @else if (error()) {
          <div class="card">
            <p class="small">{{ error() }}</p>
            <button type="button" class="w2-btn" (click)="load()">Try again</button>
          </div>
        } @else if (recent().length === 0) {
          <div class="card w2-empty">
            <strong>No orders yet</strong>
            <p class="muted small">Your first wholesale batch will appear here.</p>
            <a routerLink="/catalogue" class="w2-btn primary">Browse catalogue</a>
          </div>
        } @else {
          @for (inv of recent(); track inv.orderId) {
            <article class="card w2-order">
              <div class="row1">
                <div><span class="mono ref">{{ orderRef(inv.orderId) }}</span> <span class="muted small">{{ formatDate(inv.createdAt) }}</span></div>
                <se-status kind="order" [value]="inv.status" />
              </div>
              <div class="row2">
                <span class="muted small">{{ units(inv) }} units</span>
                <span class="mono amount">{{ inv.totalAmount | number:'1.0-0' }}</span>
              </div>
              <div class="row3">
                <se-status kind="payment" [value]="inv.paymentStatus" />
                <div class="actions">
                  @if (!isPaid(inv) && !isClosed(inv)) {
                    <button type="button" class="w2-btn primary sm" (click)="openInvoice(inv)">Pay now</button>
                  }
                  <a [routerLink]="['/orders', inv.orderId, 'tracking']" class="w2-btn sm">Track</a>
                  <button type="button" class="w2-btn sm" (click)="reorder(inv)">Reorder</button>
                </div>
              </div>
            </article>
          }
        }
      </section>

      @if (notices().length > 0) {
        <section class="card">
          <h2>Desk notices</h2>
          <ul class="notices">
            @for (n of noticeEntries(); track $index) {
              <li><strong>{{ n.actor }}</strong> <span class="muted small">{{ formatDate(n.at) }}</span><p>{{ n.text }}</p></li>
            }
          </ul>
        </section>
      }

      <section class="card w2-desk">
        <div class="desk-icon"><span class="material-symbols-outlined">support_agent</span></div>
        <div>
          <h2>Aba Wholesale Desk</h2>
          <span class="muted small">Direct mill lead line â€¢ 08:00 - 18:00 WAT</span>
        </div>
        <a href="tel:+23418887400" class="call"><span class="material-symbols-outlined">call</span></a>
      </section>
    </div>
  `,
  styles: [
    `
      :host { display:block; }
      .w2 { display:flex; flex-direction:column; gap:12px; padding: 4px 0 16px; font-family:'Urbanist',sans-serif; }
      .card { background:#fffdf9; border:1px solid #e8e1d3; border-radius:12px; padding:16px; box-shadow:0 8px 24px -4px rgba(27,25,22,.05); }
      .cardish { background:#fffdf9; border:1px solid #e8e1d3; border-radius:12px; padding:14px; }
      .w2-hero h1 { margin:2px 0 0; font:700 18px/1.2 Urbanist,sans-serif; }
      .w2-hero-top { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
      .w2-hero-meta { margin-top:12px; padding-top:12px; border-top:1px solid #e8e1d3; display:flex; justify-content:space-between; gap:8px; font-size:12px; color:#7b756a; flex-wrap:wrap; }
      .w2-hero-meta span { display:inline-flex; align-items:center; gap:4px; }
      .w2-hero-meta .material-symbols-outlined { font-size:15px; color:#c88a12; }
      .pill { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; font:600 11px/1 Urbanist,sans-serif; border:1px solid rgba(200,138,18,.25); background:rgba(200,138,18,.12); color:#93600a; white-space:nowrap; }
      .pill--ok { background:rgba(35,128,77,.12); border-color:rgba(35,128,77,.25); color:#23804d; }
      .pill .dot, .dot { width:6px; height:6px; border-radius:999px; background:currentColor; display:inline-block; }
      .w2-alert { width:100%; text-align:left; border:1px solid rgba(147,96,10,.3); background:#fff7eb; border-radius:12px; padding:14px; display:flex; align-items:center; gap:10px; }
      .w2-alert-icon { width:32px; height:32px; border-radius:999px; background:rgba(147,96,10,.15); color:#93600a; display:inline-flex; align-items:center; justify-content:center; flex:none; }
      .w2-alert-copy { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
      .w2-alert-copy strong { font-size:13px; color:#93600a; }
      .w2-alert-copy small { color:#7b756a; font-size:11px; }
      .w2-alert-cta { color:#93600a; font:700 12px/1 Urbanist,sans-serif; display:inline-flex; align-items:center; }
      .w2-metrics { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .metric-head { display:flex; justify-content:space-between; align-items:center; color:#7b756a; font-size:11px; }
      .metric strong { display:block; margin-top:8px; font:700 22px/1 Urbanist,sans-serif; color:#1b1916; }
      .metric strong.date { font-size:18px; }
      .metric small { display:block; margin-top:4px; color:#7b756a; font-size:11px; }
      .material-symbols-outlined { font-size:18px; }
      .metric-head .material-symbols-outlined { font-size:16px; }
      .accent { color:#c88a12; } .warn { color:#93600a; } .ok-t { color:#23804d; } .muted { color:#7b756a; } .warn-t { color:#93600a; }
      .w2-progress-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:13px; }
      .w2-progress-head div { display:flex; align-items:center; gap:6px; }
      .pulse { width:8px; height:8px; border-radius:999px; background:#c88a12; box-shadow:0 0 0 4px rgba(200,138,18,.15); display:inline-block; }
      .track { list-style:none; margin:12px 0 0; padding:0; display:grid; grid-template-columns:repeat(4,1fr); gap:4px; position:relative; }
      .track li { display:flex; flex-direction:column; align-items:center; gap:4px; text-align:center; position:relative; }
      .track .n { width:24px; height:24px; border-radius:999px; border:2px solid #e8e1d3; background:#fffdf9; color:#7b756a; display:inline-flex; align-items:center; justify-content:center; font:600 11px/1 Urbanist,sans-serif; }
      .track li.on .n, .track li.active .n { background:#c88a12; color:#1a1405; border-color:#c88a12; }
      .track .l { font:500 10px/1.2 Urbanist,sans-serif; color:#7b756a; }
      .track li.on .l { color:#1b1916; font-weight:600; }
      .track li.active .l { color:#c88a12; font-weight:700; }
      .w2-list-head { display:flex; justify-content:space-between; align-items:center; }
      .w2-list-head h2, .card h2 { margin:0; font:700 15px/1.2 Urbanist,sans-serif; }
      .accent-link { color:#c88a12; font:600 12px/1 Urbanist,sans-serif; text-decoration:none; }
      .w2-order { display:flex; flex-direction:column; gap:8px; }
      .row1,.row2,.row3 { display:flex; justify-content:space-between; align-items:center; gap:8px; }
      .row3 { padding-top:8px; border-top:1px solid #e8e1d3; flex-wrap:wrap; }
      .ref { font-weight:700; font-size:13px; }
      .amount { font-weight:700; }
      .actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
      .w2-btn { border:1px solid #e8e1d3; background:#fffdf9; color:#1b1916; border-radius:999px; padding:8px 12px; font:600 12px/1 Urbanist,sans-serif; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; }
      .w2-btn.primary { background:#c88a12; color:#1a1405; border-color:#c88a12; }
      .w2-btn.sm { padding:6px 10px; font-size:12px; }
      .w2-empty { text-align:center; display:flex; flex-direction:column; gap:6px; align-items:center; }
      .notices { list-style:none; margin:10px 0 0; padding:0; display:flex; flex-direction:column; gap:10px; }
      .notices p { margin:2px 0 0; font-size:13px; }
      .w2-desk { display:flex; align-items:center; gap:12px; background:rgba(239,227,200,.5); }
      .desk-icon, .call { width:40px; height:40px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; flex:none; }
      .desk-icon { background:#1b1916; color:#c88a12; }
      .call { margin-left:auto; border:1px solid #e8e1d3; background:#fffdf9; color:#1b1916; text-decoration:none; }
      .mono { font-family:'JetBrains Mono',monospace; }
      .small { font-size:12px; }
      .ok { color:#23804d; }
      @media (max-width: 360px) { .w2-metrics { grid-template-columns:1fr; } .track { grid-template-columns:repeat(2,1fr); row-gap:10px; } }
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
  readonly isPaid = isPaid;
  readonly isClosed = isClosed;
  readonly orderRef = orderRef;
  readonly units = units;

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
    return parts.join(' • ');
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

  /** "Shipped Â· 2 open orders", or "Nothing in flight". */
  stageLine(): string {
    const step = this.step();
    if (step < 0) return 'Nothing in flight';
    const n = this.summary().open;
    return `${PIPELINE[step].label} • ${n} open ${n === 1 ? 'order' : 'orders'}`;
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
