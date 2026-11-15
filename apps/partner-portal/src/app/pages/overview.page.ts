import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SeCurrencyService, SeMoneyPipe } from '@seentair/ui';
import { PortalStore } from '../portal.store';

/** Screen P3: read-only partner overview. Aggregates only, never customer data. */
@Component({
  selector: 'app-overview-page',
  imports: [DecimalPipe, RouterLink, SeMoneyPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="stitch">
        <div class="flex flex-col gap-4">
          <!-- Greeting & Data Freshness Card -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)]">
            <div class="flex items-start justify-between">
              <div>
                <span class="text-[12px] text-light-secondary font-medium">Welcome back,</span>
                <h1 class="text-[18px] font-bold text-light-primary">{{ store.firstName() }}</h1>
              </div>
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-success/15 text-success font-semibold text-[11px] border border-success/30">
                <span class="w-1.5 h-1.5 rounded-full bg-success"></span>
                Series A Partner
              </span>
            </div>
            <div class="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] font-mono text-light-secondary">
              <span class="flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px] text-accent">sync</span>
                Aggregates from Aba Live Ledger
              </span>
              <span>{{ store.periodLabel() }}</span>
            </div>
          </section>

          <!-- 4 Metric Cards (2x2 Grid) -->
          <section class="metrics grid grid-cols-2 gap-2.5">

            <!-- Metric 1: Revenue Recorded -->
            <div class="bg-light-surface p-3.5 rounded-xl border border-border flex flex-col justify-between">
              <div class="flex items-center justify-between text-light-secondary text-[11px]">
                <span>Revenue Recorded</span>
                <span class="material-symbols-outlined text-[16px] text-accent">trending_up</span>
              </div>
              <div class="mt-2">
                <span class="text-[20px] font-bold font-mono text-light-primary leading-tight block">{{ d.businessOverview.totalIncome | seMoney }}</span>
                <span class="text-[11px] text-light-secondary mt-0.5 block">All income entries</span>
              </div>
            </div>

            <!-- Metric 2: Net Profit -->
            <div class="bg-light-surface p-3.5 rounded-xl border border-border flex flex-col justify-between">
              <div class="flex items-center justify-between text-light-secondary text-[11px]">
                <span>Net Profit</span>
                <span class="material-symbols-outlined text-[16px] text-success">account_balance_wallet</span>
              </div>
              <div class="mt-2">
                <span class="text-[20px] font-bold font-mono text-light-primary leading-tight block">{{ d.businessOverview.profitLoss.net | seMoney }}</span>
                <span class="text-[11px] text-light-secondary mt-0.5 block">{{ marginLine() }}</span>
              </div>
            </div>

            <!-- Metric 3: Distributions Declared -->
            <div class="bg-light-surface p-3.5 rounded-xl border border-border flex flex-col justify-between">
              <div class="flex items-center justify-between text-light-secondary text-[11px]">
                <span>Distributions Declared</span>
                <span class="material-symbols-outlined text-[16px] text-warning">payments</span>
              </div>
              <div class="mt-2">
                <span class="text-[20px] font-bold font-mono text-light-primary leading-tight block">{{ d.profitSharing.length }}</span>
                <span class="text-[11px] text-accent font-semibold mt-0.5 block">{{ d.config.dividendsPct }}% Covenant Pool</span>
              </div>
            </div>

            <!-- Metric 4: Finished Goods Stock -->
            <div class="bg-light-surface p-3.5 rounded-xl border border-border flex flex-col justify-between">
              <div class="flex items-center justify-between text-light-secondary text-[11px]">
                <span>Finished Goods</span>
                <span class="material-symbols-outlined text-[16px] text-light-secondary">warehouse</span>
              </div>
              <div class="mt-2">
                <span class="text-[20px] font-bold font-mono text-light-primary leading-tight block">{{ d.inventoryVisibility.finishedGoodsUnits | number }}u</span>
                <span class="text-[11px] text-light-secondary mt-0.5 block">Units in stock</span>
              </div>
            </div>
          </section>

          <!-- Profit Declared per Period: Mobile Bar Chart -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-[14px] font-bold text-light-primary">Profit Declared per Period</h2>
                <span class="text-[11px] text-light-secondary">Distribution history</span>
              </div>
              <a routerLink="/profit-sharing" class="text-[12px] font-bold text-accent hover:underline">Details</a>
            </div>

            @if (chartRows().length >= 2) {
              <!-- Bar Chart Visualization -->
              <div class="pt-3 pb-1 flex items-end justify-between gap-3 h-32 px-2 border-b border-border/70" role="img" aria-label="Profit declared per period">
                @for (row of chartRows(); track row.label; let i = $index) {
                  <div class="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span class="text-[10px] font-mono text-light-secondary" [class]="i === chartRows().length - 1 ? 'text-[10px] font-mono font-bold text-accent' : ''">{{ compact(row.value) }}</span>
                    <div class="bar w-full bg-canvas-tint rounded-t-md" [style.height.%]="row.pct" [class.bg-accent]="i === chartRows().length - 1"></div>
                    <span class="text-[10px] font-mono text-light-secondary" [class]="i === chartRows().length - 1 ? 'text-[10px] font-mono font-bold text-light-primary' : ''">{{ row.label }}</span>
                  </div>
                }
              </div>
            } @else {
              <p class="text-[11px] text-light-secondary">Chart appears once two or more quarterly distributions are declared.</p>
            }
          </section>

          <!-- Latest Distribution Card -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-3">
            @if (store.latestDistribution(); as dist) {
              <div class="flex items-start justify-between">
                <div>
                  <span class="text-[11px] font-mono uppercase text-light-secondary">{{ dist.period }} Distribution</span>
                  <h2 class="text-[18px] font-bold text-light-primary font-mono mt-0.5">Your Dividend: {{ dist.myDividend | seMoney }}</h2>
                </div>
                <span class="px-2.5 py-0.5 rounded-full bg-success/15 text-success text-[11px] font-semibold">Declared</span>
              </div>

              <div class="grid grid-cols-2 gap-2 text-[12px] bg-canvas/60 p-2.5 rounded-lg border border-border">
                <div>
                  <span class="text-light-secondary block text-[11px]">Total Net Profit:</span>
                  <strong class="font-mono text-light-primary">{{ dist.totalProfit | seMoney }}</strong>
                </div>
                <div>
                  <span class="text-light-secondary block text-[11px]">Dividend Pool ({{ d.config.dividendsPct }}%):</span>
                  <strong class="font-mono text-light-primary">{{ dist.dividendPool | seMoney }}</strong>
                </div>
                <div>
                  <span class="text-light-secondary block text-[11px]">Your Entitlement:</span>
                  <strong class="font-mono text-accent">{{ d.investmentInformation.equityPercentage }}% of Pool</strong>
                </div>
                <div>
                  <span class="text-light-secondary block text-[11px]">Period:</span>
                  <strong class="font-mono text-light-primary">{{ dist.period }}</strong>
                </div>
              </div>
            } @else {
              <p class="text-[12px] text-light-secondary">No distributions yet. Declared quarterly from net profit ({{ store.covenantLabel() }}).</p>
            }
          </section>

          <!-- Your Holding Card -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <h2 class="text-[14px] font-bold text-light-primary">Your Equity Holding</h2>
              <a routerLink="/investment" class="text-[12px] font-semibold text-accent hover:underline">My Investment</a>
            </div>

            <div class="flex justify-between items-center py-1 text-[13px]">
              <span class="text-light-secondary">Total Invested Capital:</span>
              <span class="font-mono font-bold text-light-primary">{{ d.investmentInformation.investedAmount | seMoney }}</span>
            </div>
            <div class="flex justify-between items-center py-1 text-[13px] border-t border-border/60">
              <span class="text-light-secondary">Cumulative Dividends:</span>
              <span class="font-mono font-bold text-success">{{ store.lifetimeDividends() | seMoney }}</span>
            </div>
            <div class="flex justify-between items-center py-1 text-[13px] border-t border-border/60">
              <span class="text-light-secondary">Shares Held:</span>
              <span class="font-mono font-bold text-light-primary">{{ d.investmentInformation.shares | number }} / {{ d.investmentInformation.totalShares | number }}</span>
            </div>
            <div class="flex justify-between items-center py-1 text-[13px] border-t border-border/60">
              <span class="text-light-secondary">Equity Stake:</span>
              <span class="font-mono font-bold text-accent text-[15px]">{{ d.investmentInformation.equityPercentage }}%</span>
            </div>
          </section>
        </div>
      </div>
    }
  `,
})
export class OverviewPage {
  readonly store = inject(PortalStore);
  private readonly currency = inject(SeCurrencyService);

  private readonly rows = computed(() => [...(this.store.dash()?.profitSharing ?? [])].reverse().slice(-6));
  readonly chartRows = computed(() => {
    const max = Math.max(1, ...this.rows().map((r) => r.totalProfit));
    return this.rows().map((r) => ({
      label: r.period.replace(/^20/, "'"),
      value: r.totalProfit,
      pct: Math.max(8, (r.totalProfit / max) * 100),
    }));
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
