import { Component, computed, inject } from '@angular/core';
import { SeMoneyPipe } from '@seentair/ui';
import { PortalStore } from '../portal.store';

interface IncomeRow {
  label: string;
  amount: number;
}

/** Screen P5: verified production and net-yield telemetry, aggregates only. */
@Component({
  selector: 'app-performance-page',
  imports: [SeMoneyPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="stitch">
        <div class="flex flex-col gap-4">
          <!-- Run-rate Island Card -->
          <section class="hero bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] relative overflow-hidden">
            <div class="flex items-start justify-between">
              <div>
                <span class="text-[11px] font-mono uppercase tracking-wider text-light-secondary font-semibold block">Recorded income</span>
                <div class="text-[26px] font-bold font-mono text-light-primary tracking-tight mt-0.5">{{ d.performance.income | seMoney }}</div>
              </div>
              <span class="px-2.5 py-0.5 rounded-full bg-accent/15 text-warning font-semibold text-[11px] font-mono border border-accent/25">{{ store.periodLabel() }}</span>
            </div>

            <div class="metrics grid grid-cols-2 gap-2 pt-3 mt-3 border-t border-border text-[12px]">
              <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                <span class="text-[10px] text-light-secondary font-mono block">Total expenditure</span>
                <strong class="font-mono text-light-primary text-[15px] block mt-0.5">{{ d.performance.expenditure | seMoney }}</strong>
                <span class="text-[10px] text-light-secondary font-semibold">Materials, production, overheads</span>
              </div>
              <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                <span class="text-[10px] text-light-secondary font-mono block">Net operating profit</span>
                <strong class="font-mono text-light-primary text-[15px] block mt-0.5">{{ d.performance.net | seMoney }}</strong>
                <span class="text-[10px] text-success font-semibold">Income less expenditure</span>
              </div>
              <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                <span class="text-[10px] text-light-secondary font-mono block">Net margin</span>
                <strong class="font-mono text-accent text-[15px] block mt-0.5">{{ marginText() }}</strong>
                <span class="text-[10px] text-light-secondary font-mono">Net profit share of revenue</span>
              </div>
              <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                <span class="text-[10px] text-light-secondary font-mono block">Ledger basis</span>
                <strong class="font-mono text-light-primary text-[13px] block mt-0.5">Verified entries</strong>
                <span class="text-[10px] text-light-secondary font-mono">Company accounting ledger</span>
              </div>
            </div>
          </section>

          <!-- Revenue breakdown -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-3">
            <div class="flex items-center justify-between border-b border-border pb-2.5">
              <div>
                <h2 class="text-[14px] font-bold text-light-primary">Revenue breakdown</h2>
                <span class="text-[11px] text-light-secondary font-mono">By ledger entry type</span>
              </div>
              <span class="text-[11px] font-mono text-light-secondary font-semibold">{{ incomeRows().length }} TYPES</span>
            </div>

            @if (incomeRows().length) {
              <div class="income-list flex flex-col gap-2.5 text-[12px]">
                @for (row of incomeRows(); track row.label) {
                  <div class="income-row p-2.5 rounded-lg bg-canvas border border-border flex justify-between items-center">
                    <div>
                      <strong class="font-bold text-light-primary block">{{ row.label }}</strong>
                      <span class="text-[11px] text-light-secondary">Ledger income entry</span>
                    </div>
                    <span class="font-mono font-bold text-light-primary block text-[13px]">{{ row.amount | seMoney }}</span>
                  </div>
                }
              </div>
            } @else {
              <p class="text-[12px] text-light-secondary leading-normal">No income entries yet. Lines appear as entries are posted to the ledger.</p>
            }
          </section>

          <!-- Ledger totals -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-1 text-[12px]">
            <h3 class="text-[13px] font-bold text-light-primary border-b border-border pb-2">Ledger totals</h3>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Total recorded income:</span>
              <strong class="font-mono text-light-primary text-right">{{ d.performance.income | seMoney }}</strong>
            </div>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Total expenditure:</span>
              <strong class="font-mono text-light-primary text-right">{{ d.performance.expenditure | seMoney }}</strong>
            </div>
            <div class="flex justify-between py-1.5 gap-3">
              <span class="text-light-secondary">Net operating profit:</span>
              <strong class="font-mono text-right" [class.text-success]="d.performance.net >= 0" [class.text-danger]="d.performance.net < 0">{{ d.performance.net | seMoney }}</strong>
            </div>
            <p class="text-[11px] text-light-secondary leading-normal pt-2">Production cost basis: raw material + sewing + branding + packaging. Detailed cost-line disclosure follows officer sign-off.</p>
          </section>

          <!-- More telemetry -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-1 text-[12px]">
            <h3 class="text-[13px] font-bold text-light-primary border-b border-border pb-2">More telemetry</h3>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Channel mix (retail / wholesale / in-store):</span>
              <strong class="text-light-primary text-right">Not yet published</strong>
            </div>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Top products by revenue:</span>
              <strong class="text-light-primary text-right">Not yet published</strong>
            </div>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Factory floor (batches / output / QC):</span>
              <strong class="text-light-primary text-right">Not yet published</strong>
            </div>
            <div class="flex justify-between py-1.5 gap-3">
              <span class="text-light-secondary">Quarter-by-quarter margin trend:</span>
              <strong class="text-light-primary text-right">Not yet published</strong>
            </div>
            <p class="text-[11px] text-light-secondary leading-normal pt-2">When released, rankings are anonymized SKU aggregates only — never individual people.</p>
          </section>
        </div>
      </div>
    }
  `,
})
export class PerformancePage {
  readonly store = inject(PortalStore);

  readonly incomeRows = computed<IncomeRow[]>(() => {
    const byType = this.store.dash()?.accountsReports.income.byType ?? {};
    return Object.entries(byType)
      .filter(([, v]) => typeof v === 'number')
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([key, amount]) => ({
        label: key.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
        amount: amount as number,
      }));
  });
  readonly marginText = computed(() => {
    const m = this.store.netMarginPct();
    return m === null ? '-' : `${m.toFixed(1)}%`;
  });
}
