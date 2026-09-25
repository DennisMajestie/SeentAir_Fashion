import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { PortalStore } from '../portal.store';

/**
 * Screen P6 — Statutory Financial Accounts & Executive Reports: statement
 * shelf, financial ratios, interim statement of comprehensive income,
 * signatories. Statement lines come from the live accounting ledger.
 */
@Component({
  selector: 'app-reports-page',
  imports: [CommonModule],
  template: `
    @if (store.dash(); as d) {
      <div class="page-head">
        <div class="page-head-main">
          <p class="page-kicker">Statutory Registry // Executive Reporting Shelf</p>
          <h1 class="page-title">Statutory Financial Accounts &amp; Executive Reports</h1>
          <p class="page-sub">
            Verified financial records and quarterly audits — statement lines are drawn live from
            the single-source company ledger.
          </p>
        </div>
        <div class="page-head-side">
          <span class="chip ok">Ledger reconciled</span>
          <span class="chip">{{ store.periodLabel() }}</span>
        </div>
      </div>

      <!-- GAP: no report-document endpoint — the statement shelf renders its four approved slots
           with honest pending states instead of downloadable files. -->
      <div class="shelf">
        <div class="shelf-card">
          <span class="shelf-kind">Quarterly</span>
          <strong>Income &amp; profit statement</strong>
          <span class="shelf-status">Not yet uploaded</span>
        </div>
        <div class="shelf-card">
          <span class="shelf-kind">Schedule</span>
          <strong>Cost &amp; working capital</strong>
          <span class="shelf-status">Not yet uploaded</span>
        </div>
        <div class="shelf-card">
          <span class="shelf-kind">Letter</span>
          <strong>Management letter</strong>
          <span class="shelf-status">Not yet uploaded</span>
        </div>
        <div class="shelf-card">
          <span class="shelf-kind">Annual</span>
          <strong>Audited annual report</strong>
          <span class="shelf-status">Not yet uploaded</span>
        </div>
      </div>

      <div class="split-half ratios">
        <section class="panel">
          <div class="panel-head"><h2>Net margin</h2><span class="panel-note">Ledger basis</span></div>
          @if (store.netMarginPct() !== null) {
            <p class="ratio-figure" [class.neg]="(store.netMarginPct() ?? 0) < 0">
              {{ store.netMarginPct() | number: '1.0-1' }}%
            </p>
            <div class="meter gold">
              <div class="meter-fill" [style.width.%]="clampPct(store.netMarginPct() ?? 0)"></div>
            </div>
            <p class="fine muted">Net profit retained from every ₦1 of recorded revenue.</p>
          } @else {
            <p class="gap-note">No revenue recorded yet — margin not computable.</p>
          }
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Expense ratio</h2><span class="panel-note">Of revenue</span></div>
          @if (expenseRatioPct() !== null) {
            <p class="ratio-figure">{{ expenseRatioPct() | number: '1.0-1' }}%</p>
            <div class="meter">
              <div class="meter-fill" [style.width.%]="clampPct(expenseRatioPct() ?? 0)"></div>
            </div>
            <p class="fine muted">Combined production and operating outflows against revenue.</p>
          } @else {
            <p class="gap-note">No revenue recorded yet — ratio not computable.</p>
          }
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Profit allocation covenant</h2><span class="panel-note">40 / 40 / 20</span></div>
          <div class="donut-wrap compact">
            <div class="donut small" [style.background]="covenantDonut" role="img"
                 aria-label="Profit allocation covenant: 40% reinvestment, 40% dividends, 20% reserve">
              <div class="donut-hole"><span>Net profit</span><strong>100%</strong></div>
            </div>
            <div class="legend">
              <div class="legend-row"><span class="swatch" style="background: var(--ink-dim)"></span>Reinvestment<span class="legend-val">40%</span></div>
              <div class="legend-row"><span class="swatch" style="background: var(--gold)"></span>Dividends<span class="legend-val">40%</span></div>
              <div class="legend-row"><span class="swatch" style="background: var(--hairline-2)"></span>Reserve<span class="legend-val">20%</span></div>
            </div>
          </div>
        </section>
      </div>

      <section class="panel statement">
        <div class="letterhead">
          <img src="assets/logo.png" alt="SEENTAIR" height="24" />
          <div class="letterhead-meta">
            <strong>Seentair Limited — Aba, Nigeria</strong>
            <span>Interim statement of comprehensive income · continuous ledger basis · {{ store.periodLabel() }}</span>
          </div>
          <span class="chip">₦ NGN</span>
        </div>

        <p class="num-head"><span class="num">1.</span> Income recognised in the company ledger <span class="tail">By ledger entry type</span></p>
        @if (incomeRows().length > 0) {
          @for (row of incomeRows(); track row.label) {
            <div class="stmt-row">
              <span class="stmt-label">{{ row.label }}</span>
              <span class="stmt-val">₦{{ row.amount | number: '1.0-0' }}</span>
            </div>
          }
        } @else {
          <div class="stmt-row"><span class="stmt-label muted">No income entries recorded yet</span><span class="stmt-val">—</span></div>
        }
        <div class="stmt-row total">
          <span class="stmt-label">Total recorded income</span>
          <span class="stmt-val">₦{{ d.accountsReports.income.total | number: '1.0-0' }}</span>
        </div>

        <p class="num-head"><span class="num">2.</span> Cost of goods sold &amp; operating overheads <span class="tail">Aggregate basis</span></p>
        <!-- GAP: the partner ledger report exposes expenditure as one aggregate — no COGS vs
             admin-overhead split until officer sign-off. -->
        <div class="stmt-row">
          <span class="stmt-label">Combined production &amp; operating expenditure</span>
          <span class="stmt-val">(₦{{ d.accountsReports.profit.expenditure | number: '1.0-0' }})</span>
        </div>
        <div class="stmt-row total">
          <span class="stmt-label">Total outflows</span>
          <span class="stmt-val">(₦{{ d.accountsReports.profit.expenditure | number: '1.0-0' }})</span>
        </div>

        <div class="stmt-row grand">
          <span class="stmt-label">Net distributable profit</span>
          <span class="stmt-val">₦{{ d.accountsReports.profit.net | number: '1.0-0' }}</span>
        </div>
        <p class="fine muted">
          Distributable under the 40 / 40 / 20 covenant once declared for a quarterly period and
          approval-gated as a fund movement.
        </p>
      </section>

      <div class="split-half">
        <!-- GAP: signatory names/roles are not exposed by the API — role slots render with
             on-file placeholders. -->
        <div class="panel sig"><span class="sig-role">Managing Director</span><strong>Signature on file</strong><span class="muted">Executive certification</span></div>
        <div class="panel sig"><span class="sig-role">Company Secretary</span><strong>Signature on file</strong><span class="muted">Statutory registrar</span></div>
        <div class="panel sig"><span class="sig-role">External Auditors</span><strong>Engagement on file</strong><span class="muted">Independent review</span></div>
      </div>

      <div class="notice">
        Prepared in accordance with the Companies and Allied Matters Act (CAMA 2020) and applicable
        Nigerian financial reporting standards. This shelf is read-only; statements become
        downloadable here once countersigned and released.
      </div>
    }
  `,
  styles: [
    `
      .shelf { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.8rem; margin-bottom: 1rem; }
      .shelf-card { border: 1px solid var(--hairline); background: var(--panel); padding: 0.8rem 0.9rem;
        display: flex; flex-direction: column; gap: 0.25rem;
        .shelf-kind { font-size: var(--type-label-sm); text-transform: uppercase; letter-spacing: 0.12em; color: var(--acid-ink); font-weight: 700; }
        strong { font-size: var(--type-body-md); }
        .shelf-status { font-size: var(--type-label-sm); color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.08em;
          border: 1px dashed var(--hairline-2); padding: 0.2rem 0.4rem; align-self: flex-start; } }
      .ratios .panel { margin-bottom: 0; }
      .ratio-figure { margin: 0 0 0.5rem; font-size: 1.7rem; font-weight: 700; font-variant-numeric: tabular-nums;
        &.neg { color: var(--danger); } }
      .fine { font-size: var(--type-label-sm); margin: 0.5rem 0 0; }
      .donut-wrap.compact .donut.small { width: 110px; height: 110px; flex-basis: 110px; }
      .statement { margin-top: 0.9rem; }
      .letterhead { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap;
        border-bottom: 2px solid var(--ink); padding-bottom: 0.7rem; margin-bottom: 0.5rem;
        img { display: block; height: 24px; width: auto; }
        .letterhead-meta { display: flex; flex-direction: column; min-width: 0;
          strong { font-size: var(--type-body-md); }
          span { font-size: var(--type-label-sm); color: var(--ink-dim); } }
        .chip { margin-left: auto; } }
      .sig { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0;
        .sig-role { font-size: var(--type-label-sm); text-transform: uppercase; letter-spacing: 0.12em; color: var(--acid-ink); font-weight: 700; }
        strong { font-size: var(--type-body-md); }
        span.muted { font-size: var(--type-label-sm); } }
    `,
  ],
})
export class ReportsPage {
  readonly store = inject(PortalStore);

  /** Static confirmed covenant — 40% reinvestment (ink-dim), 40% dividends (gold), 20% reserve. */
  readonly covenantDonut =
    'conic-gradient(var(--ink-dim) 0deg 142deg, var(--panel) 142deg 144deg,' +
    ' var(--gold) 144deg 286deg, var(--panel) 286deg 288deg,' +
    ' var(--hairline-2) 288deg 358deg, var(--panel) 358deg 360deg)';

  readonly expenseRatioPct = computed(() => {
    const p = this.store.dash()?.accountsReports.profit;
    if (!p || !p.income) return null;
    return (p.expenditure / p.income) * 100;
  });

  readonly incomeRows = computed(() => {
    const byType = this.store.dash()?.accountsReports.income.byType ?? {};
    return Object.entries(byType)
      .filter(([, v]) => typeof v === 'number')
      .sort((a, b) => b[1] - a[1])
      .map(([key, amount]) => ({
        label: key.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
        amount,
      }));
  });

  clampPct(v: number): number {
    return Math.min(100, Math.max(0, v));
  }
}
