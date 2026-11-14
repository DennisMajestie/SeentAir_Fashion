import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeMoneyPipe, SeCurrencyService } from '@seentair/ui';
import { PortalStore } from '../portal.store';

@Component({
  selector: 'app-overview-page',
  imports: [DecimalPipe, RouterLink, SeMoneyPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="p2">
        <section class="card hero">
          <div class="hero-top">
            <div>
              <span class="muted small">Welcome back,</span>
              <h1>{{ store.firstName() }}</h1>
            </div>
            <span class="pill ok"><span class="dot"></span> Series A Partner</span>
          </div>
          <div class="hero-meta">
            <span><span class="material-symbols-outlined accent">sync</span>Live ledger aggregates</span>
            <span class="mono">{{ store.periodLabel() }}</span>
          </div>
        </section>

        <section class="metrics">
          <div class="metric card">
            <div class="mh"><span>Revenue Recorded</span><span class="material-symbols-outlined accent">trending_up</span></div>
            <strong>{{ d.businessOverview.totalIncome | seMoney }}</strong>
            <small class="muted">All income entries</small>
          </div>
          <div class="metric card">
            <div class="mh"><span>Net Profit</span><span class="material-symbols-outlined okc">account_balance_wallet</span></div>
            <strong>{{ d.businessOverview.profitLoss.net | seMoney }}</strong>
            <small class="muted">{{ marginLine() }}</small>
          </div>
          <div class="metric card">
            <div class="mh"><span>Distributions</span><span class="material-symbols-outlined warnc">payments</span></div>
            <strong>{{ d.profitSharing.length }}</strong>
            <small class="muted">Declared periods</small>
          </div>
          <div class="metric card">
            <div class="mh"><span>Finished Goods</span><span class="material-symbols-outlined muted">warehouse</span></div>
            <strong>{{ (d.inventoryVisibility.finishedGoodsUnits | number) ?? 0 }}u</strong>
            <small class="muted">Units in stock</small>
          </div>
        </section>

        <section class="card">
          <div class="sec-head">
            <div><h2>Profit Declared per Period</h2><span class="muted small">Distribution history</span></div>
            <a routerLink="/profit-sharing" class="link">Details</a>
          </div>
          @if (chartRows().length >= 2) {
            <div class="chart" role="img" aria-label="Profit declared per period">
              @for (row of chartRows(); track row.label) {
                <div class="barcol">
                  <span class="barval mono">{{ compact(row.value) }}</span>
                  <div class="bar" [style.height.%]="row.pct" [class.latest]="$last"></div>
                  <span class="barlabel mono">{{ row.label }}</span>
                </div>
              }
            </div>
          } @else {
            <p class="muted small">Chart appears once two or more quarterly distributions are declared.</p>
          }
        </section>

        <section class="card">
          <div class="sec-head"><h2>Latest Distribution</h2>@if (store.latestDistribution()) { <span class="badge ok">Declared</span> }</div>
          @if (store.latestDistribution(); as dist) {
            <div class="kv">
              <div><span>Your dividend</span><strong class="mono accent">{{ dist.myDividend | seMoney }}</strong></div>
              <div><span>Period</span><strong>{{ dist.period }}</strong></div>
              <div><span>Total profit declared</span><strong class="mono">{{ dist.totalProfit | seMoney }}</strong></div>
              <div><span>Dividend pool ({{ d.config.dividendsPct }}%)</span><strong class="mono">{{ dist.dividendPool | seMoney }}</strong></div>
              <div><span>Your entitlement</span><strong class="mono">{{ d.investmentInformation.equityPercentage }}% equity</strong></div>
            </div>
          } @else {
            <p class="muted small">No distributions yet. Declared quarterly from net profit ({{ store.covenantLabel() }}).</p>
          }
        </section>

        <section class="card">
          <div class="sec-head"><h2>Your Holding</h2><a routerLink="/investment" class="link">View</a></div>
          <div class="kv">
            <div><span>Invested</span><strong class="mono">{{ d.investmentInformation.investedAmount | seMoney }}</strong></div>
            <div><span>Dividends to date</span><strong class="mono okc">{{ store.lifetimeDividends() | seMoney }}</strong></div>
            <div><span>Shares held</span><strong class="mono">{{ d.investmentInformation.shares | number }} / {{ d.investmentInformation.totalShares | number }}</strong></div>
            <div><span>Equity</span><strong class="mono accent">{{ d.investmentInformation.equityPercentage }}%</strong></div>
          </div>
          <div class="quick-links">
            <a routerLink="/inventory">Inventory</a>
            <a routerLink="/reports">Accounts</a>
            <a routerLink="/documents">Documents</a>
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    :host{display:block;font-family:'Urbanist',sans-serif;}
    .p2{display:flex;flex-direction:column;gap:12px;}
    .card{background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;padding:14px;box-shadow:0 8px 24px -4px rgba(27,25,22,.05);}
    .hero-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;}
    h1{margin:2px 0 0;font:700 18px/1.2 Urbanist,sans-serif;color:#1b1916;}
    .pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font:600 11px/1 Urbanist,sans-serif;border:1px solid;white-space:nowrap;}
    .pill.ok{background:rgba(35,128,77,.12);color:#23804d;border-color:rgba(35,128,77,.3);} .dot{width:6px;height:6px;border-radius:50%;background:currentColor;}
    .hero-meta{display:flex;justify-content:space-between;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid #e8e1d3;font-size:11px;color:#7b756a;}
    .hero-meta span{display:inline-flex;align-items:center;gap:4px;} .hero-meta .material-symbols-outlined{font-size:14px;}
    .metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .metric{padding:12px;display:flex;flex-direction:column;gap:4px;}
    .mh{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#7b756a;}
    .mh .material-symbols-outlined{font-size:16px;}
    .metric strong{font:700 17px/1.1 'JetBrains Mono',monospace;color:#1b1916;margin-top:2px;word-break:break-word;}
    .sec-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;}
    h2{margin:0;font:700 14px/1.2 Urbanist,sans-serif;color:#1b1916;}
    .link{color:#c88a12;font:600 12px/1 Urbanist,sans-serif;text-decoration:none;}
    .chart{display:flex;align-items:flex-end;justify-content:space-between;gap:6px;height:140px;padding:8px 2px 0;border-bottom:1px solid #e8e1d3;}
    .barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;min-width:0;}
    .bar{width:100%;max-width:42px;border-radius:6px 6px 0 0;background:#efe3c8;min-height:6px;}
    .bar.latest{background:#c88a12;} .barval{font-size:9px;color:#7b756a;text-align:center;} .barlabel{font-size:10px;color:#7b756a;}
    .kv{display:flex;flex-direction:column;gap:8px;font-size:13px;}
    .kv>div{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid rgba(232,225,211,.6);} .kv>div:last-child{border-bottom:0;}
    .kv span{color:#7b756a;}
    .quick-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid #e8e1d3;}
    .quick-links a{font:600 12px/1 Urbanist,sans-serif;color:#1b1916;text-decoration:none;background:#f1ede5;padding:6px 10px;border-radius:999px;}
    .badge{font:600 11px/1 Urbanist,sans-serif;padding:4px 8px;border-radius:999px;border:1px solid;}
    .badge.ok{background:rgba(35,128,77,.12);color:#23804d;border-color:rgba(35,128,77,.3);}
    .muted{color:#7b756a;} .small{font-size:11px;} .mono{font-family:'JetBrains Mono',monospace;} .accent{color:#c88a12;} .okc{color:#23804d;} .warnc{color:#93600a;}
    @media (max-width:360px){.metrics{grid-template-columns:1fr;}}
  `],
})
export class OverviewPage {
  readonly store = inject(PortalStore);
  private readonly currency = inject(SeCurrencyService);

  private readonly rows = computed(() => [...(this.store.dash()?.profitSharing ?? [])].reverse().slice(-6));
  readonly chartRows = computed(() => {
    const max = Math.max(1, ...this.rows().map(r => r.totalProfit));
    return this.rows().map((r) => ({ label: r.period.replace(/^20/, "'"), value: r.totalProfit, pct: Math.max(8, (r.totalProfit / max) * 100) }));
  });

  readonly marginLine = computed(() => {
    const margin = this.store.netMarginPct();
    const net = this.store.dash()?.businessOverview.profitLoss.net ?? 0;
    const what = net < 0 ? 'Loss: expenditure exceeds income' : 'Income less expenditure';
    return margin === null ? what : `${what} · ${margin.toFixed(1)}% margin`;
  });

  compact(n: number): string {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + 'k';
    return this.currency.format(n);
  }
}
