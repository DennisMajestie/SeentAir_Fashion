import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { PortalStore } from '../portal.store';

/**
 * Screen P7 — Profit Sharing & Dividend Distribution. Pool figures derive
 * from the API's distribution rows; the 40/40/20 covenant and the founder's
 * 60% pool share are confirmed company config mirrored from the server's own
 * distribution math (partners.service.ts) — never invented values.
 */
@Component({
  selector: 'app-profit-sharing-page',
  imports: [CommonModule],
  template: `
    @if (store.dash(); as d) {
      <div class="page-head">
        <div class="page-head-main">
          <p class="page-kicker">Equity Class: Ordinary // Quarterly Covenant</p>
          <h1 class="page-title">Profit Sharing &amp; Dividend Distribution</h1>
          <p class="page-sub">
            Quarterly distribution allocation for ordinary share equity partners — declared from
            audited net profit and approval-gated as fund movements.
          </p>
        </div>
        <div class="page-head-side">
          <span class="chip">Covenant standard: NGN / Cash</span>
          <button class="cta ghost" type="button" (click)="print()">Print statement</button>
        </div>
      </div>

      @if (store.latestDistribution(); as latest) {
        <section class="panel hero">
          <div class="hero-main">
            <p class="rail-kicker">{{ latest.period }} confirmed period · Audit certified &amp; board approved</p>
            <p class="hero-figure">₦{{ latest.totalProfit | number: '1.0-0' }}</p>
            <p class="hero-sub">
              Total operating profit declared for the period. Your dividend derives from the
              {{ d.config.dividendsPct }}% payout pool at your
              {{ d.investmentInformation.equityPercentage }}% equity entitlement.
            </p>
          </div>
          <div class="hero-cells">
            <div class="hero-cell"><span>Distribution ratio</span><strong>{{ d.config.dividendsPct }}% Dividend pool</strong></div>
            <div class="hero-cell"><span>Total issued shares</span><strong>{{ d.investmentInformation.totalShares | number }}</strong></div>
            <div class="hero-cell"><span>Cycle status</span><strong class="ok-ink">Active</strong></div>
            <div class="hero-cell"><span>Settlement currency</span><strong>₦ NGN · Cash</strong></div>
          </div>
        </section>

        <div class="pools">
          <div class="panel pool">
            <span class="pool-num">1 · Capital reinvestment</span>
            <strong>₦{{ reinvestment(latest.totalProfit) | number: '1.0-0' }}</strong>
            <span class="pool-sub">{{ d.config.reinvestmentPct }}% covenant — allocated to production capacity, fabric intake and factory flow</span>
            <div class="meter"><div class="meter-fill" [style.width.%]="d.config.reinvestmentPct"></div></div>
          </div>
          <div class="panel pool accent">
            <span class="pool-num">2 · Dividend payout pool</span>
            <strong>₦{{ latest.dividendPool | number: '1.0-0' }}</strong>
            <span class="pool-sub">{{ d.config.dividendsPct }}% covenant — distributed to shareholders as cash dividends</span>
            <div class="meter gold"><div class="meter-fill" [style.width.%]="d.config.dividendsPct"></div></div>
          </div>
          <div class="panel pool">
            <span class="pool-num">3 · Strategic reserve fund</span>
            <strong>₦{{ reserve(latest.totalProfit) | number: '1.0-0' }}</strong>
            <span class="pool-sub">{{ d.config.reservePct }}% covenant — retained against FX volatility and operational contingency</span>
            <div class="meter"><div class="meter-fill" [style.width.%]="d.config.reservePct"></div></div>
          </div>
        </div>

        <div class="split">
          <section class="panel">
            <div class="panel-head">
              <h2>Pool participation matrix</h2>
              <span class="panel-note">Of the {{ latest.period }} dividend pool</span>
            </div>
            <div class="meter-row">
              <span class="wrap">Founder &amp; executive pool — {{ d.config.founderSharePct }}%</span>
              <div class="meter"><div class="meter-fill" [style.width.%]="d.config.founderSharePct"></div></div>
              <span class="meter-val mono">₦{{ founderShare(latest.dividendPool) | number: '1.0-0' }}</span>
            </div>
            <div class="meter-row">
              <span class="wrap">Outside strategic partners — {{ d.config.partnersSharePct }}%</span>
              <div class="meter"><div class="meter-fill" [style.width.%]="d.config.partnersSharePct"></div></div>
              <span class="meter-val mono">₦{{ latest.dividendPool - founderShare(latest.dividendPool) | number: '1.0-0' }}</span>
            </div>
            <div class="meter-row">
              <span class="wrap"><strong>Your entitlement — {{ d.investmentInformation.equityPercentage }}%</strong></span>
              <div class="meter gold"><div class="meter-fill" [style.width.%]="d.investmentInformation.equityPercentage"></div></div>
              <span class="meter-val"><span class="naira">₦{{ latest.myDividend | number: '1.0-0' }}</span></span>
            </div>
            <p class="fine muted">
              Each partner receives their equity percentage applied to the dividend pool; the
              founder's {{ d.config.founderSharePct }}% pool share completes the allocation.
            </p>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2>Partner account summary</h2>
              <span class="panel-note">{{ d.investmentInformation.equityPercentage }}% equity</span>
            </div>
            <p class="rail-kicker">{{ store.me()?.name ?? 'Partner' }} — ordinary shareholder of record</p>
            <p class="hero-figure sm">₦{{ latest.myDividend | number: '1.0-0' }}</p>
            <p class="hero-sub">{{ latest.period }} net dividend entitlement</p>
            <div class="rail-rows">
              <div class="rail-row"><span>Shares held</span><strong>{{ d.investmentInformation.shares | number }} of {{ d.investmentInformation.totalShares | number }}</strong></div>
              <!-- GAP: settlement dates and designated payout instrument are not exposed by the API. -->
              <div class="rail-row"><span>Scheduled settlement</span><strong>Advised per remittance</strong></div>
              <div class="rail-row"><span>Designated instrument</span><strong>On file with Seentair HQ</strong></div>
            </div>
            <p class="gap-note" style="margin-top: 0.7rem">
              Statutory tax treatment: dividend payouts may attract Nigerian withholding tax; net
              settlement figures are issued with each remittance advice.
            </p>
          </section>
        </div>
      } @else {
        <section class="panel">
          <div class="panel-head"><h2>Distribution cycle</h2></div>
          <div class="empty-state">
            <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
            <h2 class="empty-state-title">No distributions yet</h2>
            <p class="empty-state-sub">Dividends are declared quarterly from audited net profit ({{ store.covenantLabel() }}).</p>
          </div>
        </section>
      }

      <section class="panel">
        <div class="panel-head">
          <h2>How profit sharing is calculated</h2>
          <span class="panel-note">Shareholders' agreement</span>
        </div>
        <p class="how-copy">
          Under Seentair Limited's shareholder covenant, <strong>{{ d.config.dividendsPct }}% of
          certified net quarterly profit</strong> is ring-fenced for cash dividends. Of that pool,
          <strong>{{ d.config.founderSharePct }}% accrues to the founder</strong> and each outside
          partner receives <strong>their equity percentage of the pool</strong>; a further
          <strong>{{ d.config.reinvestmentPct }}% of profit</strong> is reinvested and
          <strong>{{ d.config.reservePct }}%</strong> enters the strategic reserve. Distribution
          occurs automatically on declaration, subject to server-side approval of the fund movement.
        </p>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Historical payout ledger</h2>
          <span class="panel-note">All declared periods</span>
        </div>
        @if (d.profitSharing.length > 0) {
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Quarter</th><th class="num-col">Net certified profit</th><th class="num-col">Dividend pool ({{ d.config.dividendsPct }}%)</th><th class="num-col">Your payout</th><th>Payment status</th></tr>
              </thead>
              <tbody>
                @for (row of d.profitSharing; track row.period) {
                  <tr>
                    <td class="mono">{{ row.period }}</td>
                    <td class="num-col mono">₦{{ row.totalProfit | number: '1.0-0' }}</td>
                    <td class="num-col mono">₦{{ row.dividendPool | number: '1.0-0' }}</td>
                    <td class="num-col"><span class="naira">₦{{ row.myDividend | number: '1.0-0' }}</span></td>
                    <td><span class="chip ok">Declared</span></td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td class="wrap">Total lifetime dividends received</td>
                  <td></td>
                  <td></td>
                  <td class="num-col"><span class="naira">₦{{ store.lifetimeDividends() | number: '1.0-0' }}</span></td>
                  <td>
                    @if (cashOnCash() !== null) {
                      <span class="mono">{{ cashOnCash() | number: '1.0-1' }}% cash-on-cash</span>
                    } @else { — }
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        } @else {
          <p class="gap-note">The payout ledger populates as quarterly distributions are declared.</p>
        }
      </section>

      <div class="notice">
        Cumulative figures are cross-checked against the audited company ledger. Settlement
        confirmations and remittance advices arrive under Documents &amp; Messages.
      </div>
    }
  `,
  styles: [
    `
      .hero { display: flex; gap: 1.2rem; flex-wrap: wrap; align-items: stretch; border-top: 2px solid var(--gold); }
      .hero-main { flex: 1 1 300px; min-width: 0; }
      .rail-kicker { margin: 0 0 0.4rem; font-size: var(--type-label-sm); text-transform: uppercase;
        letter-spacing: 0.1em; color: var(--ink-dim); }
      .hero-figure { margin: 0; font-size: clamp(1.6rem, 4vw, 2.2rem); font-weight: 700;
        font-variant-numeric: tabular-nums; overflow-wrap: anywhere;
        &.sm { font-size: 1.4rem; color: var(--acid-ink); } }
      .hero-sub { margin: 0.3rem 0 0; color: var(--ink-dim); font-size: var(--type-body-sm); max-width: 48ch; }
      .hero-cells { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1px;
        background: var(--hairline); border: 1px solid var(--hairline); flex: 0 1 420px; align-self: center; min-width: min(100%, 280px); }
      .hero-cell { background: var(--panel-2); padding: 0.65rem 0.75rem; display: flex; flex-direction: column; gap: 0.1rem;
        span { font-size: var(--type-label-sm); text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-dim); }
        strong { font-size: var(--type-body-md); } }
      .ok-ink { color: var(--ok); }
      .pools { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; margin-bottom: 0.9rem; }
      .pool { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0;
        .pool-num { font-size: var(--type-label-sm); text-transform: uppercase; letter-spacing: 0.12em; color: var(--acid-ink); font-weight: 700; }
        strong { font-size: 1.25rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
        .pool-sub { font-size: var(--type-label-sm); color: var(--ink-dim); }
        &.accent { border-top: 2px solid var(--gold); } }
      .rail-rows { display: flex; flex-direction: column; margin-top: 0.5rem; }
      .rail-row { display: flex; justify-content: space-between; gap: 0.8rem; padding: 0.45rem 0;
        border-bottom: 1px solid var(--hairline); font-size: var(--type-body-sm);
        span { color: var(--ink-dim); }
        strong { text-align: right; }
        &:last-child { border-bottom: 0; } }
      .how-copy { margin: 0; font-size: var(--type-body-sm); max-width: 82ch;
        strong { color: var(--acid-ink); } }
    `,
  ],
})
export class ProfitSharingPage {
  readonly store = inject(PortalStore);

  /** Mirrors server round2((total * pct) / 100) from partners.service.ts. */
  private covenant(total: number, pct: number): number {
    return Math.round(((total * pct) / 100) * 100) / 100;
  }
  reinvestment(total: number): number {
    return this.covenant(total, this.store.dash()?.config.reinvestmentPct ?? 40);
  }
  reserve(total: number): number {
    return this.covenant(total, this.store.dash()?.config.reservePct ?? 20);
  }
  founderShare(pool: number): number {
    return this.covenant(pool, this.store.dash()?.config.founderSharePct ?? 60);
  }

  readonly cashOnCash = computed(() => {
    const invested = this.store.dash()?.investmentInformation.investedAmount ?? 0;
    if (!invested) return null;
    return (this.store.lifetimeDividends() / invested) * 100;
  });

  print(): void {
    window.print();
  }
}
