import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  SeActivityComponent,
  SeActivityEntry,
  SeBannerComponent,
  SeBarChartComponent,
  SeButtonDirective,
  SeCardComponent,
  SeColumn,
  SeCurrencyService,
  SeFieldComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeLineChartComponent,
  SeMetricCardComponent,
  SePageComponent,
  SeSkeletonComponent,
  SeTabPanelDirective,
  SeTableComponent,
  SeTabsComponent,
  SeTone,
  statusMeaning,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import {
  AnalyticsRange,
  ApiService,
  Approval,
  AuditEntry,
  Batch,
  Dashboard,
  LowStock,
} from '../api.service';

interface MetricCard {
  key: string;
  label: string;
  value: string | number;
  hint: string;
  link: string;
  change: number | null;
  changeLabel: string;
  goodDirection: 'up' | 'down';
  trend: number[] | null;
  trendLabel: string;
}
interface Attention {
  key: string;
  tone: SeTone;
  title: string;
  text: string;
  action: string;
  link: string;
}
interface SellerRow {
  sku: string;
  productName: string;
  unitsSold: number;
  revenue: number;
}
interface LowStockRow {
  id: string;
  name: string;
  kind: string;
  onHand: number;
  reorderAt: number;
}

const PERIODS: { value: AnalyticsRange; label: string; sales: string; versus: string }[] = [
  { value: 'today', label: 'Today', sales: 'Sales today', versus: 'vs yesterday' },
  {
    value: '7d',
    label: 'Last 7 days',
    sales: 'Sales, last 7 days',
    versus: 'vs the 7 days before',
  },
  {
    value: '30d',
    label: 'Last 30 days',
    sales: 'Sales, last 30 days',
    versus: 'vs the 30 days before',
  },
  {
    value: 'custom',
    label: 'Custom dates',
    sales: 'Sales in these dates',
    versus: 'vs the period before',
  },
];

/**
 * Home. For the owner it answers five questions without scrolling: what was
 * sold, where profit and loss stand, what is running low, where production is,
 * and what is waiting for approval. Each answer is one card that links to the
 * screen behind it.
 *
 * Every other role gets the same screen cut down to what that role can open:
 * a card or section the role has no access to is not requested from the API
 * and not shown. Someone with the Inventory role sees stock and production,
 * not sales and profit.
 */
