import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminOrder, AnalyticsRange, ApiService, Approval, AuditEntry, Dashboard, LowStock } from '../api.service';

interface SellerRow { sku: string; productName: string; unitsSold: number; revenue: number }
interface ChartPoint { x: number; y: number; date: string; label: string; value: number }

/** Analytics-range control (folded into the approved A1 layout). */
const RANGE_KEYS: Array<{ key: AnalyticsRange; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'custom', label: 'Custom' },
];

const RANGE_LABEL: Record<string, string> = {
  today: 'today',
  '7d': 'the last 7 days',
  '30d': 'the last 30 days',
  custom: 'the selected range',
};

const ISO_DATE = (d: Date): string => d.toISOString().slice(0, 10);

/** A1 — Executive Operations Command (owner home). Approved Stitch layout:
    KPI command bar, range-scoped sales chart (server-bucketed by the
    Analytics API), needs-attention rail, manufacturing pipeline, best
    sellers / slow movers / critical materials. Every figure is bound to a
    live endpoint — nothing invented, gaps labeled. */
@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Executive Operations Command</p>
        <h1>Owner dashboard</h1>
        <p class="ops-sub">Single-factory operations · {{ today }} · {{ shiftLabel }}</p>
      </div>
      <div class="ops-actions">
        <span class="live-chip">Live sync</span>
        <button class="cta small ghost" type="button" (click)="exportSheet()">Export daily operations sheet</button>
        <a class="cta small" routerLink="/production">New batch request</a>
      </div>
    </div>

    <div class="dash-head range-wrap">
      <div class="range" role="group" aria-label="Analytics range">
        @for (r of rangeKeys; track r.key) {
          <button type="button" [class.on]="range() === r.key" (click)="setRange(r.key)">
            {{ r.label }}
          </button>
        }
      </div>
      @if (range() === 'custom') {
        <div class="range custom-range" role="group" aria-label="Custom range">
          <label class="range-field">From
            <input type="date" [value]="fromDate()" (change)="fromDate.set($any($event.target).value)" />
          </label>
          <label class="range-field">To
            <input type="date" [value]="toDate()" (change)="toDate.set($any($event.target).value)" />
          </label>
          <button type="button" class="cta small" (click)="load()">Apply</button>
        </div>
      }
      @if (loadError(); as err) {
        <p class="range-note error" role="alert">{{ err }}
          <button type="button" class="link" (click)="load()">Retry</button>
        </p>
      }
    </div>

    @if (dashboard(); as d) {
      <div class="kpi-bar">
        <div class="kpi">
          <span class="kpi-label">Sales today</span>
          <span class="kpi-value">₦{{ d.salesToday.revenue | number: '1.0-0' }}</span>
          <span class="kpi-sub">{{ d.salesToday.orders }} paid order(s) since midnight</span>
          @let revDelta = delta(d.metrics.revenue, d.metrics.priorRevenue);
          <span class="delta" [class.plus]="revDelta.cls === 'plus'" [class.minus]="revDelta.cls === 'minus'">{{ revDelta.text }} vs prior period</span>
          <svg class="spark" viewBox="0 0 100 26" preserveAspectRatio="none" role="img" aria-label="Revenue trend for the selected range">
            <polyline class="spark-line" [attr.points]="sparkPoints(revenueTrend())"></polyline>
          </svg>
          <span class="kpi-minis">
            @for (c of topChannels(); track c.channel) {
              <span class="chip">{{ c.channel.replaceAll('_', ' ') }} ₦{{ c.revenue | number: '1.0-0' }}</span>
            }
          </span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Net position</span>
          <span class="kpi-value" [class.error]="d.profitLoss.net < 0">₦{{ d.profitLoss.net | number: '1.0-0' }}</span>
          <span class="kpi-sub">in ₦{{ d.profitLoss.income | number: '1.0-0' }} · out ₦{{ d.profitLoss.expenditure | number: '1.0-0' }}</span>
          <span class="meter" [class.danger]="d.profitLoss.net < 0"><i [style.width]="incomeShare(d)"></i></span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Orders today</span>
          <span class="kpi-value">{{ d.salesToday.orders }}</span>
          <span class="kpi-sub">{{ transitCount() }} dispatch leg(s) in transit</span>
          @let odDelta = delta(d.metrics.openOrders, d.metrics.priorOpenOrders);
          <span class="delta" [class.plus]="odDelta.cls === 'plus'" [class.minus]="odDelta.cls === 'minus'">{{ odDelta.text }} vs prior period</span>
          <svg class="spark" viewBox="0 0 100 26" preserveAspectRatio="none" role="img" aria-label="Open orders trend for the selected range">
            <polyline class="spark-line" [attr.points]="sparkPoints(orderTrend())"></polyline>
          </svg>
          <span class="kpi-minis">
            @if (pendingReturns() > 0) { <span class="chip warn">{{ pendingReturns() }} return(s) awaiting</span> }
            @else { <span class="chip ok">0 returns waiting</span> }
          </span>
        </div>
        <div class="kpi kpi-action">
          <span class="kpi-label">Pending approvals</span>
          <span class="kpi-value">{{ d.pendingApprovals }}</span>
          <span class="kpi-minis">
            @for (g of approvalGroups(); track g.type) {
              <span class="chip acid">{{ g.count }} {{ g.type.replaceAll('_', ' ') }}</span>
            }
            @if (approvalGroups().length === 0) { <span class="chip ok">Queue clear</span> }
          </span>
          @if (d.trends.approvals.length > 1) {
            <svg class="spark" viewBox="0 0 100 26" preserveAspectRatio="none" role="img" aria-label="Pending approvals trend for the selected range">
              <polyline class="spark-line" [attr.points]="sparkPoints(d.trends.approvals)"></polyline>
            </svg>
          }
          <a class="cta small" routerLink="/approvals">Review approvals</a>
        </div>
      </div>

      <div class="ops-grid">
        <section class="panel flat">
          <div class="panel-head">
            <h2>Sales performance</h2>
            <span class="ph-sub">gross paid-order revenue · {{ rangeLabel() }}</span>
            <span class="ph-end naira stat-md">₦{{ chartTotal() | number: '1.0-0' }}</span>
          </div>
          @if (chartPoints().length > 1) {
            <div class="chart-wrap" (mouseleave)="hoverIdx.set(null)">
              <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img"
                   aria-label="Paid-order revenue by bucket for the selected range"
                   (mousemove)="onChartMove($event)">
                <!-- recessive grid -->
                @for (gy of gridYs; track gy) {
                  <line [attr.x1]="PAD" [attr.x2]="W - PAD" [attr.y1]="gy" [attr.y2]="gy"
                        stroke="var(--hairline)" stroke-width="1" />
                }
                <path [attr.d]="areaPath()" fill="var(--gold)" opacity="0.16" />
                <path [attr.d]="linePath()" fill="none" stroke="var(--acid-ink)" stroke-width="2"
                      stroke-linejoin="round" stroke-linecap="round" />
                @if (peak(); as p) {
                  <circle [attr.cx]="p.x" [attr.cy]="p.y" r="4" fill="var(--acid-ink)" stroke="var(--panel)" stroke-width="2" />
                }
                @if (hoverPoint(); as hp) {
                  <line [attr.x1]="hp.x" [attr.x2]="hp.x" [attr.y1]="PAD" [attr.y2]="H - PAD_B"
                        stroke="var(--hairline-2)" stroke-width="1" />
                  <circle [attr.cx]="hp.x" [attr.cy]="hp.y" r="4" fill="var(--acid-ink)" stroke="var(--panel)" stroke-width="2" />
                }
              </svg>
              @if (hoverPoint(); as hp) {
                <div class="chart-tip" [style.left.%]="(hp.x / W) * 100" [style.top.%]="(hp.y / H) * 100">
                  {{ hp.label }} · ₦{{ hp.value | number: '1.0-0' }}
                </div>
              }
              <div class="panel row-flat" style="display:flex;justify-content:space-between;">
                <span class="mini-note">{{ chartPoints()[0].label }}</span>
                @if (peak(); as p) { <span class="mini-note acid-text">Peak {{ p.label }} · ₦{{ p.value | number: '1.0-0' }}</span> }
                <span class="mini-note">{{ chartPoints()[chartPoints().length - 1].label }}</span>
              </div>
            </div>
            <p class="muted small">Buckets, totals and the prior-period delta are computed server-side by the
              Analytics API over {{ rangeLabel() }}. No data is invented.</p>
          } @else {
            <p class="muted">Not enough paid orders in {{ rangeLabel() }} to draw the trend yet.</p>
          }

          <div class="chan-legend">
            <p class="mini-note" style="margin:0.4rem 0 0;">Channel mix — all-time paid revenue</p>
            @for (row of d.salesByChannel; track row.channel; let i = $index) {
              <div class="cl-row">
                <span class="cl-mark" [class.m2]="i === 1" [class.m3]="i === 2"></span>
                <span class="cl-name">{{ row.channel.replaceAll('_', ' ') }}</span>
                <span class="cl-val">₦{{ row.revenue | number: '1.0-0' }} · {{ row.orders }} orders</span>
                <span class="cl-share">{{ share(d.salesByChannel, row.revenue) }}% share</span>
              </div>
            }
            @if (d.salesByChannel.length === 0) { <p class="muted small">No paid sales recorded yet.</p> }
          </div>
        </section>

        <aside>
          <section class="panel flat">
            <div class="panel-head">
              <h2>Needs your attention</h2>
              <span class="ph-end chip warn">{{ attention().length }} escalation(s)</span>
            </div>
            <div class="attention">
              @for (a of attention(); track a.key) {
                <div class="att-item" [class.crit]="a.severity === 'crit'" [class.warn]="a.severity === 'warn'">
                  <span class="att-tag">{{ a.tag }} <span>{{ a.when }}</span></span>
                  <p class="att-body" [innerText]="a.body"></p>
                  <span class="att-act">
                    <a class="link" [routerLink]="a.route">{{ a.action }}</a>
                  </span>
                </div>
              }
              @if (attention().length === 0) { <p class="success small">All clear — no escalations right now.</p> }
            </div>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Recent activity</h2><a class="link ph-end" routerLink="/audit">Audit log</a></div>
            @if (activity().length === 0) { <p class="muted small">No recent activity.</p> }
            <ul class="activity">
              @for (entry of activity(); track entry.id) {
                <li>
                  <time [attr.datetime]="entry.timestamp">{{ formatTime(entry.timestamp) }}</time>
                  <span class="act-action">{{ entry.action }}</span>
                </li>
              }
            </ul>
          </section>
        </aside>
      </div>

      <section class="panel">
        <div class="panel-head">
          <h2>Manufacturing floor active pipeline</h2>
          <span class="ph-sub">real-time batches across the factory stages</span>
          <span class="ph-end">
            <span class="mini-note">Active volume {{ activeUnits() | number }} pcs</span>
            <a class="link" routerLink="/production">Open production board</a>
          </span>
        </div>
        <div class="pipeline">
          @for (s of pipeline(); track s.stage; let i = $index) {
            <div class="stage-cell" [class.hot]="s.units > 0">
              <span class="st-idx">{{ (i + 1) | number: '2.0' }} · {{ s.stage }}</span>
              <p class="st-count">{{ s.units | number }} <small>pcs</small></p>
              <span class="st-sub">{{ s.batches }} batch(es)</span>
            </div>
          }
          @if (pipeline().length === 0) { <p class="muted small" style="padding:0.6rem;">No production batches yet.</p> }
        </div>
      </section>

      <div class="cols">
        <section class="panel flat">
          <div class="panel-head"><h2>Best sellers</h2><span class="ph-sub">paid orders, all-time</span></div>
          <table class="table">
            <thead><tr><th>Product / SKU</th><th>Sold</th><th>Revenue</th></tr></thead>
            <tbody>
              @for (row of bestSellers(); track row.sku) {
                <tr>
                  <td><strong>{{ row.productName }}</strong><br /><code class="small">{{ row.sku }}</code></td>
                  <td class="mono">{{ row.unitsSold }}</td>
                  <td class="mono">₦{{ row.revenue | number: '1.0-0' }}</td>
                </tr>
              }
              @if (bestSellers().length === 0) { <tr><td colspan="3" class="muted small">No paid sales yet.</td></tr> }
            </tbody>
          </table>
        </section>

        <section class="panel flat">
          <div class="panel-head"><h2>Slow movers</h2><span class="ph-sub">fewest units sold</span></div>
          <!-- GAP: warehouse aging & capital-locked value need stock-age data the API doesn't track;
               this ranks real sales (direction=slow) instead of inventing aging figures. -->
          <table class="table">
            <thead><tr><th>Product / SKU</th><th>Sold</th><th>Revenue</th></tr></thead>
            <tbody>
              @for (row of slowMovers(); track row.sku) {
                <tr>
                  <td><strong>{{ row.productName }}</strong><br /><code class="small">{{ row.sku }}</code></td>
                  <td class="mono">{{ row.unitsSold }}</td>
                  <td class="mono">₦{{ row.revenue | number: '1.0-0' }}</td>
                </tr>
              }
              @if (slowMovers().length === 0) { <tr><td colspan="3" class="muted small">No paid sales yet.</td></tr> }
            </tbody>
          </table>
          <a class="link" routerLink="/catalogue">Review catalogue</a>
        </section>

        <section class="panel flat">
          <div class="panel-head"><h2>Critical materials reserve</h2></div>
          @if (lowStock(); as ls) {
            @for (m of ls.materials; track m.id) {
              <div class="att-item crit" style="margin-bottom:0.5rem;">
                <span class="att-tag">Below threshold</span>
                <p class="att-body"><strong>{{ m.name }}</strong> — {{ m.currentQuantity }} {{ m.unit }} left (min {{ m.reorderThreshold }})</p>
              </div>
            }
            @for (v of ls.variants.slice(0, 5); track v.variantId) {
              <div class="att-item warn" style="margin-bottom:0.5rem;">
                <span class="att-tag">Finished goods thin</span>
                <p class="att-body"><strong>{{ skuFor(v.variantId) }}</strong> — {{ v.currentQuantity }} unit(s) left (floor {{ ls.variantThreshold }})</p>
              </div>
            }
            @if (ls.variants.length > 5) {
              <p class="mini-note">+{{ ls.variants.length - 5 }} more variant(s) at or below the floor — full list on the Inventory page.</p>
            }
            @if (ls.materials.length === 0 && ls.variants.length === 0) {
              <p class="success small">Nothing needs reordering.</p>
            }
            <a class="link" routerLink="/materials">Trigger POs in raw materials</a>
            @if (d.trends.lowStock.length > 1) {
              <svg class="spark" viewBox="0 0 100 26" preserveAspectRatio="none" role="img" aria-label="Low stock trend for the selected range">
                <polyline class="spark-line" [attr.points]="sparkPoints(d.trends.lowStock)"></polyline>
              </svg>
            }
          } @else {
            <p class="muted small">Loading reserve levels…</p>
          }
        </section>
      </div>
    } @else {
      <div class="kpi-bar" aria-hidden="true">
        @for (k of skeletonKpis; track k) {
          <div class="kpi">
            <span class="skeleton line" [style.width]="k % 2 === 0 ? '55%' : '40%'"></span>
            <span class="skeleton stat" [style.width]="k % 3 === 0 ? '34%' : '28%'"></span>
            <span class="skeleton line" [style.width]="k % 2 === 0 ? '40%' : '55%'"></span>
          </div>
        }
      </div>
      <div class="ops-grid" aria-hidden="true">
        <section class="panel flat">
          <span class="skeleton line" [style.width]="'42%'"></span>
          <span class="skeleton" style="height:180px;margin-top:0.6rem;"></span>
          @for (w of skeletonBars; track w) { <span class="skeleton track" [style.width]="w" style="margin-top:0.5rem;"></span> }
        </section>
        <section class="panel flat">
          <span class="skeleton line" [style.width]="'46%'"></span>
          @for (row of skeletonRows; track row) { <span class="skeleton line" [style.width]="(90 - row * 7) + '%'" style="margin-top:0.7rem;"></span> }
        </section>
      </div>
    }
  `,
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly dashboard = signal<Dashboard | null>(null);
  readonly bestSellers = signal<SellerRow[]>([]);
  readonly slowMovers = signal<SellerRow[]>([]);
  readonly lowStock = signal<LowStock | null>(null);
  readonly activity = signal<AuditEntry[]>([]);
  readonly pendingList = signal<Approval[]>([]);
  readonly recentOrders = signal<AdminOrder[]>([]);
  readonly ordersTotal = signal(0);
  readonly transitCount = signal(0);
  readonly transitFirst = signal<Record<string, unknown> | null>(null);
  readonly pendingReturns = signal(0);
  readonly firstReturn = signal<{ sku: string; deadline: string } | null>(null);
  readonly hoverIdx = signal<number | null>(null);
  /** Analytics range + custom date controls (server-bucketed). */
  readonly range = signal<AnalyticsRange>('today');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly loadError = signal<string | null>(null);
  readonly rangeKeys = RANGE_KEYS;
  /** variantId → SKU, so low-stock rows name pieces instead of UUIDs. */
  private readonly skus = signal<Map<string, string>>(new Map());

  readonly skeletonKpis = [0, 1, 2, 3];
  readonly skeletonBars = ['94%', '78%', '62%', '41%'];
  readonly skeletonRows = [0, 1, 2, 3, 4];

  // Chart geometry (SVG viewBox units)
  readonly W = 720;
  readonly H = 210;
  readonly PAD = 10;
  readonly PAD_B = 24;
  readonly gridYs = [10, 55, 100, 145, 186];

  readonly today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  readonly shiftLabel = (() => {
    const h = new Date().getHours();
    return h >= 7 && h < 19 ? 'Day shift window (07:00–19:00 WAT)' : 'After-hours window (19:00–07:00 WAT)';
  })();

  ngOnInit(): void {
    this.fromDate.set(ISO_DATE(new Date(Date.now() - 6 * 86_400_000)));
    this.toDate.set(ISO_DATE(new Date()));
    this.load();
    this.api.bestSellers('best').subscribe((b) => this.bestSellers.set(b));
    this.api.bestSellers('slow').subscribe((b) => this.slowMovers.set(b));
    this.api.lowStock().subscribe((ls) => this.lowStock.set(ls));
    this.api.auditLog({ limit: 6 }).subscribe((log) => this.activity.set(log.data.slice(0, 6)));
    this.api.pendingApprovals().subscribe((a) => this.pendingList.set(a));
    this.api.orders(undefined, 200).subscribe((res) => { this.recentOrders.set(res.data); this.ordersTotal.set(res.total); });
    this.api.returns().subscribe((res) => {
      const requested = res.data.filter((r) => r.status === 'requested');
      this.pendingReturns.set(requested.length);
      if (requested[0]) this.firstReturn.set({ sku: requested[0].variant.sku, deadline: requested[0].returnDeadline });
    });
    this.api.deliveries().subscribe((res) => {
      const rows = res.data as Array<Record<string, unknown>>;
      const transit = rows.filter((l) => l['status'] === 'in_transit');
      this.transitCount.set(transit.length);
      this.transitFirst.set(transit[0] ?? null);
    });
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

  /** Range switch + reload; Custom needs a From/To pair before firing. */
  setRange(key: AnalyticsRange): void {
    if (this.range() === key) return;
    this.range.set(key);
    this.load();
  }

  load(): void {
    const range = this.range();
    if (range === 'custom' && (!this.fromDate() || !this.toDate())) {
      this.loadError.set('Pick a From and To date, then Apply.');
      return;
    }
    this.loadError.set(null);
    const payload = range === 'custom'
      ? this.api.dashboard('custom', this.fromDate(), this.toDate())
      : this.api.dashboard(range);
    payload.subscribe({
      next: (d) => this.dashboard.set(d),
      error: (e) => this.loadError.set(e instanceof Error ? e.message : 'Could not load the overview.'),
    });
  }

  /** Approvals grouped by action type for the executive-action KPI. */
  readonly approvalGroups = computed(() => {
    const counts = new Map<string, number>();
    for (const a of this.pendingList()) counts.set(a.actionType, (counts.get(a.actionType) ?? 0) + 1);
    return [...counts.entries()].map(([type, count]) => ({ type, count }));
  });

  /** Sparkline series sourced from the Analytics API for the selected range. */
  readonly revenueTrend = computed(() => (this.dashboard()?.series ?? []).map((p) => p.revenue));
  readonly orderTrend = computed(() => (this.dashboard()?.series ?? []).map((p) => p.orders));
  readonly rangeLabel = computed(() => RANGE_LABEL[this.range()] ?? 'the selected range');

  readonly chartTotal = computed(() => this.dashboard()?.metrics.revenue ?? 0);

  /** Server-bucketed paid revenue for the selected range, drawn with the
      approved A1 chart geometry (hover, peak, recessed grid). */
  readonly chartPoints = computed<ChartPoint[]>(() => {
    const buckets = this.dashboard()?.series ?? [];
    if (buckets.length < 2) return [];
    const max = Math.max(...buckets.map((b) => b.revenue), 1);
    const innerW = this.W - this.PAD * 2;
    const innerH = this.H - this.PAD - this.PAD_B;
    return buckets.map((b, i) => ({
      x: this.PAD + (i / (buckets.length - 1)) * innerW,
      y: this.PAD + innerH - (b.revenue / max) * innerH,
      date: b.label,
      label: b.label,
      value: b.revenue,
    }));
  });

  readonly linePath = computed(() =>
    this.chartPoints().map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
  );
  readonly areaPath = computed(() => {
    const pts = this.chartPoints();
    if (pts.length === 0) return '';
    const base = this.H - this.PAD_B;
    return `${this.linePath()} L${pts[pts.length - 1].x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z`;
  });
  readonly peak = computed<ChartPoint | null>(() => {
    const pts = this.chartPoints().filter((p) => p.value > 0);
    if (pts.length === 0) return null;
    return pts.reduce((a, b) => (b.value > a.value ? b : a));
  });
  readonly hoverPoint = computed<ChartPoint | null>(() => {
    const i = this.hoverIdx();
    return i === null ? null : (this.chartPoints()[i] ?? null);
  });

  onChartMove(ev: MouseEvent): void {
    const svg = ev.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * this.W;
    const pts = this.chartPoints();
    if (pts.length === 0) return;
    let nearest = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - x) < Math.abs(pts[nearest].x - x)) nearest = i;
    this.hoverIdx.set(nearest);
  }

  /** Escalation rail — every item derives from a live queue. */
  readonly attention = computed(() => {
    const items: Array<{ key: string; tag: string; body: string; action: string; route: string; severity: 'crit' | 'warn' | 'info'; when: string }> = [];
    const d = this.dashboard();
    for (const m of (d?.inventory.lowStockMaterials ?? []).slice(0, 2)) {
      items.push({
        key: `mat-${m.name}`, tag: 'Low-stock alert', severity: 'crit', when: 'now',
        body: `${m.name} — ${m.currentQuantity} left, reorder threshold ${m.reorderThreshold}`,
        action: 'Order re-supply', route: '/materials',
      });
    }
    for (const a of this.pendingList().slice(0, 2)) {
      items.push({
        key: `apr-${a.id}`, tag: 'Pending approval', severity: 'warn',
        when: this.formatTime(a.createdAt),
        body: `${a.actionType.replaceAll('_', ' ')} — requested by ${a.requestedBy.name}`,
        action: 'Review & authorise', route: '/approvals',
      });
    }
    const fr = this.firstReturn();
    if (this.pendingReturns() > 0 && fr) {
      items.push({
        key: 'returns', tag: 'Return awaiting inspection', severity: 'warn',
        when: `due ${this.formatTime(fr.deadline)}`,
        body: `${this.pendingReturns()} request(s) in the queue — next: ${fr.sku}`,
        action: 'Open inspection desk', route: '/returns',
      });
    }
    const t = this.transitFirst();
    if (t) {
      items.push({
        key: 'transit', tag: 'Dispatch in transit', severity: 'info', when: 'live',
        body: `${String(t['carrier'] ?? 'carrier')} leg ${String(t['legNumber'] ?? '')} — ${String(t['trackingRef'] ?? 'no tracking ref')}`,
        action: 'View haulage', route: '/logistics',
      });
    }
    return items.slice(0, 4);
  });

  /** Stage cells: batch count (analytics) + unit volume (live batches). */
  readonly stageUnits = signal<Map<string, { units: number; batches: number }>>(new Map());
  readonly stageOrder = signal<string[]>([]);
  readonly pipeline = computed(() => {
    const order = this.stageOrder();
    const m = this.stageUnits();
    return order.map((stage) => ({ stage, units: m.get(stage)?.units ?? 0, batches: m.get(stage)?.batches ?? 0 }));
  });
  readonly activeUnits = computed(() => {
    const order = this.stageOrder();
    const last = order[order.length - 1];
    return this.pipeline().filter((s) => s.stage !== last).reduce((sum, s) => sum + s.units, 0);
  });

  constructor() {
    this.api.batches().subscribe((res) => {
      this.stageOrder.set(res.stages);
      const m = new Map<string, { units: number; batches: number }>();
      for (const b of res.data) {
        const cur = m.get(b.stage) ?? { units: 0, batches: 0 };
        cur.units += b.quantity;
        cur.batches += 1;
        m.set(b.stage, cur);
      }
      this.stageUnits.set(m);
    });
  }

  topChannels() {
    return (this.dashboard()?.salesByChannel ?? []).slice(0, 3);
  }

  incomeShare(d: Dashboard): string {
    const total = d.profitLoss.income + d.profitLoss.expenditure;
    return total > 0 ? `${Math.round((d.profitLoss.income / total) * 100)}%` : '0%';
  }

  share(rows: Array<{ revenue: number }>, revenue: number): string {
    const total = rows.reduce((s, r) => s + r.revenue, 0);
    return total > 0 ? (Math.round((revenue / total) * 1000) / 10).toFixed(1) : '0.0';
  }

  skuFor(variantId: string): string {
    return this.skus().get(variantId) ?? variantId.slice(0, 8);
  }

  /** Reference's "Export Daily Operations Sheet" — print flow (no export API yet). */
  exportSheet(): void {
    window.print();
  }

  delta(cur: number, prior: number): { text: string; cls: string } {
    if (prior === 0) {
      if (cur === 0) return { text: '0%', cls: '' };
      return { text: 'new this period', cls: 'plus' };
    }
    const p = Math.round(((cur - prior) / prior) * 100);
    return { text: `${p >= 0 ? '+' : ''}${p}%`, cls: p >= 0 ? 'plus' : 'minus' };
  }

  sparkPoints(values: number[]): string {
    const n = values.length;
    if (n === 0) return '';
    const max = Math.max(...values, 1);
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 50 : (i * 100) / (n - 1);
      const y = 2 + (1 - Math.max(0, values[i]) / max) * (this.SPARK_H - 4);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }

  private readonly SPARK_H = 26;

  formatTime(ts: string): string {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
  }
}
