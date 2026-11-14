import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { SeMoneyPipe } from '@seentair/ui';
import { PortalStore } from '../portal.store';

@Component({
  selector: 'app-investment-page',
  imports: [DecimalPipe, SeMoneyPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="pg">
        <section class="card hero">
          <div class="eyebrow">Holding & Equity</div>
          <h1>My Investment</h1>
          <p class="muted">Official shareholder registry record — read-only, maintained by Seentair Limited.</p>
          <div class="big">{{ d.investmentInformation.equityPercentage }}% <span>equity ownership</span></div>
          <div class="chips">
            <span class="chip ok">Corporate ledger synced</span>
            <span class="chip">{{ store.covenantLabel() }} covenant</span>
          </div>
        </section>

        <section class="metrics">
          <div class="metric card"><span>Total capital invested</span><strong>{{ d.investmentInformation.investedAmount | seMoney }}</strong><small>Fully paid on registry</small></div>
          <div class="metric card"><span>Shares held</span><strong>{{ d.investmentInformation.shares | number }}</strong><small>of {{ d.investmentInformation.totalShares | number }} total</small></div>
          <div class="metric card"><span>Dividends to date</span><strong>{{ store.lifetimeDividends() | seMoney }}</strong><small>Lifetime declared</small></div>
          <div class="metric card"><span>Latest dividend</span><strong>{{ (store.latestDistribution()?.myDividend ?? 0) | seMoney }}</strong><small>{{ store.latestDistribution()?.period ?? 'No distribution yet' }}</small></div>
        </section>

        <section class="card">
          <div class="sec-head"><h2>Equity distribution</h2><span class="muted small">Shareholder groups</span></div>
          <div class="dist">
            @for (row of equityRows(); track row.label) {
              <div class="drow">
                <div class="dtop"><span>{{ row.label }}</span><strong class="mono">{{ row.pct }}%</strong></div>
                <div class="track"><div class="fill" [class.me]="row.me" [style.width.%]="row.pct"></div></div>
                <small class="muted">{{ row.shares | number }} shares</small>
              </div>
            }
          </div>
        </section>

        <section class="card">
          <div class="sec-head"><h2>Capitalization table</h2></div>
          <div class="list">
            @for (row of capRows(); track row.id) {
              <div class="row">
                <div>
                  <div class="rtitle">{{ row.group }}</div>
                  <div class="muted small">Class {{ row.cls }} · {{ row.rights }}</div>
                </div>
                <div class="right">
                  <strong class="mono">{{ row.equityPct }}%</strong>
                  <div class="muted small">{{ row.shares | number }} shares</div>
                </div>
              </div>
            }
          </div>
        </section>

        <section class="card">
          <div class="sec-head"><h2>Registry & capital model</h2></div>
          <div class="kv">
            <div><span>Instrument</span><strong>Class A voting ordinary shares</strong></div>
            <div><span>Profit retention</span><strong class="mono">{{ d.config.reinvestmentPct }}% reinvestment</strong></div>
            <div><span>Dividend pool</span><strong class="mono">{{ d.config.dividendsPct }}% of quarterly net</strong></div>
            <div><span>Strategic reserve</span><strong class="mono">{{ d.config.reservePct }}% retained</strong></div>
            <div><span>Ledger entry</span><strong>Initial equity injection · cleared</strong></div>
          </div>
          <button type="button" class="action" (click)="print()">Print registry slip</button>
        </section>
      </div>
    }
  `,
  styles: [`
    :host{display:block;font-family:'Urbanist',sans-serif;}
    .pg{display:flex;flex-direction:column;gap:12px;}
    .card{background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;padding:14px;box-shadow:0 8px 24px -4px rgba(27,25,22,.05);}
    .eyebrow{font:700 10px/1 'JetBrains Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#c88a12;margin-bottom:4px;}
    h1{margin:0;font:700 20px/1.2 Urbanist,sans-serif;} p{margin:6px 0 0;font-size:13px;}
    .big{margin-top:12px;font:700 28px/1 'JetBrains Mono',monospace;color:#1b1916;} .big span{display:block;margin-top:4px;font:500 12px/1 Urbanist,sans-serif;color:#7b756a;}
    .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;}
    .chip{font:600 11px/1 Urbanist,sans-serif;padding:5px 9px;border-radius:999px;background:#f1ede5;color:#1b1916;border:1px solid #e8e1d3;}
    .chip.ok{background:rgba(35,128,77,.12);color:#23804d;border-color:rgba(35,128,77,.25);}
    .metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .metric{display:flex;flex-direction:column;gap:4px;padding:12px;}
    .metric span,.muted{color:#7b756a;font-size:11px;} .metric strong{font:700 16px/1.1 'JetBrains Mono',monospace;color:#1b1916;}
    .sec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;}
    h2{margin:0;font:700 14px/1.2 Urbanist,sans-serif;}
    .dist,.list,.kv{display:flex;flex-direction:column;gap:10px;}
    .dtop{display:flex;justify-content:space-between;font-size:13px;gap:8px;}
    .track{height:8px;background:#efeae0;border-radius:999px;overflow:hidden;margin:5px 0;}
    .fill{height:100%;background:#b6aa97;border-radius:999px;} .fill.me{background:#c88a12;}
    .row,.kv>div{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(232,225,211,.6);}
    .row:last-child,.kv>div:last-child{border-bottom:0;padding-bottom:0;}
    .rtitle{font:600 13px/1.3 Urbanist,sans-serif;} .right{text-align:right;}
    .kv{font-size:13px;} .kv span{color:#7b756a;}
    .action{margin-top:12px;width:100%;padding:12px;border-radius:12px;border:1px solid #e8e1d3;background:#1b1916;color:#fffdf9;font:700 13px/1 Urbanist,sans-serif;}
    .mono{font-family:'JetBrains Mono',monospace;} .small{font-size:11px;}
    @media (max-width:360px){.metrics{grid-template-columns:1fr;}}
  `],
})
export class InvestmentPage {
  readonly store = inject(PortalStore);

  readonly otherPartnersPct = computed(() => {
    const mine = this.store.dash()?.investmentInformation.equityPercentage ?? 0;
    const partnersPct = this.store.dash()?.config.partnersSharePct ?? 40;
    return Math.max(0, partnersPct - mine);
  });
  readonly founderShares = computed(() => {
    const total = this.store.dash()?.investmentInformation.totalShares ?? 0;
    const founderPct = this.store.dash()?.config.founderSharePct ?? 60;
    return Math.round(total * (founderPct / 100));
  });
  readonly otherPartnersShares = computed(() => {
    const d = this.store.dash()?.investmentInformation;
    if (!d) return 0;
    return Math.max(0, d.totalShares - this.founderShares() - d.shares);
  });
  readonly equityRows = computed(() => {
    const d = this.store.dash(); if (!d) return [];
    return [
      { label: 'Founder & executive team', pct: d.config.founderSharePct, shares: this.founderShares(), me: false },
      { label: 'Other strategic partners', pct: this.otherPartnersPct(), shares: this.otherPartnersShares(), me: false },
      { label: `Your holding (${this.store.firstName()})`, pct: d.investmentInformation.equityPercentage, shares: d.investmentInformation.shares, me: true },
    ];
  });
  readonly capRows = computed(() => {
    const d = this.store.dash(); if (!d) return [];
    return [
      { id: 'founder', cls: 'A', group: 'Founder & executive team', shares: this.founderShares(), equityPct: d.config.founderSharePct, rights: `${d.config.founderSharePct}% of pool` },
      { id: 'partners', cls: 'A', group: 'Other strategic partners', shares: this.otherPartnersShares(), equityPct: this.otherPartnersPct(), rights: 'Equity % of pool' },
      { id: 'me', cls: 'A', group: `${this.store.me()?.name ?? 'You'} (your holding)`, shares: d.investmentInformation.shares, equityPct: d.investmentInformation.equityPercentage, rights: `${d.investmentInformation.equityPercentage}% of pool` },
    ];
  });
  print(): void { window.print(); }
}
