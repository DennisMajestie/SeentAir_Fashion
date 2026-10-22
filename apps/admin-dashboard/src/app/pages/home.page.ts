import {
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import gsap from 'gsap';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  SeBannerComponent,
  SeBarChartComponent,
  SeButtonDirective,
  SeCurrencyService,
  SeFieldComponent,
  SeIconComponent,
  SeIconName,
  SeInputDirective,
  SeLineChartComponent,
  SeMetricCardComponent,
  SePageComponent,
  SeSkeletonComponent,
  SeStatusComponent,
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
import { orderRef } from './order-format';

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
  icon: SeIconName;
}
interface AlertRow {
  key: string;
  tone: SeTone;
  title: string;
  text: string;
  link: string;
  icon: SeIconName;
}
interface SellerRow {
  sku: string;
  productName: string;
  unitsSold: number;
  revenue: number;
}
interface DeliveryRow {
  id: string;
  carrier: string;
  reference: string;
  order: string;
  status: string;
}
interface ActivityRow {
  id: string;
  title: string;
  when: string;
}
interface Campaign {
  name: string;
  endDate: string;
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

/** The gauge in the sales card: 84 ticks across a 230-degree arc. */
const GAUGE_TICKS = 84;

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
    SeBannerComponent,
    SeBarChartComponent,
    SeButtonDirective,
    SeFieldComponent,
    SeIconComponent,
    SeInputDirective,
    SeLineChartComponent,
    SeMetricCardComponent,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
  ],
  styles: [
    `
      :host {
        display: block;
      }

      /* ---- the page grid: three columns, collapsing to two, then one ---- */
      .sd-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--se-space-4);
        align-items: start;
      }
      .sd-kpis {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
        gap: var(--se-space-4);
      }
      .sd-chart,
      .sd-sales,
      .sd-activities,
      .sd-alerts,
      .sd-sellers,
      .sd-deliveries,
      .sd-production {
        grid-column: span 1;
      }
      .sd-chart,
      .sd-deliveries {
        grid-column: span 2;
      }
      @media (max-width: 1180px) {
        .sd-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .sd-chart,
        .sd-sales,
        .sd-deliveries,
        .sd-production {
          grid-column: 1 / -1;
        }
      }
      @media (max-width: 860px) {
        .sd-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .sd-activities,
        .sd-alerts,
        .sd-sellers {
          grid-column: 1 / -1;
        }
        .sd-kpis {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      /* ---- the greeting ---- */
      .sd-welcome {
        display: grid;
        gap: var(--se-space-2);
        margin-bottom: var(--se-space-4);
      }
      .sd-date {
        justify-self: start;
        display: inline-flex;
        align-items: center;
        gap: var(--se-space-2);
        padding: var(--se-space-1) var(--se-space-3);
        border: var(--se-border-width) solid var(--se-color-border);
        border-radius: var(--se-radius-pill);
        background: var(--se-color-surface);
        font: var(--se-type-caption);
        color: var(--se-color-text-muted);
      }
      .sd-date__dot {
        width: 0.375rem;
        height: 0.375rem;
        border-radius: 50%;
        background: var(--se-color-success-border);
      }
      .sd-lede {
        margin: 0;
        font: var(--se-type-body);
        color: var(--se-color-text-muted);
        max-width: 68ch;
      }
      .sd-lede b {
        color: var(--se-color-text);
        font-weight: 600;
      }

      /* ---- cards ---- */
      .sd-card {
        position: relative;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--se-space-3);
        padding: var(--se-space-5);
        border: var(--se-border-width) solid var(--se-color-border);
        border-radius: 1.25rem;
        background: var(--se-color-surface);
      }
      .sd-card__hd {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--se-space-3);
        flex-wrap: wrap;
      }
      .sd-card__hd h2 {
        margin: 0;
        font: var(--se-type-subheading);
        letter-spacing: var(--se-type-subheading-tracking);
      }
      .sd-card__sub {
        margin: var(--se-space-half) 0 0;
        font: var(--se-type-caption);
        color: var(--se-color-text-muted);
      }
      .sd-card__link {
        font: var(--se-type-body-strong);
        color: var(--se-color-accent-text);
        text-decoration: none;
        white-space: nowrap;
      }
      .sd-card__link:hover {
        text-decoration: underline;
      }
      .sd-empty {
        margin: 0;
        font: var(--se-type-body);
        color: var(--se-color-text-muted);
      }

      /* ---- KPI cards: the shared metric block inside the new shell ---- */
      .sd-kpi {
        display: block;
        color: inherit;
        text-decoration: none;
        transition:
          border-color var(--se-motion-duration-fast) var(--se-motion-ease-standard),
          background-color var(--se-motion-duration-fast) var(--se-motion-ease-standard);
      }
      .sd-kpi:hover {
        border-color: var(--se-color-border-strong);
        background: var(--se-color-surface);
      }
      .sd-kpi:focus-visible {
        outline: var(--se-focus-outline);
        outline-offset: var(--se-focus-offset);
      }
      .sd-kpi se-metric-card {
        display: block;
        padding-right: 3rem;
      }
      .sd-kpi__orb {
        position: absolute;
        top: var(--se-space-4);
        right: var(--se-space-4);
        width: 2.25rem;
        height: 2.25rem;
        display: grid;
        place-items: center;
        border-radius: 50%;
        color: var(--se-color-on-accent);
        background: var(--gold, #c9a24b);
      }
      .sd-kpi__orb--stock {
        background: linear-gradient(160deg, #3a3126, #14110d);
        color: #f4f0e6;
      }
      .sd-kpi__orb--money {
        background: linear-gradient(160deg, #8fb0c0, #4a6c80);
        color: #fff;
      }
      .sd-kpi__orb--warn {
        background: linear-gradient(160deg, #e9c24a, #b8891a);
        color: #1b1c19;
      }
      .sd-kpi__orb--neutral {
        background: var(--se-color-surface-sunken);
        color: var(--se-color-text-muted);
      }

      /* ---- rows: activities, alerts, sellers, deliveries, production ---- */
      .sd-rows {
        display: grid;
        gap: var(--se-space-2);
      }
      .sd-row {
        display: flex;
        align-items: center;
        gap: var(--se-space-3);
        width: 100%;
        padding: var(--se-space-2) var(--se-space-3);
        border: 0;
        border-radius: var(--se-radius-md);
        background: var(--se-color-surface-sunken);
        color: inherit;
        text-align: left;
        font: inherit;
        text-decoration: none;
      }
      a.sd-row {
        transition: background-color var(--se-motion-duration-fast) var(--se-motion-ease-standard);
      }
      a.sd-row:hover {
        background: var(--se-color-surface-hover);
      }
      a.sd-row:focus-visible {
        outline: var(--se-focus-outline);
        outline-offset: var(--se-focus-offset);
      }
      .sd-row[data-tone='danger'] {
        background: color-mix(in srgb, var(--se-color-danger-bg) 62%, var(--se-color-surface));
      }
      .sd-row[data-tone='warning'] {
        background: color-mix(in srgb, var(--se-color-warning-bg) 62%, var(--se-color-surface));
      }
      .sd-row[data-tone='success'] {
        background: color-mix(in srgb, var(--se-color-success-bg) 62%, var(--se-color-surface));
      }
      .sd-tile {
        flex: none;
        width: 2.25rem;
        height: 2.25rem;
        display: grid;
        place-items: center;
        border-radius: var(--se-radius-md);
        background: var(--se-color-surface);
        color: var(--se-color-text-muted);
      }
      .sd-row[data-tone='danger'] .sd-tile {
        color: var(--se-color-danger-text);
      }
      .sd-row[data-tone='warning'] .sd-tile {
        color: var(--se-color-warning-text);
      }
      .sd-row[data-tone='success'] .sd-tile {
        color: var(--se-color-success-text);
      }
      .sd-tile--gold {
        background: color-mix(in srgb, var(--se-color-accent) 22%, var(--se-color-surface));
        color: var(--se-color-accent-text);
      }
      .sd-row__tx {
        min-width: 0;
        flex: 1;
      }
      .sd-row__tx b {
        display: block;
        font: var(--se-type-body-strong);
      }
      .sd-row__tx small {
        display: block;
        margin-top: var(--se-space-half);
        font: var(--se-type-caption);
        color: var(--se-color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sd-row__when {
        flex: none;
        font: var(--se-type-caption);
        color: var(--se-color-text-subtle);
        white-space: nowrap;
      }
      .sd-row__amt {
        flex: none;
        text-align: right;
      }
      .sd-row__amt b {
        display: block;
        font: var(--se-type-body-strong);
        font-variant-numeric: tabular-nums;
      }
      .sd-row__amt small {
        display: block;
        margin-top: var(--se-space-half);
        font: var(--se-type-caption);
        color: var(--se-color-text-muted);
      }
      .sd-row__chev {
        flex: none;
        color: var(--se-color-text-subtle);
      }

      /* ---- sales overview ---- */
      .sd-sales__gauge {
        display: grid;
        place-items: center;
        margin-top: calc(-1 * var(--se-space-2));
      }
      .sd-sales__gauge svg {
        width: 100%;
        max-width: 20rem;
      }
      .sd-gauge__tick {
        stroke: var(--se-color-border);
        stroke-width: 2.4;
        stroke-linecap: round;
        transform-box: fill-box;
        transform-origin: 50% 50%;
      }
      .sd-gauge__tick--on {
        stroke: var(--gold, #c9a24b);
      }
      .sd-gauge__value {
        font: var(--se-type-display);
        fill: var(--se-color-text);
      }
      .sd-gauge__label {
        font: var(--se-type-caption);
        fill: var(--se-color-text-muted);
      }
      .sd-sales__stats {
        display: flex;
        justify-content: space-between;
        gap: var(--se-space-4);
        font: var(--se-type-caption);
        color: var(--se-color-text-muted);
      }
      .sd-sales__stats b {
        display: block;
        margin-top: var(--se-space-half);
        font: var(--se-type-subheading);
        color: var(--se-color-text);
        font-variant-numeric: tabular-nums;
      }
      .sd-sales__note {
        margin: 0;
        padding: var(--se-space-3);
        border-radius: var(--se-radius-md);
        background: var(--se-color-surface-sunken);
        font: var(--se-type-caption);
        color: var(--se-color-text-muted);
      }

      /* ---- progress bars ---- */
      .sd-prog {
        height: 0.5rem;
        border-radius: var(--se-radius-pill);
        background: var(--se-color-surface-sunken);
        overflow: hidden;
      }
      .sd-prog > i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--se-color-success-border);
        transform-origin: left center;
      }
      .sd-prog__meta {
        display: flex;
        justify-content: space-between;
        font: var(--se-type-caption);
        color: var(--se-color-text-muted);
      }

      /* ---- segmented control (best / slow sellers) ---- */
      .sd-seg {
        display: inline-flex;
        padding: 2px;
        border: var(--se-border-width) solid var(--se-color-border);
        border-radius: var(--se-radius-pill);
        background: var(--se-color-surface-sunken);
      }
      .sd-seg button {
        border: 0;
        border-radius: var(--se-radius-pill);
        padding: var(--se-space-1) var(--se-space-3);
        background: transparent;
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
        min-height: 2rem;
        cursor: pointer;
      }
      .sd-seg button[aria-pressed='true'] {
        background: var(--se-color-surface);
        color: var(--se-color-text);
        box-shadow: var(--se-elevation-1);
      }
      .sd-seg button:focus-visible {
        outline: var(--se-focus-outline);
        outline-offset: 1px;
      }

      /* ---- production stages ---- */
      .sd-stage {
        display: grid;
        gap: var(--se-space-1);
      }
      .sd-stage__top {
        display: flex;
        justify-content: space-between;
        gap: var(--se-space-3);
        font: var(--se-type-caption);
      }
      .sd-stage__top b {
        color: var(--se-color-text);
      }
      .sd-stage__top span {
        color: var(--se-color-text-muted);
        white-space: nowrap;
      }
      .sd-stage .sd-prog {
        height: 0.375rem;
      }
      .sd-stage .sd-prog > i {
        background: var(--se-color-accent);
      }

      /* ---- custom date range ---- */
      .sd-range {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: var(--se-space-3);
      }
      .sd-period {
        width: auto;
      }

      @media (max-width: 640px) {
        .sd-card {
          padding: var(--se-space-4);
        }
        .sd-row {
          flex-wrap: wrap;
        }
        .sd-row__when,
        .sd-row__amt {
          margin-left: calc(2.25rem + var(--se-space-3));
        }
      }

      /* Entrance motion must never hide content on paper. */
      @media print {
        .sd-card,
        .sd-welcome > * {
          opacity: 1 !important;
          visibility: visible !important;
          transform: none !important;
        }
      }
    `,
  ],
  template: `
    <se-page [title]="greeting()">
      <ng-container sePageActions>
        <select
          seInput
          class="sd-period"
          aria-label="Period"
          [ngModel]="range()"
          (ngModelChange)="setRange($event)"
        >
          @for (p of periods; track p.value) {
            <option [value]="p.value">{{ p.label }}</option>
          }
        </select>
        @if (seesOrders()) {
          <a seButton routerLink="/orders">View orders</a>
        }
        <button seButton variant="ghost" type="button" (click)="print()">Print summary</button>
      </ng-container>

      <section class="sd-welcome" aria-label="Today">
        <span class="sd-date"><span class="sd-date__dot"></span>{{ todayLabel }}</span>
        <p class="sd-lede">
          Here is what is moving today:
          @if (ledeBits().length > 0) {
            <b>{{ ledeBits().join(' · ') }}</b>.
          } @else {
            no live figures are available to your role yet.
          }
        </p>
      </section>

      @if (range() === 'custom') {
        <form class="sd-range" (submit)="$event.preventDefault(); load()">
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
        <div class="sd-kpis" aria-busy="true">
          @for (i of placeholders; track i) {
            <div class="sd-card"><se-skeleton shape="metric" /></div>
          }
        </div>
      } @else {
        <div class="sd-grid">
          <div class="sd-kpis">
            @for (m of metrics(); track m.key) {
              <a class="sd-card sd-kpi" [routerLink]="m.link">
                <span
                  class="sd-kpi__orb"
                  [class.sd-kpi__orb--stock]="m.key === 'stock'"
                  [class.sd-kpi__orb--money]="m.key === 'value' || m.key === 'sales'"
                  [class.sd-kpi__orb--warn]="m.key === 'low' || m.key === 'approvals'"
                  [class.sd-kpi__orb--neutral]="
                    m.key !== 'stock' && m.key !== 'value' && m.key !== 'sales' &&
                    m.key !== 'low' && m.key !== 'approvals'
                  "
                  aria-hidden="true"
                >
                  <se-icon [name]="m.icon" />
                </span>
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

          @if (seesMoney()) {
            <article class="sd-card sd-chart">
              <div class="sd-card__hd">
                <div>
                  <h2>{{ period().sales }}</h2>
                  <p class="sd-card__sub">Paid orders, {{ period().versus }}</p>
                </div>
              </div>
              <se-line-chart
                [title]="period().sales + ', paid orders'"
                [labels]="seriesLabels()"
                [series]="salesSeries()"
                [formatValue]="money"
                area
              />
            </article>
          } @else if (seesOrders()) {
            <article class="sd-card sd-chart">
              <div class="sd-card__hd">
                <div>
                  <h2>Orders by status</h2>
                  <p class="sd-card__sub">Orders placed in this period</p>
                </div>
                <a class="sd-card__link" routerLink="/orders">Open orders</a>
              </div>
              <se-bar-chart
                title="Orders by status in this period"
                [labels]="statusLabels()"
                [values]="statusCounts()"
                height="sm"
              />
            </article>
          }

          @if (seesOrders()) {
            <article class="sd-card sd-sales">
              <div class="sd-card__hd">
                <div>
                  <h2>Sales overview</h2>
                  <p class="sd-card__sub">{{ period().label }}</p>
                </div>
                <a class="sd-card__link" routerLink="/orders">Orders</a>
              </div>
              <div class="sd-sales__gauge">
                <svg viewBox="0 0 330 220" role="img" [attr.aria-label]="gaugeLabel()">
                  @for (t of gaugeTicks(); track $index) {
                    <line
                      class="sd-gauge__tick"
                      [class.sd-gauge__tick--on]="t.on"
                      [attr.x1]="t.x1"
                      [attr.y1]="t.y1"
                      [attr.x2]="t.x2"
                      [attr.y2]="t.y2"
                    />
                  }
                  <text class="sd-gauge__value" x="165" y="150" text-anchor="middle">
                    {{ delivered().pct }}%
                  </text>
                  <text class="sd-gauge__label" x="165" y="174" text-anchor="middle">
                    Delivered
                  </text>
                </svg>
              </div>
              <div class="sd-sales__stats">
                <div>
                  Paid orders
                  <b>{{ paidOrders() }}</b>
                </div>
                @if (seesMoney()) {
                  <div>
                    Total sales
                    <b>{{ money(periodRevenue()) }}</b>
                  </div>
                  <div>
                    Average order
                    <b>{{ money(averageOrder()) }}</b>
                  </div>
                }
              </div>
              <p class="sd-sales__note">
                {{ delivered().delivered }} of {{ delivered().total }} orders placed in this
                period are delivered.
              </p>
            </article>
          }

          @if (seesAudit()) {
            <article class="sd-card sd-activities">
              <div class="sd-card__hd">
                <h2>Recent activity</h2>
                <a class="sd-card__link" routerLink="/audit">Audit log</a>
              </div>
              @if (activityRows().length > 0) {
                <div class="sd-rows">
                  @for (a of activityRows(); track a.id) {
                    <a class="sd-row" routerLink="/audit">
                      <span class="sd-tile" aria-hidden="true"><se-icon name="rows" /></span>
                      <span class="sd-row__tx">
                        <b>{{ a.title }}</b>
                        <small>Recorded in the audit log</small>
                      </span>
                      <span class="sd-row__when">{{ a.when }}</span>
                    </a>
                  }
                </div>
              } @else {
                <p class="sd-empty">Nothing has been recorded yet.</p>
              }
            </article>
          }

          <article class="sd-card sd-alerts">
            <div class="sd-card__hd">
              <h2>Alerts</h2>
            </div>
            @if (alertRows().length > 0) {
              <div class="sd-rows">
                @for (a of alertRows(); track a.key) {
                  <a class="sd-row" [attr.data-tone]="a.tone" [routerLink]="a.link">
                    <span class="sd-tile" aria-hidden="true"><se-icon [name]="a.icon" /></span>
                    <span class="sd-row__tx">
                      <b>{{ a.title }}</b>
                      <small>{{ a.text }}</small>
                    </span>
                    <se-icon class="sd-row__chev" name="chevron-right" />
                  </a>
                }
              </div>
            } @else {
              <p class="sd-empty">Nothing needs you right now.</p>
            }
          </article>

          @if (access.can('analytics')) {
            <article class="sd-card sd-sellers">
              <div class="sd-card__hd">
                <div>
                  <h2>Top sellers</h2>
                  <p class="sd-card__sub">All time, by units sold</p>
                </div>
                <div class="sd-seg" role="group" aria-label="Seller ranking">
                  <button
                    type="button"
                    [attr.aria-pressed]="sellingTab() === 'best'"
                    (click)="sellingTab.set('best')"
                  >
                    Best
                  </button>
                  <button
                    type="button"
                    [attr.aria-pressed]="sellingTab() === 'slow'"
                    (click)="sellingTab.set('slow')"
                  >
                    Slow
                  </button>
                </div>
              </div>
              @if (visibleSellers().length > 0) {
                <div class="sd-rows">
                  @for (s of visibleSellers(); track s.sku) {
                    <div class="sd-row">
                      <span class="sd-tile sd-tile--gold" aria-hidden="true">
                        <se-icon name="tag" />
                      </span>
                      <span class="sd-row__tx">
                        <b>{{ s.productName }}</b>
                        <small>{{ s.sku }}</small>
                      </span>
                      <span class="sd-row__amt">
                        @if (seesMoney()) {
                          <b>{{ money(s.revenue) }}</b>
                          <small>{{ plural(s.unitsSold, 'unit') }} sold</small>
                        } @else {
                          <b>{{ s.unitsSold }}</b>
                          <small>units sold</small>
                        }
                      </span>
                    </div>
                  }
                </div>
              } @else {
                <p class="sd-empty">
                  {{
                    sellingTab() === 'best'
                      ? 'No paid sales have been recorded yet.'
                      : 'No slow movers to show.'
                  }}
                </p>
              }
            </article>
          }

          @if (access.can('logistics')) {
            <article class="sd-card sd-deliveries">
              <div class="sd-card__hd">
                <div>
                  <h2>Deliveries</h2>
                  <p class="sd-card__sub">{{ deliverySummary() }}</p>
                </div>
                <a class="sd-card__link" routerLink="/logistics">Open logistics</a>
              </div>
              <div
                class="sd-prog"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                [attr.aria-valuenow]="deliveryPct()"
                aria-label="Delivery legs already moving"
              >
                <i [style.width.%]="deliveryPct()"></i>
              </div>
              @if (deliveryRows().length > 0) {
                <div class="sd-rows">
                  @for (d of deliveryRows(); track d.id) {
                    <a class="sd-row" routerLink="/logistics">
                      <span class="sd-tile" aria-hidden="true">{{ initials(d.carrier) }}</span>
                      <span class="sd-row__tx">
                        <b>{{ d.carrier }}</b>
                        <small>{{ d.order }} · {{ d.reference }}</small>
                      </span>
                      <se-status kind="delivery" [value]="d.status" />
                    </a>
                  }
                </div>
              } @else {
                <p class="sd-empty">No delivery is waiting or on the road.</p>
              }
            </article>
          }

          @if (access.can('manufacturing')) {
            <article class="sd-card sd-production">
              <div class="sd-card__hd">
                <h2>Production</h2>
                <a class="sd-card__link" routerLink="/production">Board</a>
              </div>
              @if (pipeline().length > 0) {
                <div class="sd-rows">
                  @for (s of pipeline(); track s.stage) {
                    <div class="sd-stage">
                      <div class="sd-stage__top">
                        <b>{{ s.label }}</b>
                        <span>{{ s.text }}</span>
                      </div>
                      <div class="sd-prog" aria-hidden="true">
                        <i [style.width.%]="s.size"></i>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <p class="sd-empty">No production stages are configured.</p>
              }
            </article>
          }
        </div>
      }
    </se-page>
  `,
})
export class HomePage implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly currency = inject(SeCurrencyService);
  private readonly zone = inject(NgZone);
  private readonly host = inject(ElementRef<HTMLElement>);
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
  private readonly deliveryData = signal<Array<Record<string, unknown>>>([]);
  private readonly productsTotal = signal(0);
  private readonly materialsValue = signal<number | null>(null);
  private readonly materialsCount = signal(0);
  private readonly campaigns = signal<Campaign[]>([]);
  readonly bestSellers = signal<SellerRow[]>([]);
  readonly slowMovers = signal<SellerRow[]>([]);

  // ---- what this role sees: decided once from its access ----
  /** Sales and profit are money: shown to roles that can see payments or the books. */
  readonly seesMoney = computed(() => this.access.canAny(['payments', 'accounting']));
  readonly seesOrders = computed(() => this.access.canAny(['retail_orders', 'wholesale_orders']));
  readonly seesApprovals = computed(() => this.access.can('approvals_audit', 'approve'));
  readonly seesAudit = this.seesApprovals;

  readonly money = (n: number): string => this.currency.format(n);
  readonly plural = plural;
  readonly initials = initials;
  readonly todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  readonly greeting = computed(() => {
    const name = (this.access.me()?.name ?? '').trim().split(/\s+/)[0];
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return name ? `${part}, ${name}` : part;
  });

  private motion?: ReturnType<typeof gsap.context>;
  private observer?: IntersectionObserver;
  private revealTweens: gsap.core.Tween[] = [];
  private playTimer = 0;
  private revealTimer = 0;
  private animatedRange = '';

  constructor() {
    this.load();
    this.loadSupporting();
    // Enter once per data set, after the grid has painted. Range changes replay.
    effect(() => {
      if (!this.dashboard()) return;
      const key = this.range();
      if (key === this.animatedRange && this.motion) return;
      this.animatedRange = key;
      window.clearTimeout(this.playTimer);
      this.playTimer = window.setTimeout(() => {
        this.zone.runOutsideAngular(() => requestAnimationFrame(() => this.playMotion()));
      }, 160);
    });
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.playTimer);
    window.clearTimeout(this.revealTimer);
    this.observer?.disconnect();
    this.revealTweens.forEach((t) => t.kill());
    this.motion?.revert();
  }

  /**
   * A short, one-shot entrance: welcome, then the numbers, then the chart and
   * gauge, with the lower cards revealed as they come into view. Motion only,
   * never content: reduced-motion users see the final state immediately.
   */
  private playMotion(): void {
    const root = this.host.nativeElement as HTMLElement;
    this.motion?.revert();
    this.observer?.disconnect();
    this.revealTweens.forEach((t) => t.kill());
    this.revealTweens = [];
    window.clearTimeout(this.revealTimer);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    this.motion = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.sd-welcome > *', { y: 12, autoAlpha: 0, duration: 0.5, stagger: 0.06 })
        .from(
          '.sd-kpi',
          { y: 16, autoAlpha: 0, scale: 0.985, duration: 0.55, stagger: 0.05 },
          0.05,
        )
        .from('.sd-kpi__orb', { scale: 0.6, autoAlpha: 0, duration: 0.4, stagger: 0.05 }, 0.12)
        .from(
          '.sd-chart, .sd-sales',
          { y: 18, autoAlpha: 0, duration: 0.55, stagger: 0.08 },
          0.12,
        )
        .from(
          '.sd-gauge__tick',
          { autoAlpha: 0, scale: 0.35, duration: 0.4, stagger: 0.004 },
          0.18,
        )
        .from('.sd-gauge__value, .sd-gauge__label', { autoAlpha: 0, y: 8, duration: 0.45 }, 0.3);

      const lower = Array.from(
        root.querySelectorAll<HTMLElement>(
          '.sd-activities, .sd-alerts, .sd-sellers, .sd-deliveries, .sd-production',
        ),
      );
      if (lower.length === 0) return;

      gsap.set(lower, { y: 20, autoAlpha: 0 });
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            this.observer?.unobserve(entry.target);
            this.reveal(entry.target as HTMLElement, 0);
          }
        },
        { rootMargin: '0px 0px -8% 0px' },
      );
      lower.forEach((el) => this.observer?.observe(el));
      // Safety net: never leave a card hidden if it was never observed.
      this.revealTimer = window.setTimeout(() => {
        this.observer?.disconnect();
        this.revealTweens.push(
          gsap.to(lower, { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.05 }),
        );
      }, 2500);
    }, root);
  }

  private reveal(el: HTMLElement, delay: number): void {
    this.revealTweens.push(
      gsap.to(el, { y: 0, autoAlpha: 1, duration: 0.55, delay, ease: 'power3.out' }),
    );
    const bars = el.querySelectorAll<HTMLElement>('.sd-prog > i');
    if (bars.length > 0) {
      this.revealTweens.push(
        gsap.fromTo(
          bars,
          { scaleX: 0 },
          { scaleX: 1, duration: 0.8, stagger: 0.05, delay: delay + 0.1, ease: 'power2.out' },
        ),
      );
    }
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
        next: (res) => this.deliveryData.set(res.data),
        ...quiet,
      });
    }
    if (this.access.can('inventory')) {
      this.api.products().subscribe({
        next: (res) => this.productsTotal.set(res.total),
        ...quiet,
      });
    }
    // Material value is money and lives on the raw-materials module, so only
    // roles that see money ask for it. A role without raw_materials simply
    // gets a quiet failure and no value card.
    if (this.seesMoney()) {
      this.api.materialsValuation().subscribe({
        next: (rows) => {
          this.materialsCount.set(rows.length);
          this.materialsValue.set(rows.reduce((sum, r) => sum + (r.currentValue || 0), 0));
        },
        ...quiet,
      });
    }
    if (this.access.can('marketing')) {
      this.api.campaigns().subscribe({
        next: (rows) =>
          this.campaigns.set(
            rows.map((c) => ({
              name: String(c['name'] ?? 'Campaign'),
              endDate: String(c['endDate'] ?? ''),
            })),
          ),
        ...quiet,
      });
    }
  }

  // ---- derived counts ----
  readonly lowStockCount = computed(() => {
    const low = this.lowStock();
    if (!low) return this.dashboard()?.inventory.lowStockMaterialCount ?? 0;
    return low.materials.length + low.variants.length;
  });

  readonly outOfStock = computed(() => {
    const low = this.lowStock();
    if (!low) {
      return (this.dashboard()?.inventory.lowStockMaterials ?? []).filter(
        (m) => m.currentQuantity <= 0,
      ).length;
    }
    return [...low.materials, ...low.variants].filter((i) => i.currentQuantity <= 0).length;
  });

  readonly inTransit = computed(
    () => this.deliveryData().filter((d) => d['status'] === 'in_transit').length,
  );
  readonly deliveryWaiting = computed(
    () => this.deliveryData().filter((d) => d['status'] === 'pending').length,
  );
  readonly deliveryPct = computed(() => {
    const total = this.inTransit() + this.deliveryWaiting();
    return total ? Math.round((this.inTransit() / total) * 100) : 0;
  });
  readonly deliverySummary = computed(() => {
    const moving = this.inTransit();
    const waiting = this.deliveryWaiting();
    if (moving + waiting === 0) return 'Nothing waiting to go';
    return `${plural(moving, 'leg')} in transit, ${plural(waiting, 'leg')} waiting to go`;
  });
  readonly campaignsEnding = computed(() => {
    const now = Date.now();
    return this.campaigns().filter((c) => {
      if (!c.endDate) return false;
      const end = new Date(`${c.endDate}T23:59:59`).getTime();
      const days = (end - now) / 86_400_000;
      return !Number.isNaN(days) && days >= 0 && days <= 3;
    }).length;
  });

  readonly ledeBits = computed<string[]>(() => {
    const d = this.dashboard();
    if (!d) return [];
    const bits: string[] = [];
    if (this.seesOrders()) bits.push(`${plural(d.metrics.openOrders, 'order')} still open`);
    if (this.access.can('inventory')) {
      bits.push(`${plural(this.lowStockCount(), 'item')} low on stock`);
    }
    if (this.seesMoney()) bits.push(`${this.money(d.salesToday.revenue)} paid today`);
    return bits;
  });

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
        icon: 'chart',
        ...c,
      });
    };

    if (this.access.can('inventory')) {
      card({
        key: 'stock',
        label: 'Items in stock',
        value: d.inventory.finishedGoodsUnits,
        hint: plural(this.productsTotal(), 'product'),
        link: '/inventory',
        icon: 'box',
      });
      const materials = this.lowStock()?.materials.length ?? d.inventory.lowStockMaterialCount;
      const sizes = this.lowStock()?.variants.length ?? 0;
      const out = this.outOfStock();
      card({
        key: 'low',
        label: 'Low stock',
        value: this.lowStockCount(),
        hint:
          materials + sizes === 0
            ? 'Everything is above its reorder level'
            : `${plural(materials, 'material')}, ${plural(sizes, 'product size')}${
                out ? ` · ${out} out` : ''
              }`,
        link: '/inventory',
        icon: 'alert',
        goodDirection: 'down',
      });
    }
    if (this.seesMoney() && this.materialsValue() !== null) {
      card({
        key: 'value',
        label: 'Materials stock value',
        value: this.money(this.materialsValue() ?? 0),
        hint: `${plural(this.materialsCount(), 'material')} at last purchase cost`,
        link: '/materials',
        icon: 'bank',
      });
    }
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
        icon: 'chart',
      });
    }
    if (this.access.can('accounting')) {
      card({
        key: 'profit',
        label: 'Profit and loss',
        value: this.money(d.profitLoss.net),
        hint: `To date: ${this.money(d.profitLoss.income)} in, ${this.money(d.profitLoss.expenditure)} out`,
        link: '/accounting',
        icon: 'receipt',
      });
    }
    if (this.seesOrders() && !this.seesMoney()) {
      card({
        key: 'open',
        label: 'Open orders',
        value: d.metrics.openOrders,
        hint: 'Still moving towards delivery',
        link: '/orders',
        icon: 'cart',
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
        icon: 'factory',
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
        icon: 'clipboard-check',
      });
    }
    if (this.access.can('returns') && !this.seesMoney()) {
      card({
        key: 'returns',
        label: 'Returns waiting',
        value: this.returnsWaiting(),
        hint: 'Requests not yet checked',
        link: '/returns',
        icon: 'undo',
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

  // ---- sales overview ----
  readonly paidOrders = computed(() =>
    (this.dashboard()?.series ?? []).reduce((sum, p) => sum + p.orders, 0),
  );
  readonly periodRevenue = computed(() => this.dashboard()?.metrics.revenue ?? 0);
  readonly averageOrder = computed(() => {
    const orders = this.paidOrders();
    return orders ? this.periodRevenue() / orders : 0;
  });
  /**
   * The gauge shows delivered orders among those placed in the period. There is
   * no sales goal in the product, so it is not invented here.
   */
  readonly delivered = computed(() => {
    const rows = this.dashboard()?.statusBreakdown ?? [];
    const total = rows.reduce((sum, s) => sum + s.count, 0);
    const delivered = rows.find((s) => s.status === 'delivered')?.count ?? 0;
    return {
      total,
      delivered,
      pct: total ? Math.round((delivered / total) * 1000) / 10 : 0,
    };
  });
  readonly gaugeLabel = computed(
    () => `${this.delivered().pct} percent of orders placed in this period are delivered`,
  );
  readonly gaugeTicks = computed(() => {
    const pct = this.delivered().pct / 100;
    const from = -115;
    const to = 115;
    const cx = 165;
    const cy = 165;
    const r1 = 96;
    const r2 = 140;
    return Array.from({ length: GAUGE_TICKS }, (_, k) => {
      const a = ((from + ((to - from) * k) / (GAUGE_TICKS - 1)) * Math.PI) / 180;
      return {
        x1: (cx + Math.sin(a) * r1).toFixed(1),
        y1: (cy - Math.cos(a) * r1).toFixed(1),
        x2: (cx + Math.sin(a) * r2).toFixed(1),
        y2: (cy - Math.cos(a) * r2).toFixed(1),
        on: pct > 0 && k / (GAUGE_TICKS - 1) <= pct,
      };
    });
  });

  // ---- selling ----
  readonly sellingTabs = [
    { id: 'best', label: 'Best sellers' },
    { id: 'slow', label: 'Slow movers' },
  ];
  readonly sellingTab = signal('best');
  readonly visibleSellers = computed(() =>
    this.sellingTab() === 'best' ? this.bestSellers() : this.slowMovers(),
  );

  // ---- production by stage: batches from the summary, units from the live batches ----
  readonly pipeline = computed(() => {
    const d = this.dashboard();
    const order =
      this.stages().length > 0 ? this.stages() : (d?.production ?? []).map((s) => s.stage);
    const rows = order.map((stage) => {
      const batches = this.batches().filter((b) => b.stage === stage);
      const count = batches.length || (d?.production.find((s) => s.stage === stage)?.batches ?? 0);
      const units = batches.reduce((sum, b) => sum + b.quantity, 0);
      return {
        stage,
        label: statusMeaning('production', stage).label,
        count,
        text:
          count === 0
            ? '–'
            : `${plural(count, 'batch', 'batches')}${units ? ', ' + plural(units, 'unit') : ''}`,
      };
    });
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, size: Math.round((r.count / max) * 100) }));
  });

  // ---- alerts: every row comes from a live queue ----
  readonly alertRows = computed<AlertRow[]>(() => {
    const rows: AlertRow[] = [];
    const out = this.outOfStock();
    if (out > 0) {
      rows.push({
        key: 'out',
        tone: 'danger',
        title: 'Out of stock',
        text: `${plural(out, 'item')} at zero`,
        link: '/inventory',
        icon: 'alert',
      });
    }
    const low = this.lowStockCount();
    if (low > 0) {
      rows.push({
        key: 'low',
        tone: 'warning',
        title: 'Low stock',
        text: `${plural(low, 'item')} at or below the reorder level`,
        link: '/inventory',
        icon: 'box',
      });
    }
    const approvals = this.dashboard()?.pendingApprovals ?? 0;
    if (this.seesApprovals() && approvals > 0) {
      rows.push({
        key: 'approvals',
        tone: 'warning',
        title: 'Awaiting approval',
        text: `${plural(approvals, 'request')} waiting for a decision`,
        link: '/approvals',
        icon: 'clipboard-check',
      });
    }
    if (this.returnsWaiting() > 0) {
      rows.push({
        key: 'returns',
        tone: 'info',
        title: 'Returns waiting',
        text: `${plural(this.returnsWaiting(), 'return')} waiting to be checked`,
        link: '/returns',
        icon: 'undo',
      });
    }
    const campaigns = this.campaignsEnding();
    if (campaigns > 0) {
      rows.push({
        key: 'campaigns',
        tone: 'info',
        title: 'Campaign ending soon',
        text: `${plural(campaigns, 'campaign')} ends within 3 days`,
        link: '/marketing',
        icon: 'megaphone',
      });
    }
    if (this.inTransit() > 0) {
      rows.push({
        key: 'transit',
        tone: 'info',
        title: 'Deliveries in transit',
        text: `${plural(this.inTransit(), 'leg')} on the road now`,
        link: '/logistics',
        icon: 'truck',
      });
    }
    return rows.slice(0, 4);
  });

  // ---- deliveries ----
  readonly deliveryRows = computed<DeliveryRow[]>(() =>
    this.deliveryData()
      .filter((d) => d['status'] === 'pending' || d['status'] === 'in_transit')
      .slice(0, 4)
      .map((d) => {
        const order = d['order'] as { id?: string } | undefined;
        return {
          id: String(d['id'] ?? ''),
          carrier: String(d['carrier'] ?? 'Courier'),
          reference: d['trackingRef'] ? String(d['trackingRef']) : 'No tracking ref yet',
          order: order?.id ? orderRef(order.id) : 'Order',
          status: String(d['status'] ?? 'pending'),
        };
      }),
  );

  readonly activityRows = computed<ActivityRow[]>(() =>
    this.audit()
      .slice(0, 4)
      .map((entry) => ({
        id: entry.id,
        title: sentence(entry.action),
        when: ago(entry.timestamp),
      })),
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

/** "AO" for "Amaka O." — a carrier's mark in the delivery list. */
function initials(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? [words[0], words[words.length - 1]] : words)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);
}

/** Change against the comparison period, as a percentage; null when there is nothing to compare with. */
function percentChange(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

/** "just now", "19 min ago", "2 h ago", "today", "3 days ago". */
function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
