import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, AuditEntry, Dashboard, LowStock } from '../api.service';

type RangeKey = 'today' | '7d' | '30d' | 'custom';

/** The owner's one-glance home (UX requirement #5): sales today, profit/loss,
    low stock, production status, pending approvals — plus sales-by-channel,
    marketing sources and recent audit activity. Shows shimmer skeletons in the
    shape of the real content while the dashboard loads. */
@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dash-head">
      <p class="eyebrow">Operations overview</p>
      <h1>Dashboard</h1>
      <div class="range" role="group" aria-label="Date range">
        @for (r of ranges; track r.key) {
          <button type="button" [class.on]="range() === r.key" (click)="setRange(r.key)">
            {{ r.label }}
          </button>
        }
      </div>
      @if (range() === 'custom') {
        <p class="range-note">
          Custom ranges aren't wired to the Analytics API yet — showing the live overview for now.
        </p>
      }
    </div>

    @if (dashboard(); as d) {
      <div class="tiles">
        <div class="tile">
          <span class="label">Sales today</span>
          <strong>{{ d.salesToday.orders }}</strong>
          <span class="sub">₦{{ d.salesToday.revenue | number: '1.0-2' }}</span>
        </div>
        <div class="tile" [class.negative]="d.profitLoss.net < 0">
          <span class="label">Net (profit/loss)</span>
          <strong>₦{{ d.profitLoss.net | number: '1.0-2' }}</strong>
          <span class="sub">in ₦{{ d.profitLoss.income | number: '1.0-0' }} / out ₦{{ d.profitLoss.expenditure | number: '1.0-0' }}</span>
        </div>
        <a class="tile alert" routerLink="/approvals" [class.ok]="d.pendingApprovals === 0">
          <span class="label">Pending approvals</span>
          <strong>{{ d.pendingApprovals }}</strong>
          <span class="sub">tap to review</span>
        </a>
        <div class="tile" [class.alert]="d.inventory.lowStockMaterialCount > 0">
          <span class="label">Low-stock materials</span>
          <strong>{{ d.inventory.lowStockMaterialCount }}</strong>
          <span class="sub">{{ d.inventory.finishedGoodsUnits }} finished units in stock</span>
        </div>
      </div>

      <div class="cols">
        <section class="panel lead">
          <h2>Sales by channel</h2>
          @if (d.salesByChannel.length === 0) { <p class="muted">No sales recorded yet.</p> }
          @for (row of d.salesByChannel; track row.channel) {
            <div class="bar-row">
              <span class="bar-name">{{ row.channel }}</span>
              <span class="bar-track"><i [style.width]="barWidth(d.salesByChannel, row.revenue)"></i></span>
              <span class="bar-val">{{ row.orders }} orders · ₦{{ row.revenue | number: '1.0-2' }}</span>
            </div>
          }
          <h2>Marketing sources</h2>
          @for (row of d.marketingSourcePerformance; track row.source) {
            <div class="bar-row">
              <span class="bar-name">{{ row.source }}</span>
              <span class="bar-track"><i [style.width]="barWidth(d.marketingSourcePerformance, row.revenue)"></i></span>
              <span class="bar-val">{{ row.orders }} orders · ₦{{ row.revenue | number: '1.0-2' }}</span>
            </div>
          }
        </section>

        <section class="panel">
          <h2>Recent activity</h2>
          @if (activity().length === 0) {
            <p class="muted">No recent activity.</p>
          }
          <ul class="activity">
            @for (entry of activity(); track entry.id) {
              <li>
                <time [attr.datetime]="entry.timestamp">{{ formatTime(entry.timestamp) }}</time>
                <span class="act-action">{{ entry.action }}</span>
              </li>
            }
          </ul>
        </section>

        <section class="panel">
          <h2>Production</h2>
          @if (d.production.length === 0) { <p class="muted">No active batches.</p> }
          @for (row of d.production; track row.stage) {
            <p>{{ row.stage }} — <strong>{{ row.batches }}</strong> batch(es)</p>
          }
        </section>

        <section class="panel">
          <h2>Best sellers</h2>
          @for (row of bestSellers(); track row.sku) {
            <p><code>{{ row.sku }}</code> {{ row.productName }} — {{ row.unitsSold }} sold</p>
          }
          <h2>Low stock</h2>
          @for (m of d.inventory.lowStockMaterials; track m.name) {
            <p class="error">{{ m.name }}: {{ m.currentQuantity }} left (reorder at {{ m.reorderThreshold }})</p>
          }
        </section>

        <section class="panel">
          <h2>Reorder list</h2>
          @if (lowStock(); as ls) {
            <p class="muted small">Materials under their reorder level, and finished
              variants at or below {{ ls.variantThreshold }} units.</p>
            @if (ls.materials.length === 0 && ls.variants.length === 0) {
              <p class="success">Nothing needs reordering.</p>
            }
            @for (m of ls.materials; track m.id) {
              <p><span class="chip bad">material</span> {{ m.name }} —
                {{ m.currentQuantity }} {{ m.unit }} left, reorder at {{ m.reorderThreshold }}</p>
            }
            @for (v of ls.variants; track v.variantId) {
              <p><span class="chip warn">finished</span>
                <code>{{ skuFor(v.variantId) }}</code> — {{ v.currentQuantity }} units left</p>
            }
          } @else {
            <p class="muted">Loading reorder list…</p>
          }
        </section>
      </div>
    } @else {
      <div class="tiles" aria-hidden="true">
        @for (k of skeletonKpis; track k) {
          <div class="tile">
            <span class="skeleton line" [style.width]="k % 2 === 0 ? '55%' : '40%'"></span>
            <span class="skeleton stat" [style.width]="k % 3 === 0 ? '34%' : '28%'"></span>
            <span class="skeleton line" [style.width]="k % 2 === 0 ? '40%' : '55%'"></span>
          </div>
        }
      </div>
      <div class="cols" aria-hidden="true">
        <section class="panel lead">
          <span class="skeleton line" [style.width]="'42%'"></span>
          @for (w of skeletonBars; track w) {
            <span class="skeleton track" [style.width]="w"></span>
          }
        </section>
        <section class="panel">
          <span class="skeleton line" [style.width]="'46%'"></span>
          @for (row of skeletonRows; track row) {
            <span class="skeleton line" [style.width]="(90 - row * 7) + '%'"></span>
          }
        </section>
        <section class="panel">
          <span class="skeleton line" [style.width]="'34%'"></span>
          @for (row of skeletonRows; track row) {
            <span class="skeleton line" [style.width]="(86 - row * 6) + '%'"></span>
          }
        </section>
        <section class="panel">
          <span class="skeleton line" [style.width]="'38%'"></span>
          @for (row of skeletonRows; track row) {
            <span class="skeleton line" [style.width]="(88 - row * 8) + '%'"></span>
          }
        </section>
      </div>
    }
  `,
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly dashboard = signal<Dashboard | null>(null);
  readonly bestSellers = signal<Array<{ sku: string; productName: string; unitsSold: number; revenue: number }>>([]);
  readonly lowStock = signal<LowStock | null>(null);
  readonly activity = signal<AuditEntry[]>([]);
  readonly range = signal<RangeKey>('today');
  /** variantId → SKU, so the reorder list names pieces instead of UUIDs. */
  private readonly skus = signal<Map<string, string>>(new Map());

  readonly ranges: Array<{ key: RangeKey; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: 'custom', label: 'Custom' },
  ];
  readonly skeletonKpis = [0, 1, 2, 3];
  readonly skeletonBars = ['94%', '78%', '62%', '41%'];
  readonly skeletonRows = [0, 1, 2, 3];

  ngOnInit(): void {
    this.api.dashboard().subscribe((d) => this.dashboard.set(d));
    this.api.bestSellers().subscribe((b) => this.bestSellers.set(b));
    this.api.lowStock().subscribe((ls) => this.lowStock.set(ls));
    this.api.auditLog().subscribe((log) => this.activity.set(log.data.slice(0, 5)));
    this.api.products().subscribe((res) => {
      const map = new Map<string, string>();
      for (const p of res.data) {
        for (const v of (p['variants'] as Array<Record<string, unknown>>) ?? []) {
          map.set(String(v['id']), String(v['sku']));
        }
      }
      this.skus.set(map);
    });
  }

  setRange(key: RangeKey): void {
    if (this.range() === key) return;
    this.range.set(key);
    if (key === 'custom') return;
    // The Analytics API has no range parameter yet, so this re-pulls the same
    // live dashboard — the control exists so a real backend range lands cleanly.
    const current = this.dashboard();
    if (!current) return;
    this.dashboard.set(null);
    this.api.dashboard().subscribe((d) => this.dashboard.set(d));
  }

  skuFor(variantId: string): string {
    return this.skus().get(variantId) ?? variantId.slice(0, 8);
  }

  barWidth(rows: Array<{ revenue: number }>, revenue: number): string {
    const max = Math.max(...rows.map((r) => r.revenue), 1);
    const pct = max > 0 ? Math.max(3, Math.round((revenue / max) * 100)) : 0;
    return `${pct}%`;
  }

  formatTime(ts: string): string {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return new Intl.DateTimeFormat('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }
}