import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, ReturnRequest } from '../api.service';

/** A11 — Customer returns quarantine & inspection desk. Approved Stitch
    layout: intake KPIs, live intake registry with SLA countdowns, and a
    grading inspector that resolves each RMA (restock vs damaged — the
    existing disposition flow). 12h request / 24h completion windows are
    enforced server-side. */
@Component({
  selector: 'app-returns',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Operations · Returns & inspection</p>
        <h1>Customer returns & inspection queue</h1>
        <p class="ops-sub">Check returned items, decide what happens to them, and authorise restocking.</p>
      </div>
      <div class="ops-actions">
        <span class="live-chip">Intake live</span>
      </div>
    </div>

    <div class="kpi-bar">
      <div class="kpi" [class.kpi-action]="pendingCount() > 0">
        <span class="kpi-label">Pending inspections</span>
        <span class="kpi-value">{{ pendingCount() }}</span>
        <span class="kpi-sub">waiting to be checked</span>
      </div>
      <div class="kpi"><span class="kpi-label">Units in quarantine</span><span class="kpi-value">{{ pendingUnits() }}</span><span class="kpi-sub">across open requests</span></div>
      <div class="kpi"><span class="kpi-label">Overdue returns</span><span class="kpi-value" [class.error]="overdueCount() > 0">{{ overdueCount() }}</span><span class="kpi-sub">past the 24h physical-return deadline</span></div>
      <div class="kpi"><span class="kpi-label">Total requests</span><span class="kpi-value">{{ returns().length }}</span><span class="kpi-sub">in the current window</span></div>
      <div class="kpi"><span class="kpi-label">Refund exposure</span><span class="kpi-value">₦{{ openRefundExposure() | number: '1.0-0' }}</span><span class="kpi-sub">unit price × qty on open returns</span></div>
    </div>

    <p class="rule-strip">RETURN WINDOWS // request within 12h of receipt · complete within 24h · custom orders excluded — enforced by the API.</p>

    <div class="ops-toolbar">
      <span class="search"><input placeholder="Search by SKU, ref or reason…" [(ngModel)]="query" name="q" aria-label="Search returns" /></span>
      <div class="seg" role="group" aria-label="Status filter">
        <button type="button" [class.on]="statusFilter() === ''" (click)="statusFilter.set('')">All returns <span class="seg-n">{{ returns().length }}</span></button>
        @for (g of statusGroups(); track g.status) {
          <button type="button" [class.on]="statusFilter() === g.status" (click)="statusFilter.set(g.status)">
            {{ g.status.replaceAll('_', ' ') }} <span class="seg-n">{{ g.count }}</span>
          </button>
        }
      </div>
    </div>

    <div class="side-split">
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Return</th><th>Item</th><th>Reason</th><th>Requested</th><th>Return deadline</th><th>Status</th></tr></thead>
          <tbody>
            @for (r of visible(); track r.id) {
              <tr class="clickable" [class.sel]="selected()?.id === r.id" (click)="select(r)">
                <td><code>RET-{{ r.id.slice(0, 6) }}</code><br /><span class="mini-note">order {{ r.order.id.slice(0, 8) }}</span></td>
                <td><strong>{{ r.variant.sku }}</strong> × {{ r.quantity }}</td>
                <td class="small">“{{ r.reason }}”</td>
                <td class="mono small">{{ r.requestedAt | date: 'MMM d, HH:mm' }}</td>
                <td>
                  @if (r.status === 'requested') {
                    <span class="chip" [class.bad]="isOverdue(r)" [class.warn]="!isOverdue(r)">{{ deadlineLabel(r) }}</span>
                  } @else {
                    <span class="mono small muted">{{ r.returnDeadline | date: 'MMM d, HH:mm' }}</span>
                  }
                </td>
                <td><span class="chip" [class.warn]="r.status === 'requested'" [class.ok]="r.status !== 'requested'">{{ r.status.replaceAll('_', ' ') }}</span></td>
              </tr>
            }
            @if (visible().length === 0) { <tr><td colspan="6" class="muted small">No returns in this view.</td></tr> }
          </tbody>
        </table>
      </div>

      <aside class="inspector">
        @if (selected(); as r) {
          <div class="insp-head">
            <h2>RET-{{ r.id.slice(0, 6) }}</h2>
            <span class="chip" [class.warn]="r.status === 'requested'" [class.ok]="r.status !== 'requested'">{{ r.status.replaceAll('_', ' ') }}</span>
          </div>
          <dl class="kv">
            <dt>Item</dt><dd>{{ r.variant.sku }} × {{ r.quantity }}</dd>
            <dt>Order</dt><dd><code>{{ r.order.id.slice(0, 8) }}</code></dd>
            @if (r.refundAmount != null) {
              <dt class="naira">Refund exposure</dt><dd class="naira">₦{{ r.refundAmount | number: '1.0-2' }}</dd>
            }
            <dt>Reason</dt><dd>“{{ r.reason }}”</dd>
            <dt>Requested</dt><dd>{{ r.requestedAt | date: 'medium' }}</dd>
            <dt>Return due</dt><dd [class.error]="isOverdue(r)">{{ r.returnDeadline | date: 'medium' }} ({{ deadlineLabel(r) }})</dd>
            @if (r.bayTag) { <dt>Quarantine bay tag</dt><dd class="mono">{{ r.bayTag }}</dd> }
            @if (r.photoUrls && r.photoUrls.length > 0) {
              <dt>Evidence photos</dt>
              <dd>
                @for (u of r.photoUrls; track u) {
                  <a [href]="u" target="_blank" rel="noopener" class="link">{{ u }}</a><br />
                }
              </dd>
            }
          </dl>

          @if (r.status === 'requested') {
            <div class="gap-sep"></div>
            <div class="panel-head"><h2>Check condition & decide</h2></div>
            <label>Inspection note (required)
              <input [(ngModel)]="resolutions[r.id]" name="res" placeholder="e.g. tags intact, refund issued / seam damage" />
            </label>
            <label>Evidence photo URL(s) <span class="mini-note">comma-separated</span>
              <input [(ngModel)]="photoUrls[r.id]" name="photos" placeholder="https://…/front.jpg, https://…/detail.jpg" />
            </label>
            <label>Quarantine bay tag
              <input [(ngModel)]="bayTags[r.id]" name="bay" placeholder="Q-B7 (printed QR, attach to item)" />
            </label>
            <div class="attention">
              <div class="att-item">
                <span class="att-tag">Grade A/B · Pristine or mint-grade</span>
                <p class="att-body">Original packaging and tags intact — put it back into sellable stock.</p>
                <span class="att-act"><button class="cta small" (click)="resolve(r.id, 'restocked')">✓ Approve & restock</button></span>
              </div>
              <div class="att-item crit">
                <span class="att-tag">Grade C · Irreparable / compromised</span>
                <p class="att-body">Damaged, worn or contaminated — quarantine as damaged; excluded from stock.</p>
                <span class="att-act"><button class="danger" (click)="resolve(r.id, 'damaged')">✕ Resolve as damaged</button></span>
              </div>
            </div>
          } @else {
            <p class="success small">This return has been resolved — the outcome is recorded in Inventory and the Activity log.</p>
          }
        } @else {
          <p class="muted small">Select a return to check the item and decide what happens to it.</p>
        }
      </aside>
    </div>

    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class ReturnsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly returns = signal<ReturnRequest[]>([]);
  readonly error = signal<string | null>(null);
  readonly selected = signal<ReturnRequest | null>(null);
  readonly statusFilter = signal('');
  query = '';
  resolutions: Record<string, string> = {};
  photoUrls: Record<string, string> = {};
  bayTags: Record<string, string> = {};

  ngOnInit(): void {
    this.query = this.route.snapshot.queryParamMap.get('q') ?? '';
    this.load();
  }

  private load(): void {
    this.api.returns().subscribe((res) => {
      this.returns.set(res.data);
      const sel = this.selected();
      if (sel) this.selected.set(res.data.find((r) => r.id === sel.id) ?? null);
    });
  }

  readonly pendingCount = computed(() => this.returns().filter((r) => r.status === 'requested').length);
  readonly pendingUnits = computed(() => this.returns().filter((r) => r.status === 'requested').reduce((s, r) => s + r.quantity, 0));
  readonly overdueCount = computed(() => this.returns().filter((r) => r.status === 'requested' && this.isOverdue(r)).length);
  readonly openRefundExposure = computed(() =>
    this.returns().filter((r) => r.status === 'requested').reduce((s, r) => s + (Number(r.refundAmount) || 0), 0));
  readonly statusGroups = computed(() => {
    const counts = new Map<string, number>();
    for (const r of this.returns()) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return [...counts.entries()].map(([status, count]) => ({ status, count }));
  });

  visible(): ReturnRequest[] {
    const s = this.statusFilter();
    const q = this.query.trim().toLowerCase();
    return this.returns().filter((r) => {
      if (s && r.status !== s) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.variant.sku.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    });
  }

  select(r: ReturnRequest): void {
    this.selected.set(this.selected()?.id === r.id ? null : r);
  }

  isOverdue(r: ReturnRequest): boolean {
    return new Date(r.returnDeadline).getTime() < Date.now();
  }

  /** SLA countdown chip, derived from the real 24h deadline. */
  deadlineLabel(r: ReturnRequest): string {
    const ms = new Date(r.returnDeadline).getTime() - Date.now();
    if (Number.isNaN(ms)) return '—';
    const h = Math.floor(Math.abs(ms) / 3_600_000);
    const m = Math.floor((Math.abs(ms) % 3_600_000) / 60_000);
    return ms < 0 ? `overdue ${h}h ${m}m` : `${h}h ${m}m left`;
  }

  resolve(id: string, disposition: 'restocked' | 'damaged'): void {
    const resolution = this.resolutions[id]?.trim();
    if (!resolution) {
      this.error.set('Enter an inspection note first.');
      return;
    }
    const photos = (this.photoUrls[id] ?? '').split(',').map((u) => u.trim()).filter((u) => u.length > 0);
    const bay = (this.bayTags[id] ?? '').trim();
    this.error.set(null);
    this.api.resolveReturnWithEvidence(id, resolution, disposition, photos, bay || undefined).subscribe({
      next: () => {
        delete this.resolutions[id];
        delete this.photoUrls[id];
        delete this.bayTags[id];
        this.load();
      },
      error: (err) => this.error.set(err?.error?.message ?? 'Resolution failed.'),
    });
  }
}