@Component({
  selector: 'app-home',
  imports: [
    FormsModule,
    RouterLink,
    SeActivityComponent,
    SeBannerComponent,
    SeBarChartComponent,
    SeButtonDirective,
    SeCardComponent,
    SeFieldComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeLineChartComponent,
    SeMetricCardComponent,
    SePageComponent,
    SeSkeletonComponent,
    SeTabPanelDirective,
    SeTableComponent,
    SeTabsComponent,
  ],
  styles: [
    `
      /* The custom date range: two dates and Apply on one line. */
      .home-range {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: var(--se-space-3);
      }
      .home-period {
        width: auto;
      }
      .home-stack {
        display: grid;
        gap: var(--se-space-2);
      }
    `,
  ],
  template: `
    <se-page title="Home">
      <ng-container sePageActions>
        <select
          seInput
          class="home-period"
          aria-label="Period"
          [ngModel]="range()"
          (ngModelChange)="setRange($event)"
        >
          @for (p of periods; track p.value) {
            <option [value]="p.value">{{ p.label }}</option>
          }
        </select>
        <button seButton type="button" (click)="print()">Print summary</button>
      </ng-container>

      @if (range() === 'custom') {
        <form sePageFilters class="home-range" (submit)="$event.preventDefault(); load()">
          <se-field label="From"
            ><input seInput type="date" name="from" [(ngModel)]="from"
          /></se-field>
          <se-field label="To" [error]="rangeError()">
            <input seInput type="date" name="to" [(ngModel)]="to" />
          </se-field>
          <button seButton type="submit">Apply dates</button>
        </form>
      }

      @if (loadError()) {
        <se-banner
          tone="danger"
          title="The summary could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          {{ loadError() }}
        </se-banner>
      } @else if (!dashboard()) {
        <div class="se-metric-grid" aria-busy="true">
          @for (i of placeholders; track i) {
            <se-card><se-skeleton shape="metric" /></se-card>
          }
        </div>
      } @else {
        <div class="se-metric-grid">
          @for (m of metrics(); track m.key) {
            <a class="se-metric-link" [routerLink]="m.link">
              <se-metric-card
                [label]="m.label"
                [value]="m.value"
                [hint]="m.hint"
                [change]="m.change"
                [changeLabel]="m.changeLabel"
                [goodDirection]="m.goodDirection"
                [trend]="m.trend"
                [trendLabel]="m.trendLabel"
              />
            </a>
          }
        </div>

        <div class="se-detail">
          <div class="se-detail__main">
            @if (seesMoney()) {
              <se-card [title]="period().sales">
                <se-line-chart
                  [title]="period().sales + ', paid orders'"
                  [labels]="seriesLabels()"
                  [series]="salesSeries()"
                  [formatValue]="money"
                  area
                />
              </se-card>
            }
            @if (seesOrders()) {
              <se-card title="Orders by status">
                <a seButton size="sm" seCardActions routerLink="/orders">View orders</a>
                <se-bar-chart
                  title="Paid orders by status in this period"
                  [labels]="statusLabels()"
                  [values]="statusCounts()"
                  height="sm"
                />
              </se-card>
            }
            @if (access.can('inventory')) {
              <se-card title="Low stock" flush>
                <a seButton size="sm" seCardActions routerLink="/inventory">View inventory</a>
                <se-table
                  caption="Items below their reorder level"
                  [columns]="lowStockColumns"
                  [rows]="lowStockRows()"
                  hideDensity
                  [pageSize]="5"
                  emptyHeading="Nothing is running low"
                  emptyText="Every material and product size is above its reorder level."
                />
              </se-card>
            }
            @if (access.can('analytics')) {
              <se-card title="What is selling">
                <se-tabs
                  #selling
                  label="What is selling"
                  [tabs]="sellingTabs"
                  [(active)]="sellingTab"
                />
                <div seTabPanel="best" [for]="selling">
                  <se-table
                    caption="Best sellers"
                    [columns]="sellerColumns()"
                    [rows]="bestSellers()"
                    [rowId]="sellerId"
                    hideDensity
                    emptyHeading="No sales yet"
                  />
                </div>
                <div seTabPanel="slow" [for]="selling">
                  <se-table
                    caption="Slow movers"
                    [columns]="sellerColumns()"
                    [rows]="slowMovers()"
                    [rowId]="sellerId"
                    hideDensity
                    emptyHeading="No slow movers"
                  />
                </div>
              </se-card>
            }
          </div>

          <aside class="se-detail__aside">
            <se-card title="Needs attention">
              @if (attention().length > 0) {
                <div class="home-stack">
                  @for (a of attention(); track a.key) {
                    <se-banner [tone]="a.tone" [title]="a.title">
                      {{ a.text }}
                      <div>
                        <a seButton size="sm" [routerLink]="a.link">{{ a.action }}</a>
                      </div>
                    </se-banner>
                  }
                </div>
              } @else {
                <p class="se-type-body">Nothing needs you right now.</p>
              }
            </se-card>

            @if (access.can('manufacturing')) {
              <se-card title="Production">
                <a seButton size="sm" seCardActions routerLink="/production">View production</a>
                <dl seKv>
                  @for (s of pipeline(); track s.stage) {
                    <div seKvItem [label]="s.label">{{ s.text }}</div>
                  }
                </dl>
              </se-card>
            }

            @if (seesAudit()) {
              <se-card title="Recent activity">
                <a seButton size="sm" seCardActions routerLink="/audit">View audit log</a>
                <se-activity [entries]="activity()" emptyText="Nothing has been recorded yet." />
              </se-card>
            }
          </aside>
        </div>
      }
    </se-page>
  `,
})
export class HomePage {
  private readonly api = inject(ApiService);
  private readonly currency = inject(SeCurrencyService);
  readonly access = inject(AccessService);

  readonly periods = PERIODS;
  readonly placeholders = [1, 2, 3, 4, 5];
  readonly range = signal<AnalyticsRange>('today');
  from = '';
  to = '';
  readonly rangeError = signal('');
  readonly period = computed(() => PERIODS.find((p) => p.value === this.range())!);

