import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Invoice, Pricing } from '../api.service';
import { pill } from '../status-pill';

/**
 * W6 — Orders & invoices: procurement log stats, status filter chips,
 * order/date filters, batch cards with contextual actions, and a real
 * CSV batch-statement export built from the live invoice ledger.
 */
@Component({
  selector: 'app-orders',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="panel">
      <div class="tagbar">
        <span><span class="material-symbols-outlined" style="font-size:14px; vertical-align:-2px"
          aria-hidden="true">receipt_long</span> Procurement log</span>
        <span>{{ today | date: 'MMM yyyy' }}</span>
      </div>
      <div class="stat-grid" style="margin:0">
        <div class="stat">
          <span class="s-label">Active commitments</span>
          <strong class="tabular">₦{{ activeCommitments() | number: '1.0-2' }}</strong>
          <span class="s-sub">{{ openBatches() }} batch{{ openBatches() === 1 ? '' : 'es' }} in pipeline</span>
        </div>
        <div class="stat">
          <span class="s-label">Lifetime volume</span>
          <strong class="tabular">{{ lifetimeUnits() }} units</strong>
          <span class="s-sub">{{ tierLabel() }}</span>
        </div>
      </div>
    </section>

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
        <input type="search" [(ngModel)]="query" name="q"
          placeholder="Filter by order #, SKU…" aria-label="Filter orders" />
      </div>
      <select [(ngModel)]="range" name="range" aria-label="Date range">
        <option value="90">Last 90 days</option>
        <option value="365">Last 12 months</option>
        <option value="all">All time</option>
      </select>
    </div>

    @if (filtered().length === 0) {
      <p class="muted">No wholesale orders match the current filter.</p>
    }
    @for (invoice of filtered(); track invoice.orderId) {
      <article class="ordercard">
        <div class="oc-top">
          <div>
            <span class="oc-id">#SNT-{{ invoice.orderId.slice(0, 8).toUpperCase() }}
              @if (!isPaid(invoice)) { <span class="chip accent">Action req</span> }
              @else if (isDelivered(invoice)) { <span class="chip">Archived</span> }
              @else { <span class="chip soft">Batch run</span> }
            </span>
            <span class="oc-meta">{{ invoice.createdAt | date: 'dd MMM yyyy' }} · Factory batch</span>
          </div>
          <div class="oc-amount">
            <strong>₦{{ invoice.totalAmount | number: '1.0-2' }}</strong>
            <span>{{ units(invoice) }} units</span>
          </div>
        </div>

        <div class="oc-line">
          <span>
            <span class="l">Batch contents</span>
            @for (item of invoice.items; track item.sku) {
              <span class="small">{{ item.quantity }}× <code>{{ item.sku }}</code>
                @if (!$last) { · } </span>
            }
          </span>
        </div>

        <div class="oc-chips">
          <span class="status" [class]="'status ' + pill(invoice.paymentStatus)">
            {{ isPaid(invoice) ? 'Paid · ' + payMethod(invoice) : invoice.paymentStatus.replaceAll('_', ' ') }}
          </span>
          <span class="status" [class]="'status ' + pill(invoice.status)">
            {{ invoice.status.replaceAll('_', ' ') }}
          </span>
        </div>

        <div class="oc-actions">
          @if (!isPaid(invoice)) {
            <!-- GAP: no payment-slip upload endpoint — the desk verifies transfers;
                 the pro-forma stands in for the reference's UPLOAD SLIP action. -->
            <a class="cta small" [routerLink]="['/orders', invoice.orderId, 'invoice']">
              <span class="material-symbols-outlined" aria-hidden="true">description</span> Pro-forma
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
              <span class="material-symbols-outlined" aria-hidden="true">download</span> Invoice (PDF)
            </a>
            <button class="cta small outline" (click)="reorder(invoice.orderId)">
              <span class="material-symbols-outlined" aria-hidden="true">sync</span> Reorder batch
            </button>
          }
        </div>
      </article>
    }
    @if (message()) { <p class="success">{{ message() }}</p> }

    <button class="cta outline" style="width:100%; margin-top: var(--space-lg)"
      (click)="exportCsv()" [disabled]="invoices().length === 0">
      <span class="material-symbols-outlined" aria-hidden="true">table_view</span>
      Export batch statement (CSV)
    </button>
    <p class="muted small" style="text-align:center; margin-top: var(--space-sm)">
      <span class="material-symbols-outlined" style="font-size:13px; vertical-align:-2px"
        aria-hidden="true">lock</span>
      Statements are generated from the live order ledger — every movement is audit-logged.
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
  query = '';
  range: '90' | '365' | 'all' = '90';

  readonly activeCommitments = computed(() =>
    this.invoices()
      .filter((i) => !this.isDelivered(i))
      .reduce((n, i) => n + i.totalAmount, 0),
  );
  readonly openBatches = computed(() => this.invoices().filter((i) => !this.isDelivered(i)).length);
  readonly lifetimeUnits = computed(() =>
    this.invoices().reduce((n, i) => n + this.units(i), 0),
  );
  readonly statusCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const i of this.invoices()) counts.set(i.status, (counts.get(i.status) ?? 0) + 1);
    return [...counts.entries()].map(([key, count]) => ({
      key,
      count,
      label: key.replaceAll('_', ' '),
    }));
  });

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
    const cutoff =
      this.range === 'all' ? 0 : Date.now() - Number(this.range) * 24 * 60 * 60 * 1000;
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

  units(invoice: Invoice): number {
    return invoice.items.reduce((n, i) => n + i.quantity, 0);
  }

  isPaid(invoice: Invoice): boolean {
    return invoice.paymentStatus === 'paid';
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
        this.message.set(`Reorder placed: ${order.id.slice(0, 8)} — repriced at your current tier.`);
        this.api.invoices().subscribe((res) => this.invoices.set(res.data));
      },
      error: (err) => this.message.set(err?.error?.message ?? 'Reorder failed.'),
    });
  }

  /** Real export: the visible ledger, one row per invoice line. */
  exportCsv(): void {
    const rows = [
      ['order_id', 'created_at', 'status', 'payment_status', 'sku', 'quantity', 'unit_price', 'line_total', 'order_total'],
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
