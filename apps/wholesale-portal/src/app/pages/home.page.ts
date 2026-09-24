import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Invoice, Pricing } from '../api.service';
import { pill } from '../status-pill';

/**
 * W2 — Wholesale buyer home. Identity + tier card, 2×2 operations KPI grid,
 * catalogue CTA, recent orders, billing & invoices, desk contact.
 * All figures derive from the live API (auth/me, wholesale/pricing,
 * wholesale/invoices, notifications) — nothing is invented.
 */
@Component({
  selector: 'app-home',
  imports: [CommonModule, RouterLink],
  template: `
    <section class="id-card">
      <div class="id-row">
        <div class="id-name">
          <span class="material-symbols-outlined mark" aria-hidden="true">verified</span>
          <h1>{{ buyerName() ?? 'Wholesale buyer' }}</h1>
        </div>
        @if (approved()) {
          <span class="chip okc">Verified</span>
        } @else {
          <span class="chip">Pending review</span>
        }
      </div>
      <div class="id-tier">
        @if (pricing(); as p) {
          <span><strong>{{ p.tier?.name ?? 'Standard tier' }}</strong>
            @if (p.tier) { · {{ p.tier.discountPercent }}% off retail rate active }</span>
          <a class="link" routerLink="/catalogue">Tier details</a>
        } @else {
          <span>Wholesale account awaiting approval — apply from the catalogue.</span>
          <a class="link" routerLink="/catalogue">Apply</a>
        }
      </div>
    </section>

    <div class="kpi-grid">
      <div class="kpi">
        <div class="k-head"><span>Open orders</span>
          <span class="material-symbols-outlined" aria-hidden="true">calendar_today</span></div>
        <div class="k-value"><strong>{{ two(openOrders()) }}</strong><span class="k-sub">Active</span></div>
      </div>
      <div class="kpi">
        <div class="k-head"><span>Awaiting pay</span>
          <span class="material-symbols-outlined" aria-hidden="true">warning</span></div>
        <div class="k-value" [class.alert]="awaitingPay() > 0">
          <strong>{{ two(awaitingPay()) }}</strong>
          @if (awaitingPay() > 0) { <span class="chip accent">Action req</span> }
          @else { <span class="k-sub">Clear</span> }
        </div>
      </div>
      <div class="kpi">
        <div class="k-head"><span>In transit</span>
          <span class="material-symbols-outlined" aria-hidden="true">local_shipping</span></div>
        <div class="k-value"><strong>{{ two(inTransit()) }}</strong><span class="k-sub">GIGL dispatch</span></div>
      </div>
      <div class="kpi">
        <div class="k-head"><span>Last order</span>
          <span class="material-symbols-outlined" aria-hidden="true">event</span></div>
        <div class="k-value">
          @if (lastOrder(); as last) {
            <strong style="font-size: 1rem">{{ last.createdAt | date: 'dd MMM yyyy' }}</strong>
            <span class="k-sub">{{ last.status.replaceAll('_', ' ') }}</span>
          } @else {
            <strong style="font-size: 1rem">—</strong><span class="k-sub">No orders yet</span>
          }
        </div>
      </div>
    </div>

    <a class="cta hero-cta" routerLink="/catalogue">
      <span class="material-symbols-outlined" aria-hidden="true">storefront</span>
      <span>Browse wholesale catalogue</span>
      <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
    </a>

    @if (notices().length > 0) {
      <section class="panel">
        <div class="tagbar"><span>Desk notices</span><span>{{ notices().length }}</span></div>
        @for (n of notices(); track n.id) {
          <p class="small"><span class="status">{{ n.type.replaceAll('_', ' ') }}</span>
            {{ n.message }} <span class="muted">({{ n.sentAt | date: 'short' }})</span></p>
        }
      </section>
    }

    <div class="section-head">
      <h2>Recent orders <span class="chip">{{ invoices().length }}</span></h2>
      <a class="link" routerLink="/orders">View all orders</a>
    </div>
    @if (invoices().length === 0) {
      <div class="empty-state">
        <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
        <h2 class="empty-state-title">No orders yet</h2>
        <p class="empty-state-sub">Your first wholesale batch will appear here.</p>
      </div>
    }
    @for (invoice of recent(); track invoice.orderId) {
      <article class="ordercard">
        <div class="oc-top">
          <div>
            <span class="oc-meta">Order identifier</span>
            <span class="oc-id">#{{ invoice.orderId.slice(0, 8).toUpperCase() }}</span>
          </div>
          <span class="status" [class]="'status ' + pill(invoice.status)">
            {{ invoice.status.replaceAll('_', ' ') }} · {{ invoice.createdAt | date: 'dd MMM' }}
          </span>
        </div>
        <div class="oc-line">
          <span><span class="l">Volume</span>{{ units(invoice) }} units</span>
          <span class="num"><span class="l">Subtotal</span>₦{{ invoice.totalAmount | number: '1.0-2' }}</span>
        </div>
        <div class="oc-actions">
          <button class="cta small outline" (click)="reorder(invoice.orderId)">
            <span class="material-symbols-outlined" aria-hidden="true">sync</span> Reorder batch
          </button>
          <a class="cta small quiet" [routerLink]="['/orders', invoice.orderId, 'invoice']">Manifest</a>
        </div>
      </article>
    }
    @if (message()) { <p class="success">{{ message() }}</p> }

    <div class="section-head">
      <h2>Billing &amp; invoices</h2>
      <span class="aside">Aba accounts desk</span>
    </div>
    @for (invoice of recent(); track invoice.orderId) {
      <article class="ordercard" style="padding: var(--space-md) var(--space-lg)">
        <div class="oc-top">
          <div>
            <span class="oc-id">INV-{{ invoice.orderId.slice(0, 8).toUpperCase() }}</span>
            <span class="oc-meta">{{ paid(invoice) ? 'Settled amount' : 'Amount due' }}
              — ₦{{ invoice.totalAmount | number: '1.0-2' }}</span>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap: var(--space-sm)">
            @if (paid(invoice)) {
              <span class="chip okc">Paid · {{ payMethod(invoice) }}</span>
              <a class="cta small quiet" [routerLink]="['/orders', invoice.orderId, 'invoice']">
                <span class="material-symbols-outlined" aria-hidden="true">download</span> Download PDF
              </a>
            } @else {
              <span class="chip accent">{{ invoice.paymentStatus.replaceAll('_', ' ') }}</span>
              <a class="cta small" [routerLink]="['/orders', invoice.orderId, 'invoice']">
                <span class="material-symbols-outlined" aria-hidden="true">receipt_long</span> View invoice
              </a>
            }
          </div>
        </div>
      </article>
    }

    <!-- GAP: no account-manager endpoint yet — desk identity below is the same
         factory support desk the approved W1 screen publishes, not a per-buyer
         assigned rep. Awaits a wholesale account-manager field in the API. -->
    <div class="section-head">
      <h2>Factory desk</h2>
      <span class="aside">Aba hub desk</span>
    </div>
    <section class="panel">
      <div class="oc-top">
        <div class="id-name">
          <span class="chip dark" style="padding: 10px 8px">YD</span>
          <div>
            <strong>Aba Wholesale Desk</strong>
            <p class="muted small" style="margin: 2px 0 0">Wholesale operations — Aba factory</p>
          </div>
        </div>
      </div>
      <div class="oc-actions">
        <a class="cta small outline" href="tel:+23418887400">
          <span class="material-symbols-outlined" aria-hidden="true">call</span> +234 1 888 7400
        </a>
        <!-- GAP: no verified WhatsApp business line yet (Termii/Twilio decision pending) -->
        <button class="cta small quiet" disabled title="WhatsApp desk line pending messaging-provider setup">
          <span class="material-symbols-outlined" aria-hidden="true">chat</span> WhatsApp desk
        </button>
      </div>
    </section>
  `,
})
export class HomePage implements OnInit {
  private readonly api = inject(ApiService);
  readonly pill = pill;
  readonly buyerName = signal<string | null>(null);
  readonly pricing = signal<Pricing | null>(null);
  readonly approved = signal(false);
  readonly invoices = signal<Invoice[]>([]);
  readonly notices = signal<Array<{ id: string; type: string; message: string; sentAt: string }>>([]);
  readonly message = signal<string | null>(null);

