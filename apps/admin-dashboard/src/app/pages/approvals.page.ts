import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Approval } from '../api.service';
import { BrandAlertService } from '../brand-alert.service';

/** A14 — Management approvals queue. Approved Stitch layout: compliance strip,
    per-request dossier cards with the payload decoded into an impact table,
    approve/reject actions, and the decision history below. Decisions stay
    server-side gated (architectural principle #3). */
@Component({
  selector: 'app-approvals',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Approvals · who asked & what changed</p>
        <h1>Management approval queue</h1>
        <p class="ops-sub">Price changes, purchasing, production starts and stock removals wait here — nothing proceeds without a decision.</p>
      </div>
      <div class="ops-actions">
        <span class="live-chip">Live</span>
        <span class="chip warn">{{ approvals().length }} pending</span>
      </div>
    </div>

    <div class="ops-toolbar">
      <div class="seg" role="group" aria-label="Filter pending approvals by type">
        <button type="button" [class.on]="typeFilter() === ''" (click)="typeFilter.set('')">All <span class="seg-n">{{ approvals().length }}</span></button>
        @for (g of groups(); track g.type) {
          <button type="button" [class.on]="typeFilter() === g.type" (click)="typeFilter.set(g.type)">
            {{ g.type.replaceAll('_', ' ') }} <span class="seg-n">{{ g.count }}</span>
          </button>
        }
      </div>
    </div>

    @if (visible().length === 0) {
      <div class="empty-state ok">
        <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
        <h2 class="empty-state-title">Nothing pending{{ typeFilter() ? ' for this type' : '' }}</h2>
        <p class="empty-state-sub">Every request has been decided.</p>
      </div>
    }

    @for (approval of visible(); track approval.id) {
      <section class="panel">
        <div class="panel-head">
          <h2>{{ title(approval.actionType) }}</h2>
          <span class="chip acid">{{ approval.actionType.replaceAll('_', ' ') }}</span>
          <span class="ph-sub">REF {{ approval.id.slice(0, 8) }} · {{ approval.createdAt | date: 'd MMM y, HH:mm' }} WAT</span>
          <span class="ph-end mini-note">Requested by {{ approval.requestedBy.name }}</span>
        </div>

        @if (priceChange(approval); as pc) {
          <div class="kpi-bar" style="margin-bottom:0.7rem;">
            <div class="kpi"><span class="kpi-label">Current price</span><span class="kpi-value">₦{{ pc.from | number: '1.0-0' }}</span><span class="kpi-sub">{{ pc.product }}</span></div>
            <div class="kpi"><span class="kpi-label">Proposed</span><span class="kpi-value">₦{{ pc.to | number: '1.0-0' }}</span>
              <span class="kpi-sub delta" [class.plus]="pc.to >= pc.from" [class.minus]="pc.to < pc.from">{{ pc.deltaPct }}% {{ pc.to >= pc.from ? 'increase' : 'decrease' }}</span></div>
          </div>
        } @else {
          <dl class="kv">
            @for (kv of payloadEntries(approval); track kv[0]) {
              <dt>{{ kv[0] }}</dt><dd class="wrap-anywhere">{{ kv[1] }}</dd>
            }
          </dl>
        }

        <div class="actions">
          <button class="cta small" (click)="decide(approval.id, 'approved')">✓ Approve & execute</button>
          <button class="danger" (click)="decide(approval.id, 'rejected')">✕ Reject</button>
          <!-- GAP: the reference attaches a written justification to each decision; the
               decide endpoint accepts only approved/rejected, no note field. -->
        </div>
      </section>
    }
    @if (error()) { <p class="error">{{ error() }}</p> }

    <div class="panel-head" style="margin-top:1.4rem;">
      <h2>Decision history</h2>
      <span class="ph-end">
        <select class="table-filter" [(ngModel)]="historyFilter" name="hf" (ngModelChange)="loadHistory()">
          <option value="">all</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>
      </span>
    </div>
    <table class="table">
      <thead><tr><th>Ref</th><th>Action</th><th>Requested by</th><th>Status</th><th>When</th></tr></thead>
      <tbody>
        @for (h of history(); track h.id) {
          <tr>
            <td class="mono small">{{ h.id.slice(0, 8) }}</td>
            <td>{{ h.actionType.replaceAll('_', ' ') }}</td>
            <td class="small">{{ h.requestedBy.name }}</td>
            <td><span class="chip" [class.ok]="h.status === 'approved'" [class.bad]="h.status === 'rejected'" [class.warn]="h.status === 'pending'">{{ h.status }}</span></td>
            <td class="mono small">{{ h.createdAt | date: 'MMM d, HH:mm' }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class ApprovalsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(BrandAlertService);
  readonly approvals = signal<Approval[]>([]);
  readonly history = signal<Approval[]>([]);
  readonly error = signal<string | null>(null);
  readonly typeFilter = signal('');
  historyFilter = '';

  ngOnInit(): void {
    this.load();
    this.loadHistory();
  }

  readonly groups = computed(() => {
    const counts = new Map<string, number>();
    for (const a of this.approvals()) counts.set(a.actionType, (counts.get(a.actionType) ?? 0) + 1);
    return [...counts.entries()].map(([type, count]) => ({ type, count }));
  });

  visible(): Approval[] {
    const t = this.typeFilter();
    return t ? this.approvals().filter((a) => a.actionType === t) : this.approvals();
  }

  title(actionType: string): string {
    switch (actionType) {
      case 'price_change': return 'Target retail price revision';
      case 'purchasing': return 'Purchase order — raw materials';
      case 'production_start': return 'Production batch allocation';
      case 'stock_disposal': return 'Stock removal / write-off';
      default: return actionType.replaceAll('_', ' ');
    }
  }

  /** Decoded price-change payload for the before/after impact tiles. */
  priceChange(a: Approval): { product: string; from: number; to: number; deltaPct: string } | null {
    if (a.actionType !== 'price_change') return null;
    const p = a.payload as Record<string, unknown> | null;
    const from = Number(p?.['from']);
    const to = Number(p?.['to']);
    if (!p || Number.isNaN(from) || Number.isNaN(to)) return null;
    const deltaPct = from > 0 ? (Math.round(((to - from) / from) * 1000) / 10).toFixed(1) : '—';
    return { product: String(p['product'] ?? ''), from, to, deltaPct };
  }

  payloadEntries(a: Approval): Array<[string, string]> {
    const p = a.payload;
    if (!p || typeof p !== 'object') return [['payload', String(p ?? '—')]];
    return Object.entries(p as Record<string, unknown>).map(([k, v]) => [
      k.replace(/([A-Z])/g, ' $1').toLowerCase(),
      typeof v === 'object' ? JSON.stringify(v) : String(v),
    ]);
  }

  private load(): void {
    this.api.pendingApprovals().subscribe((a) => this.approvals.set(a));
  }

  loadHistory(): void {
    this.api.approvalsHistory(this.historyFilter || undefined).subscribe((res) => this.history.set(res.data));
  }

  async decide(id: string, decision: 'approved' | 'rejected'): Promise<void> {
    const a = this.approvals().find((x) => x.id === id);
    const label = a ? this.title(a.actionType) : 'this request';
    const ok = await this.alerts.confirm({
      title: decision === 'approved' ? 'Approve & execute?' : 'Reject request?',
      html: `${label} — the decision is written to the audit log and cannot be reversed.`,
      confirm: decision === 'approved' ? 'Approve' : 'Reject',
      danger: decision === 'rejected',
      icon: decision === 'approved' ? 'warning' : 'error',
    });
    if (!ok) return;
    this.api.decideApproval(id, decision).subscribe({
      next: () => {
        this.load();
        this.loadHistory();
        void this.alerts.toast(`${label} ${decision}`);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Decision failed.');
        void this.alerts.toast('Decision failed', { icon: 'error' });
      },
    });
  }
}
