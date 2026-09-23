import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { PortalStore } from '../portal.store';

/**
 * Screen P3 — My Investment & Equity Structure: registry record, share
 * mechanics, equity distribution donut, capitalization table, capital ledger.
 * Founder 60% / partners 40% split is confirmed company structure (CLAUDE.md),
 * so the "other partners" slice is derived as 40% minus this partner's equity.
 */
@Component({
  selector: 'app-investment-page',
  imports: [CommonModule],
  template: `
    @if (store.dash(); as d) {
      <div class="page-head">
        <div class="page-head-main">
          <p class="page-kicker">Investor Registry // Class A Ordinary Shares</p>
          <h1 class="page-title">My Investment &amp; Equity Structure</h1>
          <p class="page-sub">
            Official shareholder registry record for {{ store.me()?.name ?? 'this partner account' }} —
            read-only, maintained by Seentair Limited.
          </p>
        </div>
        <div class="page-head-side">
          <span class="chip ok">Corporate ledger synced</span>
          <button class="cta ghost" type="button" (click)="print()">Print registry slip</button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi accent">
          <span class="kpi-label">Total capital invested</span>
          <span class="kpi-value">₦{{ d.investmentInformation.investedAmount | number: '1.0-0' }}</span>
          <span class="kpi-sub">Fully paid · nominal value on registry</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Investment inception</span>
          <!-- GAP: partner inception date is not exposed by the dashboard endpoint. -->
          <span class="kpi-value">On registry</span>
          <span class="kpi-sub">Date held by the company secretary</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Shares held</span>
          <span class="kpi-value">{{ d.investmentInformation.shares | number }}</span>
          <span class="kpi-sub">1 share = 1 ordinary voting right</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Equity ownership</span>
          <span class="kpi-value">{{ d.investmentInformation.equityPercentage }}%</span>
          <span class="kpi-sub">Of {{ d.investmentInformation.totalShares | number }} total company shares</span>
        </div>
      </div>

      <section class="panel how-band">
        <div class="panel-head">
          <h2>How your shares work &amp; capital model</h2>
          <span class="panel-note">Shareholders' agreement</span>
        </div>
        <p class="how-copy">
          You hold Class A voting ordinary shares in Seentair Limited. Under the shareholder
          agreement, <strong>40% of quarterly net profit</strong> is distributed into the dividend
          pool; you receive exactly your equity percentage of every dividend distribution, with
          <strong>40% reinvested</strong> into production capacity and <strong>20% held in
          reserve</strong>.
        </p>
        <div class="how-grid">
          <div class="how-cell"><span>Profit retention policy</span><strong>40% Reinvestment</strong></div>
          <div class="how-cell"><span>Dividend payout pool</span><strong>40% Quarterly net</strong></div>
          <div class="how-cell"><span>Strategic reserve</span><strong>20% Retained</strong></div>
          <!-- GAP: liquidation-preference terms are not exposed via the API — copy defers to the agreement. -->
          <div class="how-cell"><span>Liquidation preference</span><strong>Per agreement</strong></div>
        </div>
      </section>

      <div class="split-half">
        <section class="panel">
          <div class="panel-head">
            <h2>Equity distribution</h2>
            <span class="panel-note">Capitalization structure</span>
          </div>
          <div class="donut-wrap">
            <div class="donut" [style.background]="donutBg()" role="img"
                 [attr.aria-label]="'Equity split: founder 60%, other partners ' + otherPartnersPct() + '%, your holding ' + d.investmentInformation.equityPercentage + '%'">
              <div class="donut-hole">
                <span>Total</span>
                <strong>{{ d.investmentInformation.totalShares | number }}</strong>
                <span>Ordinary shares</span>
              </div>
            </div>
            <div class="legend">
              <div class="legend-row">
                <span class="swatch" style="background: var(--ink-dim)"></span>
                Founder &amp; executive team
                <span class="legend-val">60.0%</span>
              </div>
              <div class="legend-row">
                <span class="swatch" style="background: var(--hairline-2)"></span>
                Other strategic partners
                <span class="legend-val">{{ otherPartnersPct() | number: '1.0-1' }}%</span>
              </div>
              <div class="legend-row">
                <span class="swatch" style="background: var(--gold)"></span>
                Your holding ({{ store.firstName() }})
                <span class="legend-val">{{ d.investmentInformation.equityPercentage | number: '1.0-1' }}%</span>
              </div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Official capitalization table</h2>
            <span class="panel-note">1,000,000 authorized</span>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Class</th><th>Shareholder group</th><th class="num-col">Shares</th><th class="num-col">Equity</th><th>Dividend rights</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td class="mono">A</td>
                  <td class="wrap">Founder &amp; executive team</td>
                  <td class="num-col mono">{{ founderShares() | number }}</td>
                  <td class="num-col mono">60.0%</td>
                  <td>60% of pool</td>
                </tr>
                <tr>
                  <td class="mono">A</td>
                  <td class="wrap">Other strategic partners</td>
                  <td class="num-col mono">{{ otherPartnersShares() | number }}</td>
                  <td class="num-col mono">{{ otherPartnersPct() | number: '1.0-1' }}%</td>
                  <td>Equity % of pool</td>
                </tr>
                <tr class="me-row">
                  <td class="mono">A</td>
                  <td class="wrap"><strong>{{ store.me()?.name ?? 'You' }} (your holding)</strong></td>
                  <td class="num-col"><span class="naira">{{ d.investmentInformation.shares | number }}</span></td>
                  <td class="num-col"><span class="naira">{{ d.investmentInformation.equityPercentage | number: '1.0-1' }}%</span></td>
                  <td>{{ d.investmentInformation.equityPercentage }}% of pool</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Total authorized &amp; issued</td>
                  <td class="num-col mono">{{ d.investmentInformation.totalShares | number }}</td>
                  <td class="num-col mono">100.0%</td>
                  <td>Fully distributable</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-head">
          <h2>Investment transactions &amp; capital calls ledger</h2>
          <span class="panel-note">Verifiable subscriptions</span>
        </div>
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr><th>Date</th><th>Transaction purpose / call</th><th class="num-col">Shares issued</th><th class="num-col">Amount subscribed</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr>
                <!-- GAP: transaction dates & per-call breakdown are not exposed; only the registry total is. -->
                <td class="mono">On registry</td>
                <td class="wrap">Initial equity injection — founding partner subscription</td>
                <td class="num-col mono">{{ d.investmentInformation.shares | number }}</td>
                <td class="num-col mono">₦{{ d.investmentInformation.investedAmount | number: '1.0-0' }}</td>
                <td><span class="chip ok">Cleared</span></td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3">Total subscribed capital</td>
                <td class="num-col"><span class="naira">₦{{ d.investmentInformation.investedAmount | number: '1.0-0' }}</span></td>
                <td>Audited</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="gap-note" style="margin-top: 0.7rem">
          Certified share certificates and the countersigned shareholders' agreement are issued by
          the company secretary — document downloads appear under Documents &amp; Messages when
          shared.
        </p>
      </section>

      <div class="notice">
        All statements are prepared in accordance with the Companies and Allied Matters Act (CAMA
        2020). Ownership records are non-disclosable without officer sign-off; this registry view
        is read-only.
      </div>
    }
  `,
  styles: [
    `
      .how-band { border-top: 2px solid var(--gold); }
      .how-copy { margin: 0 0 0.9rem; font-size: var(--type-body-sm); max-width: 78ch;
        strong { color: var(--acid-ink); } }
      .how-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1px;
        background: var(--hairline); border: 1px solid var(--hairline); }
      .how-cell { background: var(--panel-2); padding: 0.6rem 0.75rem; display: flex; flex-direction: column; gap: 0.1rem;
        span { font-size: var(--type-label-sm); text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-dim); }
        strong { font-size: var(--type-body-md); } }
      .me-row td { background: color-mix(in srgb, var(--gold) 8%, var(--panel)); }
    `,
  ],
})
export class InvestmentPage {
  readonly store = inject(PortalStore);