  readonly dashboard = signal<Dashboard | null>(null);
  readonly loadError = signal('');
  private readonly lowStock = signal<LowStock | null>(null);
  private readonly pending = signal<Approval[]>([]);
  private readonly batches = signal<Batch[]>([]);
  private readonly stages = signal<string[]>([]);
  private readonly audit = signal<AuditEntry[]>([]);
  private readonly returnsWaiting = signal(0);
  private readonly inTransit = signal(0);
  private readonly skus = signal(new Map<string, string>());
  readonly bestSellers = signal<SellerRow[]>([]);
  readonly slowMovers = signal<SellerRow[]>([]);

  // ---- what this role sees: decided once from its access ----
  /** Sales and profit are money: shown to roles that can see payments or the books. */
  readonly seesMoney = computed(() => this.access.canAny(['payments', 'accounting']));
  readonly seesOrders = computed(() => this.access.canAny(['retail_orders', 'wholesale_orders']));
  readonly seesApprovals = computed(() => this.access.can('approvals_audit', 'approve'));
  readonly seesAudit = this.seesApprovals;

  readonly money = (n: number): string => this.currency.format(n);
  readonly sellerId = (row: SellerRow): string => row.sku;

  constructor() {
    this.load();
    this.loadSupporting();
  }

  // ---- loading ----
  setRange(range: AnalyticsRange): void {
    this.range.set(range);
    if (range !== 'custom') this.load();
  }

  load(): void {
    const range = this.range();
    if (range === 'custom') {
      if (!this.from || !this.to) return this.rangeError.set('Choose both dates.');
      if (this.to < this.from) return this.rangeError.set('The To date is before the From date.');
    }
    this.rangeError.set('');
    this.loadError.set('');
    const request =
      range === 'custom'
        ? this.api.dashboard('custom', this.from, this.to)
        : this.api.dashboard(range);
    request.subscribe({
      next: (d) => this.dashboard.set(d),
      error: (err) => {
        // A failed refresh keeps the last good numbers on screen.
        if (!this.dashboard()) {
          this.loadError.set(err?.error?.message ?? 'The server did not respond.');
        }
      },
    });
  }

  /** Everything beyond the summary, each asked for only if the role may see it. */
  private loadSupporting(): void {
    const quiet = { error: () => undefined };
    if (this.access.can('analytics')) {
      this.api.lowStock().subscribe({ next: (l) => this.lowStock.set(l), ...quiet });
      this.api.bestSellers('best').subscribe({ next: (b) => this.bestSellers.set(b), ...quiet });
      this.api.bestSellers('slow').subscribe({ next: (b) => this.slowMovers.set(b), ...quiet });
    }
    if (this.seesApprovals()) {
      this.api.pendingApprovals().subscribe({ next: (a) => this.pending.set(a), ...quiet });
      this.api
        .auditLog({ limit: 6 })
        .subscribe({ next: (log) => this.audit.set(log.data.slice(0, 6)), ...quiet });
    }
    if (this.access.can('manufacturing')) {
      this.api.batches().subscribe({
        next: (res) => {
          this.batches.set(res.data);
          this.stages.set(res.stages);
        },
        ...quiet,
      });
    }
    if (this.access.can('returns')) {
      this.api.returns().subscribe({
        next: (res) =>
          this.returnsWaiting.set(res.data.filter((r) => r.status === 'requested').length),
        ...quiet,
      });
    }
    if (this.access.can('logistics')) {
      this.api.deliveries().subscribe({
        next: (res) =>
          this.inTransit.set(res.data.filter((l) => l['status'] === 'in_transit').length),
        ...quiet,
      });
    }
    if (this.access.can('inventory')) {
      // Low-stock product sizes come back as ids; the catalogue gives them their SKUs.
      this.api.products().subscribe({
        next: (res) => {
          const map = new Map<string, string>();
          for (const p of res.data) {
            for (const v of (p['variants'] as Array<Record<string, unknown>>) ?? []) {
              map.set(String(v['id']), String(v['sku']));
            }
          }
          this.skus.set(map);
        },
        ...quiet,
      });
    }
  }

