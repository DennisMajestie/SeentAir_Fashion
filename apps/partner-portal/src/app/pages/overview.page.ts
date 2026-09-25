import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { PortalStore } from '../portal.store';

/**
 * Screen P2 — Business Overview: executive performance summary, financial
 * velocity trajectory, distribution rail, business-in-brief, cap-table strip.
 */
@Component({
  selector: 'app-overview-page',
  imports: [CommonModule],
  template: `
    @if (store.dash(); as d) {
      <div class="page-head">
        <div class="page-head-main">
          <p class="page-kicker">{{ store.periodLabel() }} Executive Performance Summary // Confidential LP Briefing</p>
          <h1 class="page-title">Welcome back, {{ store.firstName() }}.</h1>
          <p class="page-sub">
            Operational review and capital allocation metrics from the live company ledger —
            aggregates only, updated continuously.
          </p>
        </div>
        <div class="page-head-side">
          <div class="kpi mini">
            <span class="kpi-label">Audit certification</span>
            <span class="kpi-value sm">Management Certified</span>
          </div>
          <div class="kpi mini">
            <span class="kpi-label">Shareholder class</span>
            <span class="kpi-value sm">{{ d.investmentInformation.equityPercentage }}% Ordinary</span>
          </div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi accent">
          <span class="kpi-label">Revenue recorded</span>
          <span class="kpi-value">₦{{ d.businessOverview.totalIncome | number: '1.0-0' }}</span>
          <span class="kpi-sub">All income entries in the company ledger</span>
        </div>
        <div class="kpi" [class.negative]="d.businessOverview.profitLoss.net < 0">
          <span class="kpi-label">
            Net profit / loss
            @if (store.netMarginPct() !== null) {
              <span class="delta" [class.neg]="d.businessOverview.profitLoss.net < 0"
                >{{ store.netMarginPct() | number: '1.0-1' }}% margin</span
              >
            }
          </span>
          <span class="kpi-value">₦{{ d.businessOverview.profitLoss.net | number: '1.0-0' }}</span>
          <span class="kpi-sub">Income less expenditure, all periods</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Distributions declared</span>
          <span class="kpi-value">{{ d.profitSharing.length }}</span>
          <span class="kpi-sub">Quarterly profit-sharing periods</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Factory output in stock</span>
          <span class="kpi-value">{{ d.inventoryVisibility.finishedGoodsUnits | number }}</span>
          <span class="kpi-sub">Finished garment units — aggregates only</span>
        </div>
      </div>

      <div class="split">
        <div>
          <section class="panel">
            <div class="panel-head">
              <h2>Financial velocity — distributed profit trajectory</h2>
              <span class="panel-note">Per declared period</span>
            </div>
            @if (trend().length >= 2) {
              <svg class="trend" [attr.viewBox]="'0 0 ' + vbW + ' 150'" role="img"
                   aria-label="Distributable profit by declared period">
                @for (b of trend(); track b.period) {
                  <g>
                    <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="barW" [attr.height]="b.h"
                          rx="2" fill="var(--gold)">
                      <title>{{ b.period }} — ₦{{ b.value | number: '1.0-0' }}</title>
                    </rect>
                    <text [attr.x]="b.x + barW / 2" y="146" text-anchor="middle" class="axis-label">
                      {{ b.period }}
                    </text>
                    @if (b.last) {
                      <text [attr.x]="b.x + barW / 2" [attr.y]="b.y - 5" text-anchor="middle" class="value-label">
                        ₦{{ b.value | number: '1.0-0' }}
                      </text>
                    }
                  </g>
                }
              </svg>
              <p class="fine muted">Total company profit declared for distribution each period (₦).</p>
            } @else {
              <!-- GAP: no quarterly revenue/profit history endpoint — the trajectory chart can only
                   be drawn from declared distribution periods; fewer than two exist. -->
              <p class="gap-note">
                The trajectory chart appears once at least two quarterly distribution periods have
                been declared. Revenue history by quarter is not yet published to partners.
              </p>
            }
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2>Management commentary</h2>
              <span class="panel-note">Managing Director notes</span>
            </div>
            <!-- GAP: no management-commentary endpoint — honest empty state, no fabricated notes. -->
            <div class="empty-state">
              <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
              <h2 class="empty-state-title">No commentary yet</h2>
              <p class="empty-state-sub">Quarterly operating notes from the Managing Director appear here when released.</p>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2>Business in brief</h2>
              <span class="panel-note">Operational headlines</span>
            </div>
            <!-- GAP: no operational-headlines endpoint (production lines, sourcing, treasury notes). -->
            <div class="empty-state">
              <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
              <h2 class="empty-state-title">No headlines yet</h2>
              <p class="empty-state-sub">Operational headlines are published here with each quarterly briefing.</p>
            </div>
          </section>
        </div>

        <div>
          <section class="panel">
            <div class="panel-head">
              <h2>Latest distribution</h2>
            </div>
            @if (store.latestDistribution(); as dist) {
              <p class="rail-kicker">Authorized distribution from audited net profits</p>
              <p class="rail-figure">₦{{ dist.myDividend | number: '1.0-0' }}</p>
              <p class="rail-figure-sub">Your dividend — {{ dist.period }} · {{ d.investmentInformation.equityPercentage }}% equity entitlement</p>
              <div class="rail-rows">
                <div class="rail-row"><span>Period</span><strong class="mono">{{ dist.period }}</strong></div>
                <div class="rail-row"><span>Total profit declared</span><strong>₦{{ dist.totalProfit | number: '1.0-0' }}</strong></div>
                <div class="rail-row"><span>Dividend pool ({{ d.config.dividendsPct }}%)</span><strong>₦{{ dist.dividendPool | number: '1.0-0' }}</strong></div>
                <!-- GAP: settlement method/date & designated vault are not exposed by the API. -->
                <div class="rail-row"><span>Settlement details</span><strong>Issued by Seentair HQ</strong></div>
              </div>
            } @else {
              <div class="empty-state">
                <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
                <h2 class="empty-state-title">No distributions yet</h2>
                <p class="empty-state-sub">Dividends are declared quarterly from audited net profit ({{ store.covenantLabel() }}).</p>
              </div>
            }
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2>Production centre — Aba</h2>
            </div>
            <!-- GAP: no facility media/telemetry endpoint (reference shows a live floor photo card). -->
            <p class="gap-note">
              Continuous single-factory operation — cutting, sewing, finishing, QC. Floor imagery
              and line telemetry are not yet shared to the partner terminal.
            </p>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2>Cap table &amp; holding position</h2>
              <span class="panel-note">Confidential</span>
            </div>
            <div class="rail-rows">
              <div class="rail-row"><span>Initial equity contribution</span><strong>₦{{ d.investmentInformation.investedAmount | number: '1.0-0' }}</strong></div>
              <div class="rail-row"><span>Cumulative dividends paid</span><strong>₦{{ store.lifetimeDividends() | number: '1.0-0' }}</strong></div>
              <div class="rail-row"><span>Shares held</span><strong>{{ d.investmentInformation.shares | number }} of {{ d.investmentInformation.totalShares | number }}</strong></div>
              <!-- GAP: no share-valuation endpoint — implied holding value is not computable honestly. -->
              <div class="rail-row"><span>Current implied holding value</span><strong>Not yet valued</strong></div>
            </div>
          </section>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .kpi.mini { padding: 0.6rem 0.8rem; min-width: 150px; }
      .kpi-value.sm { font-size: 0.95rem; }
      .trend { width: 100%; height: auto; display: block; }
      .axis-label { font-size: 9px; fill: var(--ink-dim); font-family: inherit; }
      .value-label { font-size: 10px; font-weight: 700; fill: var(--ink); font-variant-numeric: tabular-nums; }
      .fine { font-size: var(--type-label-sm); margin: 0.5rem 0 0; }
      .rail-kicker { margin: 0 0 0.4rem; font-size: var(--type-label-sm); text-transform: uppercase;
        letter-spacing: 0.1em; color: var(--ink-dim); }
      .rail-figure { margin: 0; font-size: 1.5rem; font-weight: 700; color: var(--acid-ink);
        font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
      .rail-figure-sub { margin: 0.15rem 0 0.8rem; font-size: var(--type-body-sm); color: var(--ink-dim); }
      .rail-rows { display: flex; flex-direction: column; }
      .rail-row { display: flex; justify-content: space-between; gap: 0.8rem; padding: 0.45rem 0;
        border-bottom: 1px solid var(--hairline); font-size: var(--type-body-sm);
        span { color: var(--ink-dim); }
        strong { font-variant-numeric: tabular-nums; text-align: right; }
        &:last-child { border-bottom: 0; } }
    `,
  ],
})
export class OverviewPage {
  readonly store = inject(PortalStore);
  readonly vbW = 560;
  readonly barW = 46;

  /** Distributed-profit bars, oldest → newest (API returns DESC). */
  readonly trend = computed(() => {
    const rows = [...(this.store.dash()?.profitSharing ?? [])].reverse().slice(-8);
    if (rows.length < 2) return [];
    const max = Math.max(...rows.map((r) => r.totalProfit), 1);
    const plotH = 118;
    const gap = (this.vbW - rows.length * this.barW) / (rows.length + 1);
    return rows.map((r, i) => {
      const h = Math.max(4, (r.totalProfit / max) * plotH);
      return {
        period: r.period,
        value: r.totalProfit,
        x: gap + i * (this.barW + gap),
        y: 130 - h,
        h,
        last: i === rows.length - 1,
      };
    });
  });
}
