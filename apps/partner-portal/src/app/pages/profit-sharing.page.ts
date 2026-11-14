import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { SeMoneyPipe } from '@seentair/ui';
import { PortalStore } from '../portal.store';

interface PayoutRow { id: string; period: string; totalProfit: number; dividendPool: number; myDividend: number; }

@Component({
  selector: 'app-profit-sharing-page',
  imports: [DecimalPipe, SeMoneyPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="pg">
        <section class="card hero">
          <div class="eyebrow">Profit Sharing & Dividends</div>
          <h1>Dividends</h1>
          <p class="muted">Quarterly distribution allocation for ordinary share equity partners, declared from audited net profit.</p>
          <span class="chip">{{ store.covenantLabel() }} covenant</span>
        </section>

        @if (store.latestDistribution(); as latest) {
          <section class="metrics">
            <div class="metric card"><span>Latest profit declared</span><strong>{{ latest.totalProfit | seMoney }}</strong><small>{{ latest.period }} · board approved</small></div>
            <div class="metric card"><span>Dividend pool</span><strong>{{ latest.dividendPool | seMoney }}</strong><small>{{ d.config.dividendsPct }}% of quarterly net</small></div>
            <div class="metric card"><span>Your dividend</span><strong class="accent">{{ latest.myDividend | seMoney }}</strong><small>{{ d.investmentInformation.equityPercentage }}% entitlement</small></div>
            <div class="metric card"><span>Lifetime dividends</span><strong>{{ store.lifetimeDividends() | seMoney }}</strong><small>{{ cashOnCashHint() }}</small></div>
          </section>

          <section class="card">
            <div class="sec-head"><h2>Allocation break-up</h2><span class="muted small">{{ latest.period }}</span></div>
            <div class="kv">
              <div><span>Capital reinvestment ({{ d.config.reinvestmentPct }}%)</span><strong class="mono">{{ reinvestment(latest.totalProfit) | seMoney }}</strong></div>
              <div><span>Dividend payout pool ({{ d.config.dividendsPct }}%)</span><strong class="mono">{{ latest.dividendPool | seMoney }}</strong></div>
              <div><span>Strategic reserve ({{ d.config.reservePct }}%)</span><strong class="mono">{{ reserve(latest.totalProfit) | seMoney }}</strong></div>
              <div><span>Total profit declared</span><strong class="mono accent">{{ latest.totalProfit | seMoney }}</strong></div>
            </div>
          </section>

          <section class="card">
            <div class="sec-head"><h2>Your account</h2></div>
            <div class="kv">
              <div><span>Your dividend</span><strong class="mono accent">{{ latest.myDividend | seMoney }}</strong></div>
              <div><span>Equity entitlement</span><strong class="mono">{{ d.investmentInformation.equityPercentage }}%</strong></div>
              <div><span>Shares held</span><strong class="mono">{{ d.investmentInformation.shares | number }} / {{ d.investmentInformation.totalShares | number }}</strong></div>
              @if (cashOnCash() !== null) { <div><span>Cash-on-cash</span><strong class="mono">{{ cashOnCash() | number:'1.0-1' }}%</strong></div> }
              <div><span>Settlement</span><strong>Advised per remittance</strong></div>
            </div>
          </section>
        } @else {
          <section class="card"><p class="muted">No distributions yet. Dividends are declared quarterly from audited net profit ({{ store.covenantLabel() }}).</p></section>
        }

        <section class="card">
          <div class="sec-head"><h2>How profit sharing works</h2></div>
          <p class="copy muted">Under the shareholder covenant, <strong>{{ d.config.dividendsPct }}%</strong> of certified net quarterly profit is ring-fenced for cash dividends. <strong>{{ d.config.founderSharePct }}%</strong> of that pool accrues to the founder and each partner receives their equity percentage of the pool. <strong>{{ d.config.reinvestmentPct }}%</strong> is reinvested and <strong>{{ d.config.reservePct }}%</strong> enters the strategic reserve. Distribution occurs on declaration, subject to approval-gated fund movement.</p>
        </section>

        <section class="card">
          <div class="sec-head"><h2>Historical payout ledger</h2></div>
          @if (payoutRows().length) {
            <div class="list">
              @for (row of payoutRows(); track row.id) {
                <div class="prow">
                  <div class="dtop"><span class="rtitle">{{ row.period }}</span><span class="chip ok sm">Declared</span></div>
                  <div class="kv tight">
                    <div><span>Net certified profit</span><strong class="mono">{{ row.totalProfit | seMoney }}</strong></div>
                    <div><span>Dividend pool</span><strong class="mono">{{ row.dividendPool | seMoney }}</strong></div>
                    <div><span>Your payout</span><strong class="mono accent">{{ row.myDividend | seMoney }}</strong></div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <p class="muted small">Payout ledger populates as quarterly distributions are declared.</p>
          }
          <button type="button" class="action" (click)="print()">Print statement</button>
        </section>
      </div>
    }
  `,
  styles: [`
    :host{display:block;font-family:'Urbanist',sans-serif;}
    .pg{display:flex;flex-direction:column;gap:12px;} .card{background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;padding:14px;box-shadow:0 8px 24px -4px rgba(27,25,22,.05);}
    .eyebrow{font:700 10px/1 'JetBrains Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#c88a12;margin-bottom:4px;}
    h1{margin:0;font:700 20px/1.2 Urbanist,sans-serif;} h2{margin:0;font:700 14px/1.2 Urbanist,sans-serif;} p{margin:6px 0 0;font-size:13px;}
    .chip{display:inline-block;margin-top:8px;font:600 11px/1 Urbanist,sans-serif;padding:5px 9px;border-radius:999px;background:#f1ede5;border:1px solid #e8e1d3;}
    .chip.ok{background:rgba(35,128,77,.12);color:#23804d;border-color:rgba(35,128,77,.25);} .chip.sm{margin:0;padding:4px 8px;font-size:10px;}
    .metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .metric{display:flex;flex-direction:column;gap:4px;padding:12px;} .metric span{color:#7b756a;font-size:11px;} .metric strong{font:700 16px/1.1 'JetBrains Mono',monospace;color:#1b1916;}
    .sec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;}
    .list,.kv{display:flex;flex-direction:column;gap:8px;} .kv.tight{gap:4px;margin-top:8px;}
    .kv>div,.dtop{display:flex;justify-content:space-between;gap:10px;} .kv>div{padding:5px 0;border-bottom:1px solid rgba(232,225,211,.6);font-size:13px;} .kv>div:last-child{border-bottom:0;}
    .prow{padding:10px 0;border-bottom:1px solid rgba(232,225,211,.6);} .prow:last-child{border-bottom:0;padding-bottom:0;}
    .rtitle{font:700 13px/1 Urbanist,sans-serif;} .copy strong{color:#1b1916;}
    .action{margin-top:12px;width:100%;padding:12px;border-radius:12px;border:1px solid #e8e1d3;background:#1b1916;color:#fffdf9;font:700 13px/1 Urbanist,sans-serif;}
    .muted{color:#7b756a;} .small{font-size:11px;} .mono{font-family:'JetBrains Mono',monospace;} .accent{color:#c88a12;}
    @media (max-width:360px){.metrics{grid-template-columns:1fr;}}
  `],
})
export class ProfitSharingPage {
  readonly store = inject(PortalStore);

  readonly payoutRows = computed<PayoutRow[]>(() => (this.store.dash()?.profitSharing ?? []).map((row) => ({ id: row.period, ...row })));

  private covenant(total: number, pct: number): number { return Math.round(((total * pct) / 100) * 100) / 100; }
  reinvestment(total: number): number { return this.covenant(total, this.store.dash()?.config.reinvestmentPct ?? 40); }
  reserve(total: number): number { return this.covenant(total, this.store.dash()?.config.reservePct ?? 20); }
  cashOnCash(): number | null {
    const invested = this.store.dash()?.investmentInformation.investedAmount ?? 0;
    if (!invested) return null;
    return (this.store.lifetimeDividends() / invested) * 100;
  }
  cashOnCashHint(): string { const c = this.cashOnCash(); return c === null ? 'Return on invested capital' : `${c.toFixed(1)}% cash-on-cash return`; }
  print(): void { window.print(); }
}