  // ---- the cards: the five questions, cut down to what this role can open ----
  readonly metrics = computed<MetricCard[]>(() => {
    const d = this.dashboard();
    if (!d) return [];
    const cards: MetricCard[] = [];
    const card = (
      c: Partial<MetricCard> & Pick<MetricCard, 'key' | 'label' | 'value' | 'hint' | 'link'>,
    ): void => {
      cards.push({
        change: null,
        changeLabel: '',
        goodDirection: 'up',
        trend: null,
        trendLabel: '',
        ...c,
      });
    };

    if (this.seesMoney()) {
      const revenue = this.range() === 'today' ? d.salesToday.revenue : d.metrics.revenue;
      const trend = d.series.map((p) => p.revenue);
      card({
        key: 'sales',
        label: this.period().sales,
        value: this.money(revenue),
        hint: this.range() === 'today' ? plural(d.salesToday.orders, 'paid order') : '',
        link: '/orders',
        change: percentChange(d.metrics.revenue, d.metrics.priorRevenue),
        changeLabel: this.period().versus,
        trend: trend.length > 1 ? trend : null,
        trendLabel: `${this.period().sales}, by ${this.range() === 'today' ? 'hour' : 'day'}`,
      });
    }
    if (this.access.can('accounting')) {
      card({
        key: 'profit',
        label: 'Profit and loss',
        value: this.money(d.profitLoss.net),
        hint: `To date: ${this.money(d.profitLoss.income)} in, ${this.money(d.profitLoss.expenditure)} out`,
        link: '/accounting',
      });
    }
    if (this.seesOrders() && !this.seesMoney()) {
      card({
        key: 'open',
        label: 'Open orders',
        value: d.metrics.openOrders,
        hint: 'Paid and not yet delivered',
        link: '/orders',
      });
    }
    if (this.access.can('inventory')) {
      const low = this.lowStock();
      const materials = low?.materials.length ?? d.inventory.lowStockMaterialCount;
      const sizes = low?.variants.length ?? 0;
      card({
        key: 'stock',
        label: 'Low stock',
        value: materials + sizes,
        hint:
          materials + sizes === 0
            ? 'Everything is above its reorder level'
            : `${plural(materials, 'material')}, ${plural(sizes, 'product size')}`,
        link: '/inventory',
      });
    }
    if (this.access.can('manufacturing')) {
      // The stage list is configuration; its last entry is the completion stage.
      const done = this.stages().at(-1);
      const active = d.production.filter((s) =>
        done ? s.stage !== done : !/complete/i.test(s.stage),
      );
      const total = active.reduce((sum, s) => sum + s.batches, 0);
      const busiest = [...active].sort((a, b) => b.batches - a.batches)[0];
      card({
        key: 'production',
        label: 'In production',
        value: plural(total, 'batch', 'batches'),
        hint:
          total === 0 || !busiest
            ? 'No batches are running'
            : `Most are at ${statusMeaning('production', busiest.stage).label.toLowerCase()}`,
        link: '/production',
      });
    }
    if (this.seesApprovals()) {
      const oldest = [...this.pending()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      card({
        key: 'approvals',
        label: 'Awaiting approval',
        value: d.pendingApprovals,
        hint:
          d.pendingApprovals === 0
            ? 'Nothing is waiting for a decision'
            : oldest
              ? `Oldest raised ${ago(oldest.createdAt)}`
              : 'Waiting for a decision',
        link: '/approvals',
      });
    }
    if (this.access.can('returns') && !this.seesMoney()) {
      card({
        key: 'returns',
        label: 'Returns waiting',
        value: this.returnsWaiting(),
        hint: 'Requests not yet checked',
        link: '/returns',
      });
    }
    return cards;
  });

  // ---- charts ----
  readonly seriesLabels = computed(() => (this.dashboard()?.series ?? []).map((p) => p.label));
  readonly salesSeries = computed(() => [
    { name: 'Sales', values: (this.dashboard()?.series ?? []).map((p) => p.revenue) },
  ]);
  readonly statusLabels = computed(() =>
    (this.dashboard()?.statusBreakdown ?? []).map((s) => statusMeaning('order', s.status).label),
  );
  readonly statusCounts = computed(() =>
    (this.dashboard()?.statusBreakdown ?? []).map((s) => s.count),
  );

  // ---- low stock ----
  readonly lowStockRows = computed<LowStockRow[]>(() => {
    const low = this.lowStock();
    if (!low) return [];
    return [
      ...low.materials.map((m) => ({
        id: `m-${m.id}`,
        name: m.name,
        kind: 'Material',
        onHand: m.currentQuantity,
        reorderAt: m.reorderThreshold,
      })),
      ...low.variants.map((v) => ({
        id: `v-${v.variantId}`,
        name: this.skus().get(v.variantId) ?? 'Product size',
        kind: 'Product size',
        onHand: v.currentQuantity,
        reorderAt: low.variantThreshold,
      })),
    ].sort((a, b) => a.onHand / (a.reorderAt || 1) - b.onHand / (b.reorderAt || 1));
  });
  readonly lowStockColumns: SeColumn<LowStockRow>[] = [
    { key: 'name', header: 'Item' },
    { key: 'kind', header: 'Type' },
    { key: 'onHand', header: 'On hand', numeric: true },
    { key: 'reorderAt', header: 'Reorder at', numeric: true },
  ];

  // ---- selling ----
  readonly sellingTabs = [
    { id: 'best', label: 'Best sellers' },
    { id: 'slow', label: 'Slow movers' },
  ];
  readonly sellingTab = signal('best');
  /** Revenue is money: left out for a role that does not see money. */
  readonly sellerColumns = computed<SeColumn<SellerRow>[]>(() => [
    { key: 'sku', header: 'SKU' },
    { key: 'productName', header: 'Product' },
    { key: 'unitsSold', header: 'Units sold', numeric: true },
    ...(this.seesMoney()
      ? [
          {
            key: 'revenue',
            header: 'Revenue',
            numeric: true,
            format: (v: unknown) => this.money(v as number),
          },
        ]
      : []),
  ]);

  // ---- production by stage: batches from the summary, units from the live batches ----
  readonly pipeline = computed(() => {
    const d = this.dashboard();
    const order =
      this.stages().length > 0 ? this.stages() : (d?.production ?? []).map((s) => s.stage);
    return order.map((stage) => {
      const batches = this.batches().filter((b) => b.stage === stage);
      const count = batches.length || (d?.production.find((s) => s.stage === stage)?.batches ?? 0);
      const units = batches.reduce((sum, b) => sum + b.quantity, 0);
      return {
        stage,
        label: statusMeaning('production', stage).label,
        text:
          count === 0
            ? '–'
            : `${plural(count, 'batch', 'batches')}${units ? ', ' + plural(units, 'unit') : ''}`,
      };
    });
  });

  // ---- needs attention: every item comes from a live queue ----
  readonly attention = computed<Attention[]>(() => {
    const items: Attention[] = [];
    const d = this.dashboard();
    if (this.access.can('raw_materials')) {
      for (const m of (d?.inventory.lowStockMaterials ?? []).slice(0, 2)) {
        items.push({
          key: `mat-${m.name}`,
          tone: 'danger',
          title: `${m.name} is running low`,
          text: `${m.currentQuantity} left. It should be reordered at ${m.reorderThreshold}.`,
          action: 'View materials',
          link: '/materials',
        });
      }
    }
    if (this.seesApprovals()) {
      for (const a of this.pending().slice(0, 2)) {
        items.push({
          key: `apr-${a.id}`,
          tone: 'warning',
          title: `${sentence(a.actionType)} awaiting approval`,
          text: `Requested by ${a.requestedBy.name}, ${ago(a.createdAt)}.`,
          action: 'Review request',
          link: '/approvals',
        });
      }
    }
    if (this.returnsWaiting() > 0) {
      items.push({
        key: 'returns',
        tone: 'warning',
        title: `${plural(this.returnsWaiting(), 'return')} waiting to be checked`,
        text: 'A return must be completed within 24 hours of the request.',
        action: 'View returns',
        link: '/returns',
      });
    }
    if (this.inTransit() > 0) {
      items.push({
        key: 'transit',
        tone: 'info',
        title: `${plural(this.inTransit(), 'delivery', 'deliveries')} in transit`,
        text: 'On the road with the courier now.',
        action: 'View logistics',
        link: '/logistics',
      });
    }
    return items.slice(0, 4);
  });

  readonly activity = computed<SeActivityEntry[]>(() =>
    this.audit().map((entry) => ({ at: entry.timestamp, text: sentence(entry.action) })),
  );

  print(): void {
    window.print();
  }
}

/** "1 batch", "3 batches". */
function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "price_change" -> "Price change"; "POST /api/v1/orders" stays as it is. */
function sentence(text: string): string {
  const words = text.replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

/** Change against the comparison period, as a percentage; null when there is nothing to compare with. */
function percentChange(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

/** "today", "yesterday", "3 days ago". */
function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days) || days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