  readonly recent = computed(() => this.invoices().slice(0, 3));
  readonly openOrders = computed(
    () => this.invoices().filter((i) => !/delivered|cancelled|completed/.test(i.status)).length,
  );
  readonly awaitingPay = computed(
    () => this.invoices().filter((i) => !this.paid(i)).length,
  );
  readonly inTransit = computed(
    () => this.invoices().filter((i) => /shipped|transit|dispatch|out_for/.test(i.status)).length,
  );
  readonly lastOrder = computed(() => this.invoices()[0] ?? null);

  ngOnInit(): void {
    this.api.me().subscribe({ next: (m) => this.buyerName.set(m.name), error: () => undefined });
    this.api.pricing().subscribe({
      next: (p) => {
        this.pricing.set(p);
        this.approved.set(true);
      },
      error: () => this.approved.set(false),
    });
    this.api.invoices().subscribe({ next: (r) => this.invoices.set(r.data), error: () => undefined });
    this.api.notifications().subscribe({
      next: (r) => this.notices.set(r.data.slice(0, 3)),
      error: () => undefined,
    });
  }

  two(n: number): string {
    return n.toString().padStart(2, '0');
  }

  units(invoice: Invoice): number {
    return invoice.items.reduce((n, i) => n + i.quantity, 0);
  }

  paid(invoice: Invoice): boolean {
    return invoice.paymentStatus === 'paid';
  }

  payMethod(invoice: Invoice): string {
    return (invoice.payments[0]?.method ?? 'confirmed').replaceAll('_', ' ');
  }

  reorder(orderId: string): void {
    this.api.reorder(orderId).subscribe({
      next: (order) =>
        this.message.set(`Reorder placed: ${order.id.slice(0, 8)} — repriced at your current tier.`),
      error: (err) => this.message.set(err?.error?.message ?? 'Reorder failed.'),
    });
  }
}
