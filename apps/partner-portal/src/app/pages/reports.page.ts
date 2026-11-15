import { Component, computed, inject } from '@angular/core';
import { SeMoneyPipe } from '@seentair/ui';
import { PortalStore } from '../portal.store';

interface IncomeRow {
  label: string;
  amount: number;
}

/** Screen P7: statutory accounts aggregates; documents stay on the shelf until uploaded. */
@Component({
  selector: 'app-reports-page',
  imports: [SeMoneyPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="stitch">
        <div class="flex flex-col gap-3.5">
          <!-- Ledger Island Card -->
          <section class="hero bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] flex flex-col gap-3">
            <div class="flex items-start justify-between">
              <div>
                <span class="text-[11px] font-mono uppercase tracking-wider text-light-secondary font-semibold block">Statutory accounts &amp; reports</span>
                <div class="text-[22px] font-bold font-mono text-light-primary tracking-tight mt-0.5">{{ d.accountsReports.income.total | seMoney }}</div>
                <span class="text-[12px] text-light-secondary mt-0.5 block">Total income recorded in the ledger · {{ store.periodLabel() }}</span>
              </div>
              <div class="w-10 h-10 rounded-xl bg-accent/20 text-warning flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined text-[22px]">description</span>
              </div>
            </div>

            <div class="metrics grid grid-cols-2 gap-2 pt-1 border-t border-border text-[12px]">
              <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                <span class="text-[10px] text-light-secondary font-mono block">Net margin</span>
                <strong class="font-mono text-light-primary text-[15px] block mt-0.5">{{ netMarginText() }}</strong>
                <span class="text-[10px] text-light-secondary font-semibold">Net profit share of revenue</span>
              </div>
              <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                <span class="text-[10px] text-light-secondary font-mono block">Expense ratio</span>
                <strong class="font-mono text-light-primary text-[15px] block mt-0.5">{{ expenseRatioText() }}</strong>
                <span class="text-[10px] text-light-secondary font-semibold">Outflows against revenue</span>
              </div>
              <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                <span class="text-[10px] text-light-secondary font-mono block">Profit covenant</span>
                <strong class="font-mono text-accent text-[15px] block mt-0.5">{{ store.covenantLabel() }}</strong>
                <span class="text-[10px] text-light-secondary font-semibold">Reinvest / dividends / reserve</span>
              </div>
              <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                <span class="text-[10px] text-light-secondary font-mono block">Ledger status</span>
                <strong class="font-mono text-success text-[13px] block mt-0.5">Reconciled</strong>
                <span class="text-[10px] text-light-secondary font-semibold">Single-source company ledger</span>
              </div>
            </div>
          </section>

          <!-- Income recognised -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-2">
            <div class="flex items-center justify-between border-b border-border pb-2.5">
              <div>
                <h2 class="text-[14px] font-bold text-light-primary">Income recognised</h2>
                <span class="text-[11px] text-light-secondary">By entry type</span>
              </div>
              <span class="text-[11px] font-mono text-light-secondary font-semibold">{{ incomeRows().length }} TYPES</span>
            </div>
            @if (incomeRows().length) {
              <div class="income-list">
                @for (row of incomeRows(); track row.label) {
                  <div class="flex justify-between py-1.5 border-b border-border/60 gap-3 text-[13px]">
                    <span class="text-light-secondary">{{ row.label }}</span>
                    <strong class="font-mono text-light-primary">{{ row.amount | seMoney }}</strong>
                  </div>
                }
              </div>
            } @else {
              <p class="text-[12px] text-light-secondary">No income entries yet. Lines appear as entries are posted.</p>
            }
          </section>

          <!-- Statement totals -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-1 text-[12px]">
            <h3 class="text-[13px] font-bold text-light-primary border-b border-border pb-2">Statement totals</h3>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Total recorded income:</span>
              <strong class="font-mono text-light-primary text-right">{{ d.accountsReports.income.total | seMoney }}</strong>
            </div>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Combined expenditure:</span>
              <strong class="font-mono text-light-primary text-right">{{ d.accountsReports.profit.expenditure | seMoney }}</strong>
            </div>
            <div class="flex justify-between py-1.5 gap-3">
              <span class="text-light-secondary">Net distributable profit:</span>
              <strong class="font-mono text-accent text-right">{{ d.accountsReports.profit.net | seMoney }}</strong>
            </div>
            <p class="text-[11px] text-light-secondary leading-normal pt-2">Distributable under the {{ store.covenantLabel() }} covenant once declared and approval-gated as a fund movement.</p>
          </section>

          <!-- Profit allocation covenant -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-2.5">
            <h3 class="text-[13px] font-bold text-light-primary border-b border-border pb-2">Profit allocation covenant</h3>
            <div class="covenant flex flex-col gap-2.5 text-[12px]">
              @for (row of covenantRows(); track row.label) {
                <div>
                  <div class="flex justify-between items-center">
                    <span class="font-semibold text-light-primary">{{ row.label }}</span>
                    <strong class="font-mono text-light-primary">{{ row.value }}%</strong>
                  </div>
                  <div class="w-full h-2 rounded-full bg-canvas-tint overflow-hidden my-1.5">
                    <div class="h-full rounded-full" [class.bg-accent]="row.label === 'Dividends'" [class.bg-light-surface-variant]="row.label !== 'Dividends'" [style.width.%]="row.value"></div>
                  </div>
                </div>
              }
            </div>
          </section>

          <!-- Signatories & document shelf -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-2 text-[12px]">
            <h3 class="text-[13px] font-bold text-light-primary border-b border-border pb-2">Signatories &amp; document shelf</h3>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Managing Director:</span>
              <strong class="text-light-primary">Signature on file</strong>
            </div>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Company Secretary:</span>
              <strong class="text-light-primary">Signature on file</strong>
            </div>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">External Auditors:</span>
              <strong class="text-light-primary">Engagement on file</strong>
            </div>
            <div class="grid grid-cols-2 gap-2 pt-2">
              <div class="p-2.5 border border-dashed border-border rounded-lg text-[11px] text-light-secondary bg-canvas/60">Quarterly income &amp; profit statement · Not yet uploaded</div>
              <div class="p-2.5 border border-dashed border-border rounded-lg text-[11px] text-light-secondary bg-canvas/60">Cost &amp; working capital schedule · Not yet uploaded</div>
              <div class="p-2.5 border border-dashed border-border rounded-lg text-[11px] text-light-secondary bg-canvas/60">Management letter · Not yet uploaded</div>
              <div class="p-2.5 border border-dashed border-border rounded-lg text-[11px] text-light-secondary bg-canvas/60">Audited annual report · Not yet uploaded</div>
            </div>
          </section>
        </div>
      </div>
    }
  `,
})
export class ReportsPage {
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
  readonly netMarginText = computed(() => {
    const m = this.store.netMarginPct();
    return m === null ? '-' : `${m.toFixed(1)}%`;
  });
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
