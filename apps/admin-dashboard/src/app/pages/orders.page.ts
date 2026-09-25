import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AdminOrder, ApiService } from '../api.service';
import { downloadCsv } from '../csv.util';

const NEXT_STATUS: Record<string, string> = {
  order_received: 'processing',
  processing: 'shipped',
  shipped: 'delivered',
};

/** A9/A10 — Omnichannel orders & fulfilment desk, with the packing-slip /
    dispatch-dossier inspector for the selected order. One shared order
    resource across retail, wholesale, custom and in-store (principle #1). */
@Component({
  selector: 'app-orders',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Operations · Omnichannel orders</p>
        <h1>Orders & shipping</h1>
        <p class="ops-sub">Centralised payment verification and dispatch routing across wholesale B2B, retail web and in-store.</p>
      </div>
      <div class="ops-actions">
        <span class="live-chip">Live</span>
        <button class="cta small ghost" type="button" (click)="print()">Print today's deliveries</button>
        <button class="cta small ghost" type="button" (click)="exportCsv()">Export CSV</button>
      </div>
    </div>

    <div class="kpi-bar">
      <div class="kpi">
        <span class="kpi-label">Total orders</span>
        <span class="kpi-value">{{ total() }}</span>
        <span class="kpi-sub">₦{{ loadedValue() | number: '1.0-0' }} across latest {{ orders().length }}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Wholesale B2B</span>
        <span class="kpi-value">{{ countBy('wholesale') }}</span>
        <span class="kpi-sub">of latest {{ orders().length }} loaded</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Retail e-com</span>
        <span class="kpi-value">{{ countBy('retail') }}</span>
        <span class="kpi-sub">{{ countBy('in_store') }} in-store · {{ countBy('custom') }} custom</span>
      </div>
      <div class="kpi" [class.kpi-action]="unpaidCount() > 0">
        <span class="kpi-label">Awaiting payment</span>
        <span class="kpi-value">{{ unpaidCount() }}</span>
        <span class="kpi-sub">full payment upfront — unpaid orders can't advance</span>
      </div>
    </div>

    <div class="ops-toolbar">
      <span class="search"><input placeholder="Search by order ref or buyer…" [(ngModel)]="query" name="q" aria-label="Search orders" /></span>
      <div class="seg" role="group" aria-label="Channel">
        <button type="button" [class.on]="channel === ''" (click)="setChannel('')">All channels</button>
        <button type="button" [class.on]="channel === 'wholesale'" (click)="setChannel('wholesale')">Wholesale</button>
        <button type="button" [class.on]="channel === 'retail'" (click)="setChannel('retail')">Retail web</button>
        <button type="button" [class.on]="channel === 'in_store'" (click)="setChannel('in_store')">In-store</button>
      </div>
      <div class="seg" role="group" aria-label="Payment">
        <button type="button" [class.on]="payFilter() === ''" (click)="payFilter.set('')">Any payment</button>
        <button type="button" [class.on]="payFilter() === 'paid'" (click)="payFilter.set('paid')">Paid</button>
        <button type="button" [class.on]="payFilter() === 'unpaid'" (click)="payFilter.set('unpaid')">Unpaid</button>
      </div>
    </div>

    <div class="table-scroll">
      <table class="table">
        <thead>
          <tr><th>Order & channel</th><th>Customer / buyer</th><th>Items & sub-units</th><th>Value & payment</th><th>Fulfilment</th><th>Actions</th></tr>
        </thead>
        <tbody>
          @for (order of visible(); track order.id) {
            <tr class="clickable" [class.sel]="selected()?.id === order.id" (click)="select(order)">
              <td>
                <code>#{{ order.id.slice(0, 8) }}</code><br />
                <span class="chip" [class.acid]="order.channel === 'wholesale'">{{ order.channel.replaceAll('_', ' ') }}</span>
                @if (order.source) { <span class="mini-note"> via {{ order.source }}</span> }
              </td>
              <td>{{ order.customer?.name ?? 'walk-in' }}</td>
              <td class="small">
                {{ itemCount(order) }} unit(s) · {{ (order.items ?? []).length }} line(s)<br />
                <span class="muted">{{ itemSummary(order) }}</span>
              </td>
              <td class="mono">₦{{ order.totalAmount | number: '1.0-0' }}<br />
                <span class="chip" [class.ok]="order.paymentStatus === 'paid'" [class.bad]="order.paymentStatus !== 'paid'">{{ order.paymentStatus }}</span>
              </td>
              <td><span class="status">{{ order.status.replaceAll('_', ' ') }}</span><br />
                <span class="mini-note">{{ order.createdAt | date: 'MMM d, HH:mm' }}</span></td>
              <td>
                <div class="actions flat">
                  @if (next(order); as n) {
                    <button class="cta small" (click)="advance(order.id, n); $event.stopPropagation()">→ {{ n }}</button>
                  }
                  <button class="link" type="button" (click)="select(order); $event.stopPropagation()">
                    {{ selected()?.id === order.id ? 'close' : 'dossier' }}
                  </button>
                </div>
              </td>
            </tr>
          }
          @if (visible().length === 0) { <tr><td colspan="6" class="muted small">No orders match.</td></tr> }
        </tbody>
      </table>
    </div>

    <!-- ============ A10 — Dispatch dossier & pick verification ============ -->
    @if (selected(); as o) {
      <section class="panel" style="border-color: var(--hairline-strong);">
        <div class="panel-head">
          <h2>Dispatch details & item check — #{{ o.id.slice(0, 8) }}</h2>
          <span class="chip" [class.ok]="o.paymentStatus === 'paid'" [class.bad]="o.paymentStatus !== 'paid'">{{ o.paymentStatus }}</span>
          <span class="chip acid">{{ o.status.replaceAll('_', ' ') }}</span>
          <span class="ph-end">
            <button class="cta small ghost" type="button" (click)="print()">Print packing slip</button>
            @if (next(o); as n) { <button class="cta small" (click)="advance(o.id, n)">Complete → {{ n }}</button> }
            <button class="link" type="button" (click)="selected.set(null)">Close</button>
          </span>
        </div>

        <div class="ops-grid">
          <div>
            <div class="panel-head"><h2>Packing checklist</h2><span class="ph-sub">{{ itemCount(o) }} unit(s) to stage</span></div>
            <table class="table">
              <thead><tr><th>SKU</th><th>Description</th><th>Qty</th><th>Unit ₦</th><th>Line ₦</th></tr></thead>
              <tbody>
                @for (it of o.items ?? []; track it.id) {
                  <tr>
                    <td><code>{{ it.variant.sku }}</code></td>
                    <td class="small">{{ it.variant.colour || '—' }} · size {{ it.variant.size || '—' }}</td>
                    <td class="mono">{{ it.quantity }}</td>
                    <td class="mono">₦{{ it.unitPrice | number: '1.0-0' }}</td>
                    <td class="mono">₦{{ it.quantity * it.unitPrice | number: '1.0-0' }}</td>
                  </tr>
                }
                <tr><td colspan="4"><strong>Order total</strong></td><td class="mono"><strong class="naira">₦{{ o.totalAmount | number: '1.0-0' }}</strong></td></tr>
              </tbody>
            </table>

            <div class="panel-head" style="margin-top:0.9rem;"><h2>Fulfilment timeline</h2><span class="ph-sub">status events</span></div>
            @if (timeline().length > 0) {
              <ul class="activity">
                @for (ev of timeline(); track $index) {
                  <li>
                    <time>{{ str(ev['createdAt']) | date: 'MMM d, HH:mm' }}</time>
                    <span class="act-action">{{ str(ev['status']).replaceAll('_', ' ') }}@if (ev['note']) { — {{ ev['note'] }} }</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="muted small">No status events yet.</p>
            }
          </div>

          <aside>
            <div class="panel-head"><h2>Recipient & delivery</h2></div>
            <dl class="kv">
              <dt>Recipient</dt><dd>{{ o.customer?.name ?? 'walk-in customer' }}</dd>
              <dt>Channel</dt><dd>{{ o.channel.replaceAll('_', ' ') }}@if (o.source) { · via {{ o.source }} }</dd>
              <dt>Placed</dt><dd>{{ o.createdAt | date: 'medium' }}</dd>
              <dt>Delivered</dt><dd>{{ o.deliveredAt ? (str(o.deliveredAt) | date: 'medium') : 'not yet' }}</dd>
              <dt>Order reference</dt><dd><code class="wrap-anywhere">{{ o.id }}</code></dd>
              @if (str(o['shippingAddress'])) {
                <dt>Ship to</dt><dd class="wrap-anywhere">{{ o['shippingAddress'] }}</dd>
              }
            </dl>

            <div class="gap-sep"></div>
            <div class="panel-head"><h2>Warehouse pack-out</h2><span class="ph-sub">pallet & QR stencil</span></div>
            @if (str(o['oqrCode'])) {
              <div class="rule-strip" style="margin:0 0 0.8rem;">
                <strong>QR stencil generated</strong>
                <code class="mono wrap-anywhere">{{ o['oqrCode'] }}</code>
                <small class="mini-note">print on thermal label, fix to the top carton before dispatch.</small>
              </div>
            }
            <form (ngSubmit)="fulfil(o)">
              <label>Shipping address
                <textarea rows="2" [(ngModel)]="fulfilment.shippingAddress" name="fship"
                  placeholder="Building, street, area, LGA — used on the waybill."></textarea>
              </label>
              <div class="form-grid">
                <label>Gross weight (kg) <input type="number" min="0" step="0.1" [(ngModel)]="fulfilment.grossWeightKg" name="fgross" /></label>
                <label>Pallet ref <input [(ngModel)]="fulfilment.palletRef" name="fpallet" placeholder="P-A1" /></label>
              </div>
              <label>Generate QR dispatch stencil? <input type="checkbox" [(ngModel)]="fulfilment.generateQrStencil" name="fqr" /></label>
              <div class="actions flat">
                <button class="cta small" type="submit">Record pack-out</button>
              </div>
            </form>
            <p class="mini-note">Book the delivery in Logistics using this order reference.</p>
            <div class="actions flat">
              <button class="cta small ghost" type="button" (click)="copyRef(o.id)">Copy order reference</button>
              <a class="cta small ghost" href="/logistics">Open logistics</a>
            </div>

            @if (o.customer) {
              <div class="gap-sep"></div>
              <div class="panel-head"><h2>Notify customer</h2><span class="ph-sub">in-platform</span></div>
              <form (ngSubmit)="notify(o)">
                <label>Message
                  <textarea [(ngModel)]="notifyMsg" name="nmsg" rows="2" required
                    placeholder="Your batch has cleared QC and is scheduled for dispatch…"></textarea>
                </label>
                <button class="cta small" type="submit">Send update</button>
              </form>
            }
          </aside>
        </div>
      </section>
    }
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class OrdersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly orders = signal<AdminOrder[]>([]);
  readonly total = signal(0);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly selected = signal<AdminOrder | null>(null);
  readonly timeline = signal<Array<Record<string, unknown>>>([]);
  readonly payFilter = signal('');
  channel = '';
  query = '';
  notifyMsg = '';
  fulfilment = { shippingAddress: '', grossWeightKg: null as number | null, palletRef: '', generateQrStencil: false };

  ngOnInit(): void {
    this.query = this.route.snapshot.queryParamMap.get('q') ?? '';
    this.load();
  }

  load(): void {
    this.api.orders(this.channel || undefined, 100).subscribe((res) => {
      this.orders.set(res.data);
      this.total.set(res.total);
    });
  }

  setChannel(c: string): void {
    this.channel = c;
    this.load();
  }

  visible(): AdminOrder[] {
    const q = this.query.trim().toLowerCase();
    const pay = this.payFilter();
    return this.orders().filter((o) => {
      if (pay && o.paymentStatus !== pay) return false;
      if (!q) return true;
      return o.id.toLowerCase().includes(q) || (o.customer?.name ?? 'walk-in').toLowerCase().includes(q);
    });
  }

  readonly loadedValue = computed(() => this.orders().reduce((s, o) => s + (Number(o.totalAmount) || 0), 0));
  readonly unpaidCount = computed(() => this.orders().filter((o) => o.paymentStatus !== 'paid').length);
  countBy(channel: string): number {
    return this.orders().filter((o) => o.channel === channel).length;
  }

  itemCount(o: AdminOrder): number {
    return (o.items ?? []).reduce((s, it) => s + it.quantity, 0);
  }
  itemSummary(o: AdminOrder): string {
    const skus = (o.items ?? []).map((it) => `${it.variant.sku}×${it.quantity}`);
    return skus.slice(0, 3).join(' · ') + (skus.length > 3 ? ` +${skus.length - 3}` : '');
  }
  str(v: unknown): string { return v == null ? '' : String(v); }

  select(order: AdminOrder): void {
    if (this.selected()?.id === order.id) { this.selected.set(null); return; }
    this.selected.set(order);
    this.timeline.set([]);
    this.api.orderTracking(order.id).subscribe({
      next: (t) => this.timeline.set(((t as Record<string, unknown>)['events'] as Array<Record<string, unknown>>) ?? []),
      error: () => this.timeline.set([]),
    });
  }

  next(order: AdminOrder): string | null {
    if (order.paymentStatus !== 'paid') return null;
    return NEXT_STATUS[order.status] ?? null;
  }

  advance(id: string, status: string): void {
    this.error.set(null);
    this.api.advanceOrder(id, status).subscribe({
      next: () => { this.load(); if (this.selected()?.id === id) { const s = this.selected(); if (s) { s.status = status; this.select({ ...s }); this.selected.set({ ...s }); } } },
      error: (err) => this.error.set(err?.error?.message ?? 'Status change failed.'),
    });
  }

  copyRef(id: string): void {
    navigator.clipboard?.writeText(id).then(
      () => this.message.set('Order reference copied.'),
      () => this.error.set('Could not copy — select and copy the ref manually.'),
    );
  }

  fulfil(order: AdminOrder): void {
    const body: Record<string, unknown> = {
      generateQrStencil: !!this.fulfilment.generateQrStencil,
    };
    if (this.fulfilment.shippingAddress.trim()) body['shippingAddress'] = this.fulfilment.shippingAddress.trim();
    if (this.fulfilment.grossWeightKg != null) body['grossWeightKg'] = Number(this.fulfilment.grossWeightKg);
    if (this.fulfilment.palletRef.trim()) body['palletRef'] = this.fulfilment.palletRef.trim();
    this.api.fulfilOrder(order.id, body).subscribe({
      next: (res) => {
        this.message.set('Pack-out recorded.');
        this.error.set(null);
        this.fulfilment = { shippingAddress: '', grossWeightKg: null, palletRef: '', generateQrStencil: false };
        this.api.order(order.id).subscribe((fresh) => this.selected.set({ ...this.selected()!, ...fresh } as AdminOrder));
      },
      error: (err) => this.error.set(err?.error?.message ?? 'Pack-out failed.'),
    });
  }

  print(): void { window.print(); }

  exportCsv(): void {
    const rows = this.visible().map((o) => ({
      OrderID: o.id,
      Channel: o.channel,
      Status: o.status,
      Payment: o.paymentStatus,
      Customer: o.customer?.name ?? 'walk-in',
      Items: this.itemCount(o),
      Value_NGN: o.totalAmount,
      Created: o.createdAt,
    }));
    downloadCsv(`orders-${this.channel || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  /** Manual in-platform message to the customer about this order. */
  notify(order: AdminOrder): void {
    const message = this.notifyMsg.trim();
    const customerId = order.customer?.id;
    if (!message || !customerId) return;
    this.api.sendNotification({
      recipientId: customerId,
      channel: 'in_platform',
      type: 'order_update',
      message,
      relatedOrderId: order.id,
    }).subscribe({
      next: () => { this.notifyMsg = ''; this.message.set(`Update sent to ${order.customer?.name}.`); this.error.set(null); },
      error: (err) => this.error.set(err?.error?.message ?? 'Notify failed.'),
    });
  }
}
