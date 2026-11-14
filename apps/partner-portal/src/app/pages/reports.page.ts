import { Component, computed, inject } from '@angular/core';
import { SeMoneyPipe } from '@seentair/ui';
import { PortalStore } from '../portal.store';

interface IncomeRow { label: string; amount: number; }

@Component({
  selector: 'app-reports-page',
  imports: [SeMoneyPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="pg">
        <section class="card hero">
          <div class="eyebrow">Statutory Accounts & Reports</div>
          <h1>Accounts & Reports</h1>
          <p class="muted">Statement lines drawn live from the single-source company ledger · {{ store.periodLabel() }}.</p>
          <span class="chip ok">Ledger reconciled</span>
        </section>

        <section class="metrics">
          <div class="metric card"><span>Net margin</span><strong>{{ netMarginText() }}</strong><small>Net profit share of revenue</small></div>
          <div class="metric card"><span>Expense ratio</span><strong>{{ expenseRatioText() }}</strong><small>Outflows against revenue</small></div>
          <div class="metric card"><span>Profit covenant</span><strong>{{ store.covenantLabel() }}</strong><small>Reinvest / dividends / reserve</small></div>
          <div class="metric card"><span>Total income</span><strong>{{ d.accountsReports.income.total | seMoney }}</strong><small>Recorded in ledger</small></div>
        </section>

        <section class="card">
          <div class="sec-head"><h2>Income recognised</h2><span class="muted small">By entry type</span></div>
          @if (incomeRows().length) {
            <div class="list">
              @for (row of incomeRows(); track row.label) {
                <div class="row"><span>{{ row.label }}</span><strong class="mono">{{ row.amount | seMoney }}</strong></div>
              }
            </div>
          } @else {
            <p class="muted small">No income entries yet. Lines appear as entries are posted.</p>
          }
        </section>

        <section class="card">
          <div class="sec-head"><h2>Statement totals</h2></div>
          <div class="kv">
            <div><span>Total recorded income</span><strong class="mono">{{ d.accountsReports.income.total | seMoney }}</strong></div>
            <div><span>Combined expenditure</span><strong class="mono">{{ d.accountsReports.profit.expenditure | seMoney }}</strong></div>
            <div><span>Net distributable profit</span><strong class="mono accent">{{ d.accountsReports.profit.net | seMoney }}</strong></div>
          </div>
          <p class="muted small note">Distributable under the {{ store.covenantLabel() }} covenant once declared and approval-gated as a fund movement.</p>
        </section>

        <section class="card">
          <div class="sec-head"><h2>Profit allocation covenant</h2></div>
          <div class="dist">
            @for (row of covenantRows(); track row.label) {
              <div class="drow">
                <div class="dtop"><span>{{ row.label }}</span><strong class="mono">{{ row.value }}%</strong></div>
                <div class="track"><div class="fill" [class.accent]="row.label==='Dividends'" [style.width.%]="row.value"></div></div>
              </div>
            }
          </div>
        </section>

        <section class="card">
          <div class="sec-head"><h2>Signatories & document shelf</h2></div>
          <div class="kv">
            <div><span>Managing Director</span><strong>Signature on file</strong></div>
            <div><span>Company Secretary</span><strong>Signature on file</strong></div>
            <div><span>External Auditors</span><strong>Engagement on file</strong></div>
          </div>
          <div class="empty-grid">
            <div class="ebox">Quarterly income & profit statement · Not yet uploaded</div>
            <div class="ebox">Cost & working capital schedule · Not yet uploaded</div>
            <div class="ebox">Management letter · Not yet uploaded</div>
            <div class="ebox">Audited annual report · Not yet uploaded</div>
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    :host{display:block;font-family:'Urbanist',sans-serif;}
    .pg{display:flex;flex-direction:column;gap:12px;} .card{background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;padding:14px;box-shadow:0 8px 24px -4px rgba(27,25,22,.05);}
    .eyebrow{font:700 10px/1 'JetBrains Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#c88a12;margin-bottom:4px;}
    h1{margin:0;font:700 20px/1.2 Urbanist,sans-serif;} h2{margin:0;font:700 14px/1.2 Urbanist,sans-serif;} p{margin:6px 0 0;}
    .chip{display:inline-block;margin-top:8px;font:600 11px/1 Urbanist,sans-serif;padding:5px 9px;border-radius:999px;background:#f1ede5;border:1px solid #e8e1d3;}
    .chip.ok{background:rgba(35,128,77,.12);color:#23804d;border-color:rgba(35,128,77,.25);}
    .metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .metric{display:flex;flex-direction:column;gap:4px;padding:12px;} .metric span{color:#7b756a;font-size:11px;} .metric strong{font:700 16px/1.1 'JetBrains Mono',monospace;color:#1b1916;}
    .sec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;}
    .list,.kv,.dist{display:flex;flex-direction:column;gap:8px;}
    .row,.kv>div{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid rgba(232,225,211,.6);font-size:13px;} .row:last-child,.kv>div:last-child{border-bottom:0;}
    .dtop{display:flex;justify-content:space-between;font-size:13px;} .track{height:8px;background:#efeae0;border-radius:999px;overflow:hidden;margin-top:5px;} .fill{height:100%;background:#b6aa97;border-radius:999px;} .fill.accent{background:#c88a12;}
    .empty-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;}
    .ebox{padding:10px;border:1px dashed #d8cfbf;border-radius:10px;font:500 11px/1.35 Urbanist,sans-serif;color:#7b756a;background:#fbf8f2;}
    .kv span,.muted{color:#7b756a;} .small{font-size:11px;} .mono{font-family:'JetBrains Mono',monospace;} .accent{color:#c88a12;} .note{margin-top:10px;}
    @media (max-width:360px){.metrics,.empty-grid{grid-template-columns:1fr;}}
  `],
})
export class ReportsPage {
  readonly store = inject(PortalStore);

  readonly incomeRows = computed<IncomeRow[]>(() => {
    const byType = this.store.dash()?.accountsReports.income.byType ?? {};
    return Object.entries(byType)
      .filter(([, v]) => typeof v === 'number')
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([key, amount]) => ({ label: key.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()), amount: amount as number }));
  });
  readonly netMarginText = computed(() => { const m = this.store.netMarginPct(); return m === null ? '-' : `${m.toFixed(1)}%`; });
  readonly expenseRatioText = computed(() => {
    const p = this.store.dash()?.accountsReports.profit;
    if (!p || !p.income) return '-';
    return `${((p.expenditure / p.income) * 100).toFixed(1)}%`;
  });
  readonly covenantRows = computed(() => {
    const c = this.store.dash()?.config;
    return [
      { label: 'Reinvestment', value: c?.reinvestmentPct ?? 40 },
      { label: 'Dividends', value: c?.dividendsPct ?? 40 },
      { label: 'Reserve', value: c?.reservePct ?? 20 },
    ];
  });
}
