import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeMoneyPipe } from '@seentair/ui';
import { PortalStore } from '../portal.store';

interface PayoutRow {
  id: string;
  period: string;
  totalProfit: number;
  dividendPool: number;
  myDividend: number;
}

/** Screen P8: declared dividend distributions under the operating covenant. */
@Component({
  selector: 'app-profit-sharing-page',
  imports: [RouterLink, SeMoneyPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="stitch">
        <div class="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
          <!-- Covenant Allocation Model Island Card -->
          <section class="bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] flex flex-col gap-3.5 relative overflow-hidden md:col-span-2">
            <div>
              <span class="text-[11px] font-mono uppercase tracking-wider text-light-secondary font-semibold block">Statutory net profit allocation model</span>
              <h2 class="text-[16px] font-bold text-light-primary mt-0.5">{{ d.config.reinvestmentPct }}/{{ d.config.dividendsPct }}/{{ d.config.reservePct }} covenant distribution rules</h2>
            </div>

            <!-- Segmented Visual Allocation Bar -->
            <div class="covenant-bar flex items-center gap-1.5 h-3.5 rounded-full bg-canvas-tint overflow-hidden p-0.5 border border-border/60">
              <div class="h-full bg-warning rounded-full" [style.width.%]="d.config.reinvestmentPct" title="Factory reinvestment: {{ d.config.reinvestmentPct }}%"></div>
              <div class="h-full bg-accent rounded-full" [style.width.%]="d.config.dividendsPct" title="Partner dividends: {{ d.config.dividendsPct }}%"></div>
              <div class="h-full bg-light-secondary rounded-full" [style.width.%]="d.config.reservePct" title="Strategic reserve: {{ d.config.reservePct }}%"></div>
            </div>

            <!-- Legend -->
            <div class="covenant-legend grid grid-cols-3 gap-2 text-[11px] pt-1">
              <div class="p-2.5 rounded-lg bg-canvas border border-border text-center shadow-xs">
                <span class="font-bold font-mono text-warning block text-[13px]">{{ d.config.reinvestmentPct }}% Reinvest</span>
                <span class="text-light-secondary text-[10px]">Factory operations</span>
              </div>
              <div class="p-2.5 rounded-lg bg-canvas border border-border text-center shadow-xs">
                <span class="font-bold font-mono text-accent block text-[13px]">{{ d.config.dividendsPct }}% Dividend</span>
                <span class="text-light-secondary text-[10px]">Equity syndicate</span>
              </div>
              <div class="p-2.5 rounded-lg bg-canvas border border-border text-center shadow-xs">
                <span class="font-bold font-mono text-light-secondary block text-[13px]">{{ d.config.reservePct }}% Reserve</span>
                <span class="text-light-secondary text-[10px]">Liquidity buffer</span>
              </div>
            </div>

            <p class="text-[11px] text-light-secondary leading-normal">
              Under the shareholder covenant, {{ d.config.dividendsPct }}% of certified net quarterly profit is ring-fenced for cash dividends. {{ d.config.founderSharePct }}% of that pool accrues to the founder, and each partner receives their equity percentage of the pool. Distribution occurs on declaration, subject to approval-gated fund movement.
            </p>
          </section>

          <!-- Distribution Ledger Stack -->
          <section class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <h3 class="text-[15px] font-bold text-light-primary">Distribution history</h3>
              <span class="text-[11px] font-mono text-light-secondary">DECLARED PER REMITTANCE</span>
            </div>

            @for (row of payoutRows(); track row.id) {
              <article class="payout-card bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-3">
                <div class="flex items-center justify-between border-b border-border pb-2.5">
                  <div>
                    <strong class="font-bold text-light-primary block text-[14px]">{{ row.period }} Dividend Distribution</strong>
                    <span class="text-[11px] text-light-secondary font-mono">Declared from audited net profit</span>
                  </div>
                  <span class="px-2.5 py-0.5 rounded-full bg-success/15 text-success font-semibold text-[11px] border border-success/30">Declared</span>
                </div>

                <div class="grid grid-cols-2 gap-2 text-[12px] bg-canvas p-2.5 rounded-lg border border-border">
                  <div>
                    <span class="text-light-secondary block text-[11px] font-mono">Dividend pool ({{ d.config.dividendsPct }}%):</span>
                    <strong class="font-mono text-light-primary text-[13px]">{{ row.dividendPool | seMoney }}</strong>
                  </div>
                  <div>
                    <span class="text-light-secondary block text-[11px] font-mono">Your {{ d.investmentInformation.equityPercentage }}% Entitlement:</span>
                    <strong class="font-mono text-accent text-[14px]">{{ row.myDividend | seMoney }}</strong>
                  </div>
                </div>

                <div class="flex justify-between items-center text-[11px] text-light-secondary pt-1">
                  <span>Net certified profit: <strong class="font-mono text-light-primary">{{ row.totalProfit | seMoney }}</strong></span>
                  <a routerLink="/reports" class="text-warning font-semibold hover:underline flex items-center gap-0.5">
                    View audit
                    <span class="material-symbols-outlined text-[14px]">chevron_right</span>
                  </a>
                </div>
              </article>
            } @empty {
              <div class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)]">
                <p class="text-[12px] text-light-secondary">No distributions yet. Dividends are declared quarterly from audited net profit ({{ store.covenantLabel() }}).</p>
              </div>
            }
          </section>

          <!-- Cumulative Yield Metric Card -->
          <section class="p-4 rounded-xl bg-canvas-tint/70 border border-border flex items-center justify-between text-[12px] shadow-xs">
            <div>
              <span class="text-light-secondary font-mono text-[11px] block">Cumulative realized yield to date</span>
              <strong class="font-mono text-[16px] text-light-primary block mt-0.5">{{ store.lifetimeDividends() | seMoney }}</strong>
              <span class="text-[10px] text-success font-semibold">{{ cashOnCashHint() }}</span>
            </div>
            <div class="w-10 h-10 rounded-full bg-accent/20 text-warning flex items-center justify-center flex-shrink-0 shadow-xs">
              <span class="material-symbols-outlined text-[24px]">workspace_premium</span>
            </div>
          </section>
        </div>
      </div>
    }
  `,
})
export class ProfitSharingPage {
  readonly store = inject(PortalStore);

  readonly payoutRows = computed<PayoutRow[]>(() => (this.store.dash()?.profitSharing ?? []).map((row) => ({ id: row.period, ...row })));

  cashOnCash(): number | null {
    const invested = this.store.dash()?.investmentInformation.investedAmount ?? 0;
    if (!invested) return null;
    return (this.store.lifetimeDividends() / invested) * 100;
  }
  cashOnCashHint(): string {
    const c = this.cashOnCash();
    return c === null ? 'Return on invested capital' : `${c.toFixed(1)}% cash-on-cash return`;
  }
}