  readonly otherPartnersPct = computed(() => {
    const mine = this.store.dash()?.investmentInformation.equityPercentage ?? 0;
    return Math.max(0, 40 - mine);
  });

  readonly founderShares = computed(() => {
    const total = this.store.dash()?.investmentInformation.totalShares ?? 0;
    return Math.round(total * 0.6);
  });

  readonly otherPartnersShares = computed(() => {
    const d = this.store.dash()?.investmentInformation;
    if (!d) return 0;
    return Math.max(0, d.totalShares - this.founderShares() - d.shares);
  });

  /** Conic donut with 2° panel-coloured spacers between segments (mark-spec gaps). */
  readonly donutBg = computed(() => {
    const mine = this.store.dash()?.investmentInformation.equityPercentage ?? 0;
    const founderEnd = 60 * 3.6;
    const othersEnd = (60 + this.otherPartnersPct()) * 3.6;
    const mineEnd = Math.min(360, (60 + this.otherPartnersPct() + mine) * 3.6);
    const g = 2; // degrees of gap
    return (
      `conic-gradient(var(--ink-dim) 0deg ${founderEnd - g}deg,` +
      ` var(--panel) ${founderEnd - g}deg ${founderEnd}deg,` +
      ` var(--hairline-2) ${founderEnd}deg ${othersEnd - g}deg,` +
      ` var(--panel) ${othersEnd - g}deg ${othersEnd}deg,` +
      ` var(--gold) ${othersEnd}deg ${mineEnd - g}deg,` +
      ` var(--panel) ${mineEnd - g}deg 360deg)`
    );
  });

  print(): void {
    window.print();
  }
}
