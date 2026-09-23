import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { PortalStore } from '../portal.store';

/**
 * Screen P4 — Operational & Financial Performance: yield ledgers, revenue &
 * cost breakdown, channel mix, product ranking, factory floor summary.
 */
@Component({
  selector: 'app-performance-page',
  imports: [CommonModule],
  template: `
    @if (store.dash(); as d) {
      <div class="page-head">
        <div class="page-head-main">
          <p class="page-kicker">Partner Governance Tier // Verified Ledger Telemetry</p>
          <h1 class="page-title">Operational &amp; Financial Performance</h1>
          <p class="page-sub">
            Verified production and net yield ledgers for the Seentair garment factory, Lagos unit —
            drawn live from the company accounting ledger.
          </p>
        </div>
        <div class="page-head-side">
          <span class="chip gold">{{ store.periodLabel() }} · Current</span>
          <!-- GAP: no per-quarter report filter endpoint — figures below are all-time ledger aggregates. -->
          <span class="chip">All-time aggregates</span>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi accent">
          <span class="kpi-label">Recorded income</span>
          <span class="kpi-value">₦{{ d.performance.income | number: '1.0-0' }}</span>
          <span class="kpi-sub">All income entries, incl. capital inflows</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Total expenditure</span>
          <span class="kpi-value">₦{{ d.performance.expenditure | number: '1.0-0' }}</span>
          <span class="kpi-sub">Materials, production &amp; overheads combined</span>
        </div>
        <div class="kpi" [class.negative]="d.performance.net < 0">
          <span class="kpi-label">Net operating profit</span>
          <span class="kpi-value">₦{{ d.performance.net | number: '1.0-0' }}</span>
          <span class="kpi-sub">Income less expenditure</span>
        </div>
        <div class="kpi" [class.negative]="(store.netMarginPct() ?? 0) < 0">
          <span class="kpi-label">Net margin</span>
          <span class="kpi-value">
            @if (store.netMarginPct() !== null) { {{ store.netMarginPct() | number: '1.0-1' }}% }
            @else { — }
          </span>
          <span class="kpi-sub">Net profit as a share of revenue</span>
        </div>
      </div>

      <div class="split">
        <section class="panel">
          <div class="panel-head">
            <h2>Ledger analysis — revenue &amp; cost breakdown</h2>
            <span class="panel-note">Audited ledger basis</span>
          </div>
          @if (incomeRows().length > 0) {
            <div class="meter-list">
              @for (row of incomeRows(); track row.label) {
                <div class="meter-row">
                  <span class="wrap">{{ row.label }}</span>
                  <div class="meter gold"><div class="meter-fill" [style.width.%]="row.pct"></div></div>
                  <span class="meter-val mono">₦{{ row.amount | number: '1.0-0' }}</span>
                </div>
              }
            </div>
          } @else {
            <p class="gap-note">No income entries recorded in the ledger yet.</p>
          }
          <div class="stmt-row total">
            <span class="stmt-label">Total recorded income (topline)</span>
            <span class="stmt-val">₦{{ d.performance.income | number: '1.0-0' }}</span>
          </div>
          <!-- GAP: expenditure is exposed as one aggregate — no COGS vs operating split for partners. -->
          <div class="stmt-row">
            <span class="stmt-label">Total expenditure (COGS + operating, aggregate)</span>
            <span class="stmt-val">(₦{{ d.performance.expenditure | number: '1.0-0' }})</span>
          </div>
          <div class="stmt-row grand">
            <span class="stmt-label">Net operating profit</span>
            <span class="stmt-val">₦{{ d.performance.net | number: '1.0-0' }}</span>
          </div>
          <p class="fine muted">
            Production cost basis: raw material + sewing + branding + packaging (confirmed cost
            model). Detailed cost-line disclosure follows officer sign-off.
          </p>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Yield trajectory — net margin trend</h2>
            <span class="panel-note">Last 4 quarters</span>
          </div>
          <!-- GAP: no quarterly report-history endpoint — margin trend cannot be drawn honestly yet. -->
          <p class="gap-note">
            Margin trend charts appear once quarterly ledger snapshots are published. The current
            all-time net margin is
            @if (store.netMarginPct() !== null) {
              <strong>{{ store.netMarginPct() | number: '1.0-1' }}%</strong>.
            } @else { not yet computable (no income recorded). }
          </p>
        </section>
      </div>

      <div class="split-half">
        <section class="panel">
          <div class="panel-head">
            <h2>Distribution mix — sales by channel</h2>
            <span class="panel-note">Retail · wholesale · in-store</span>
          </div>
          <!-- GAP: no channel-split reporting endpoint for partners. -->
          <p class="gap-note">
            Channel mix (retail storefront, wholesale portal, in-store) is not yet published to the
            partner terminal. Wholesale carries a 20-unit MOQ with tiered pricing; retail sells at
            list price.
          </p>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Top products by revenue</h2>
            <span class="panel-note">Strictly anonymized</span>
          </div>
          <!-- GAP: no product-level revenue endpoint for partners (aggregates-only boundary). -->
          <p class="gap-note">
            Product-level revenue ranking is not yet shared. When released it is strictly
            anonymized SKU telemetry — never customer-level data.
          </p>
        </section>
      </div>

      <section class="panel">
        <div class="panel-head">
          <h2>Production &amp; manufacturing floor summary</h2>
          <span class="panel-note">Lagos factory · single site</span>
        </div>
        <div class="floor-grid">
          <!-- GAP: no production/QC telemetry endpoint (batches, output pcs, defect rate, QC outcomes). -->
          <div class="floor-cell"><span>Completed batches</span><strong>—</strong><em>Not yet published</em></div>
          <div class="floor-cell"><span>Output</span><strong>—</strong><em>Not yet published</em></div>
          <div class="floor-cell"><span>Defect rate</span><strong>—</strong><em>Not yet published</em></div>
          <div class="floor-cell"><span>QC repaired / burned</span><strong>—</strong><em>Reason-coded at QC</em></div>
        </div>
        <p class="fine muted">
          Confirmed production flow: Planned → Cutting → Sewing → Finishing → QC → Completed.
          Defective rejects are burned; minor factory errors are repaired and restocked with a
          reason code.
        </p>
      </section>

      <div class="notice">
        Factory scrap remains tightly controlled under the QC covenant, protecting fabric inventory
        valuation. All figures on this screen derive from the audited single-source company ledger.
      </div>
    }
  `,
  styles: [
    `
      .meter-list { margin-bottom: 0.6rem; }
      .fine { font-size: var(--type-label-sm); margin: 0.6rem 0 0; }
      .floor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px;
        background: var(--hairline); border: 1px solid var(--hairline); }
      .floor-cell { background: var(--panel-2); padding: 0.65rem 0.75rem; display: flex; flex-direction: column; gap: 0.05rem;
        span { font-size: var(--type-label-sm); text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-dim); }
        strong { font-size: 1.15rem; }
        em { font-style: normal; font-size: var(--type-label-sm); color: var(--ink-dim); } }
    `,
  ],
})
export class PerformancePage {
  readonly store = inject(PortalStore);

  /** Real revenue-by-ledger-type rows from accountsReports.income.byType. */
  readonly incomeRows = computed(() => {
    const income = this.store.dash()?.accountsReports.income;
    const byType = income?.byType ?? {};
    const entries = Object.entries(byType).filter(([, v]) => typeof v === 'number');
    const max = Math.max(...entries.map(([, v]) => v), 1);
    return entries
      .sort((a, b) => b[1] - a[1])
      .map(([key, amount]) => ({
        label: key.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
        amount,
        pct: Math.max(2, (amount / max) * 100),
      }));
  });
}
