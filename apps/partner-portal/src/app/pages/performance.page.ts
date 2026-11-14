import { Component, computed, inject } from '@angular/core';
import { SeMoneyPipe } from '@seentair/ui';
import { PortalStore } from '../portal.store';

interface IncomeRow { label: string; amount: number; }

@Component({
  selector: 'app-performance-page',
  imports: [SeMoneyPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="pg">
        <section class="card hero">
          <div class="eyebrow">Operational & Financial</div>
          <h1>Performance</h1>
          <p class="muted">Verified production and net yield ledgers from the company accounting ledger · {{ store.periodLabel() }}.</p>
        </section>

        <section class="metrics">
          <div class="metric card"><span>Recorded income</span><strong>{{ d.performance.income | seMoney }}</strong><small>All income entries</small></div>
          <div class="metric card"><span>Total expenditure</span><strong>{{ d.performance.expenditure | seMoney }}</strong><small>Materials, production, overheads</small></div>
          <div class="metric card"><span>Net operating profit</span><strong>{{ d.performance.net | seMoney }}</strong><small>Income less expenditure</small></div>
          <div class="metric card"><span>Net margin</span><strong>{{ marginText() }}</strong><small>Net profit share of revenue</small></div>
        </section>

        <section class="card">
          <div class="sec-head"><h2>Revenue breakdown</h2><span class="muted small">By ledger entry type</span></div>
          @if (incomeRows().length) {
            <div class="list">
              @for (row of incomeRows(); track row.label) {
                <div class="row"><span>{{ row.label }}</span><strong class="mono">{{ row.amount | seMoney }}</strong></div>
              }
            </div>
          } @else {
            <p class="muted small">No income entries yet. Lines appear as entries are posted to the ledger.</p>
          }
        </section>

        <section class="card">
          <div class="sec-head"><h2>Ledger totals</h2></div>
          <div class="kv">
            <div><span>Total recorded income</span><strong class="mono">{{ d.performance.income | seMoney }}</strong></div>
            <div><span>Total expenditure</span><strong class="mono">{{ d.performance.expenditure | seMoney }}</strong></div>
            <div><span>Net operating profit</span><strong class="mono" [class.ok]="d.performance.net>=0" [class.neg]="d.performance.net<0">{{ d.performance.net | seMoney }}</strong></div>
          </div>
          <p class="muted small note">Production cost basis: raw material + sewing + branding + packaging. Detailed cost-line disclosure follows officer sign-off.</p>
        </section>

        <section class="card">
          <div class="sec-head"><h2>More telemetry</h2></div>
          <div class="kv">
            <div><span>Channel mix (retail / wholesale / in-store)</span><strong>Not yet published</strong></div>
            <div><span>Top products by revenue</span><strong>Not yet published</strong></div>
            <div><span>Factory floor (batches / output / QC)</span><strong>Not yet published</strong></div>
            <div><span>Quarter-by-quarter margin trend</span><strong>Not yet published</strong></div>
          </div>
          <p class="muted small note">When released, rankings are anonymized SKU aggregates only — never individual people.</p>
        </section>
      </div>
    }
  `,
  styles: [`
    :host{display:block;font-family:'Urbanist',sans-serif;}
    .pg{display:flex;flex-direction:column;gap:12px;} .card{background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;padding:14px;box-shadow:0 8px 24px -4px rgba(27,25,22,.05);}
    .eyebrow{font:700 10px/1 'JetBrains Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#c88a12;margin-bottom:4px;}
    h1{margin:0;font:700 20px/1.2 Urbanist,sans-serif;} h2{margin:0;font:700 14px/1.2 Urbanist,sans-serif;} p{margin:6px 0 0;}
    .metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .metric{display:flex;flex-direction:column;gap:4px;padding:12px;} .metric span{color:#7b756a;font-size:11px;} .metric strong{font:700 16px/1.1 'JetBrains Mono',monospace;color:#1b1916;}
    .sec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;}
    .list,.kv{display:flex;flex-direction:column;gap:8px;}
    .row,.kv>div{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid rgba(232,225,211,.6);font-size:13px;} .row:last-child,.kv>div:last-child{border-bottom:0;}
    .kv span,.muted{color:#7b756a;} .small{font-size:11px;} .mono{font-family:'JetBrains Mono',monospace;}
    .note{margin-top:10px;} .ok{color:#23804d;} .neg{color:#b13131;}
    @media (max-width:360px){.metrics{grid-template-columns:1fr;}}
  `],
})
export class PerformancePage {
  readonly store = inject(PortalStore);

  readonly incomeRows = computed<IncomeRow[]>(() => {
    const byType = this.store.dash()?.accountsReports.income.byType ?? {};
    return Object.entries(byType)
      .filter(([, v]) => typeof v === 'number')
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([key, amount]) => ({ label: key.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()), amount: amount as number }));
  });
  readonly marginText = computed(() => {
    const m = this.store.netMarginPct();
    return m === null ? '-' : `${m.toFixed(1)}%`;
  });
}
