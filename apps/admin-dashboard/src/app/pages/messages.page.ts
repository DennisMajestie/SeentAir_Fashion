import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminOrder, ApiService } from '../api.service';

interface CustomerThread {
  id: string;
  name: string;
  orders: AdminOrder[];
  lifetimeValue: number;
  lastOrderAt: string;
}

/** 060 — Client communications & dispatch support desk. LAYOUT SHELL: there is
    no inbound-messaging module (live chat / WhatsApp APIs are future work), so
    the inbox is approximated with real customer order activity, and the
    composer sends real in-platform notifications tied to an order. */
@Component({
  selector: 'app-messages',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Customer support</p>
        <h1>Customer messages & order support</h1>
        <p class="ops-sub">See who needs help and send order updates. Live chat isn't built yet.</p>
      </div>
      <div class="ops-actions">
        <span class="live-chip">Online now</span>
      </div>
    </div>

    <p class="rule-strip">SENDING ONLY // messages go out as real in-app notifications on an order.
      Inbound live web chat & WhatsApp Business API are future integrations.</p>
    <!-- GAP: inbound customer messages, thread history, macros/AI replies, SLA response
         timers and escalate-to-WhatsApp — no messaging module exists in the API. -->

    <div class="kpi-bar">
      <div class="kpi"><span class="kpi-label">Customers</span><span class="kpi-value">{{ threads().length }}</span><span class="kpi-sub">with order activity (latest {{ orders().length }} orders)</span></div>
      <div class="kpi"><span class="kpi-label">Open orders</span><span class="kpi-value">{{ openOrders() }}</span><span class="kpi-sub">not yet delivered</span></div>
      <div class="kpi"><span class="kpi-label">Awaiting payment</span><span class="kpi-value">{{ unpaidOrders() }}</span><span class="kpi-sub">most common support trigger</span></div>
      <div class="kpi"><span class="kpi-label">Returns pending</span><span class="kpi-value">{{ returnsPending() }}</span><span class="kpi-sub">start it on the Returns page</span></div>
    </div>

    <div class="side-split" style="grid-template-columns: minmax(220px, 0.8fr) minmax(0, 2fr);">
      <div>
        <div class="ops-toolbar" style="margin-bottom:0.5rem;">
          <span class="search"><input placeholder="Filter customers…" [(ngModel)]="query" name="q" aria-label="Filter customers" /></span>
        </div>
        <div class="attention">
          @for (t of visibleThreads(); track t.id) {
            <button class="att-item" style="text-align:left; cursor:pointer; width:100%; font: inherit;"
                    [class.warn]="selected()?.id === t.id" type="button" (click)="select(t)">
              <span class="att-tag">{{ t.name }} <span>{{ t.lastOrderAt | date: 'MMM d' }}</span></span>
              <p class="att-body">{{ t.orders.length }} order(s) · ₦{{ t.lifetimeValue | number: '1.0-0' }} lifetime</p>
              <span class="att-act"><span class="mini-note">latest #{{ t.orders[0].id.slice(0, 8) }} · {{ t.orders[0].status.replaceAll('_', ' ') }}</span></span>
            </button>
          }
          @if (visibleThreads().length === 0) {
            <div class="empty-state">
              <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
              <h2 class="empty-state-title">No customers yet</h2>
              <p class="empty-state-sub">People with orders appear here so you can reach them.</p>
            </div>
          }
        </div>
      </div>

      <aside class="inspector">
        @if (selected(); as t) {
          <div class="insp-head">
            <h2>{{ t.name }}</h2>
            <span class="chip acid">₦{{ t.lifetimeValue | number: '1.0-0' }} lifetime</span>
          </div>

          <div class="panel-head"><h2>Order activity</h2><span class="ph-sub">the thread's real context</span></div>
          <ul class="activity">
            @for (o of t.orders; track o.id) {
              <li>
                <time>{{ o.createdAt | date: 'MMM d, HH:mm' }}</time>
                <span class="act-action">#{{ o.id.slice(0, 8) }} · {{ o.channel.replaceAll('_', ' ') }} ·
                  ₦{{ o.totalAmount | number: '1.0-0' }} · {{ o.status.replaceAll('_', ' ') }} ({{ o.paymentStatus }})</span>
              </li>
            }
          </ul>
          <p class="mini-note">No message history — inbound chat is not integrated; only order context is available.</p>

          <div class="gap-sep"></div>
          <div class="panel-head"><h2>Send order update</h2><span class="ph-sub">in-platform notification</span></div>
          <form (ngSubmit)="send(t)">
            <label>Regarding order
              <select [(ngModel)]="orderId" name="oid" required>
                @for (o of t.orders; track o.id) { <option [value]="o.id">#{{ o.id.slice(0, 8) }} — {{ o.status.replaceAll('_', ' ') }}</option> }
              </select>
            </label>
            <label>Message
              <textarea [(ngModel)]="draft" name="draft" rows="3" required
                placeholder="Hi — your batch has cleared quality inspection and is scheduled for courier dispatch…"></textarea>
            </label>
            <div class="actions flat" style="margin-bottom:0.6rem;">
              @for (m of macros; track m.label) {
                <button class="cta small ghost" type="button" (click)="applyMacro(m.text)">{{ m.label }}</button>
              }
            </div>
            <button class="cta small" type="submit">Send reply →</button>
          </form>
        } @else {
          <p class="muted small">Select a customer to see their order activity and send an update.</p>
        }
      </aside>
    </div>

    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class MessagesPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly orders = signal<AdminOrder[]>([]);
  readonly selected = signal<CustomerThread | null>(null);
  readonly returnsPending = signal(0);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  query = '';
  draft = '';
  orderId = '';

  /** Canned composer starters (client-side text only — no macro backend). */
  readonly macros = [
    { label: 'Send tracking', text: 'Hello! Your order is with the courier — we will share the live tracking link as soon as the leg is dispatched.' },
    { label: 'Confirm size exchange', text: 'Thanks for reaching out — size exchanges follow the returns window: request within 12h of receipt and we will guide you through the swap.' },
    { label: 'Payment reminder', text: 'Hi! Your order is reserved and awaiting full payment — it ships as soon as payment is confirmed.' },
  ];

  ngOnInit(): void {
    this.api.orders(undefined, 100).subscribe((res) => this.orders.set(res.data));
    this.api.returns().subscribe((res) => this.returnsPending.set(res.data.filter((r) => r.status === 'requested').length));
  }

  readonly threads = computed<CustomerThread[]>(() => {
    const byCustomer = new Map<string, CustomerThread>();
    for (const o of this.orders()) {
      if (!o.customer) continue;
      const t = byCustomer.get(o.customer.id) ?? {
        id: o.customer.id, name: o.customer.name, orders: [], lifetimeValue: 0, lastOrderAt: o.createdAt,
      };
      t.orders.push(o);
      t.lifetimeValue += Number(o.totalAmount) || 0;
      if (new Date(o.createdAt) > new Date(t.lastOrderAt)) t.lastOrderAt = o.createdAt;
      byCustomer.set(o.customer.id, t);
    }
    const list = [...byCustomer.values()];
    for (const t of list) t.orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list.sort((a, b) => new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime());
  });

  readonly openOrders = computed(() => this.orders().filter((o) => !['delivered', 'returned'].includes(o.status)).length);
  readonly unpaidOrders = computed(() => this.orders().filter((o) => o.paymentStatus !== 'paid').length);

  visibleThreads(): CustomerThread[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.threads().filter((t) => t.name.toLowerCase().includes(q)) : this.threads();
  }

  select(t: CustomerThread): void {
    if (this.selected()?.id === t.id) { this.selected.set(null); return; }
    this.selected.set(t);
    this.orderId = t.orders[0]?.id ?? '';
    this.draft = '';
  }

  applyMacro(text: string): void {
    this.draft = this.draft ? `${this.draft}\n${text}` : text;
  }

  send(t: CustomerThread): void {
    const message = this.draft.trim();
    if (!message || !this.orderId) return;
    this.api.sendNotification({
      recipientId: t.id,
      channel: 'in_platform',
      type: 'order_update',
      message,
      relatedOrderId: this.orderId,
    }).subscribe({
      next: () => { this.draft = ''; this.message.set(`Update sent to ${t.name}.`); this.error.set(null); },
      error: (e) => { this.error.set(e?.error?.message ?? 'Send failed.'); this.message.set(null); },
    });
  }
}
