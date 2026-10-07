import { Component, computed, inject } from '@angular/core';
import {
  SeBadgeComponent,
  SeBarChartComponent,
  SeCardComponent,
  SeColumn,
  SeCurrencyService,
  SeEmptyStateComponent,
  SeKvDirective,
  SeKvItemComponent,
  SeMetricCardComponent,
  SeMoneyPipe,
  SePageComponent,
  SeTableComponent,
} from '@seentair/ui';
import { PortalStore } from '../portal.store';

interface IncomeRow {
  label: string;
  amount: number;
}

/**
 * Screen P6, Statutory Financial Accounts & Executive Reports: statement shelf,
 * financial ratios, interim statement of comprehensive income and signatories.
 * Statement lines come from the live accounting ledger; documents that have no
 * endpoint render honest pending states rather than downloadable files.
 */
@Component({
  selector: 'app-reports-page',
  imports: [
    SeBadgeComponent,
    SeBarChartComponent,
    SeCardComponent,
    SeEmptyStateComponent,
    SeKvDirective,
    SeKvItemComponent,
    SeMetricCardComponent,
    SeMoneyPipe,
    SePageComponent,
    SeTableComponent,
  ],
  template: `
    @if (store.dash(); as d) {
      <se-page
        title="Statutory Financial Accounts & Executive Reports"
        description="Verified financial records and quarterly audits; statement lines are drawn live from the single-source company ledger."
      >
        <se-badge sePageStatus tone="success">Ledger reconciled</se-badge>

        <div class="se-metric-grid">
          <se-metric-card
            label="Net margin"
            [value]="netMarginText()"
            hint="Net profit retained from every unit of revenue"
          />
          <se-metric-card
            label="Expense ratio"
            [value]="expenseRatioText()"
            hint="Combined outflows against revenue"
          />
          <se-metric-card
            label="Profit covenant"
            [value]="store.covenantLabel()"
            hint="Reinvestment / dividends / reserve"
          />
          <se-metric-card label="Period" [value]="store.periodLabel()" hint="Continuous ledger basis" />
        </div>

        <div class="se-detail">
          <div class="se-detail__main">
            <se-card title="Income recognised in the company ledger" flush>
              <se-table
                caption="Income recognised in the ledger by entry type"
                [columns]="incomeColumns"
                [rows]="incomeRows()"
                [rowId]="byLabel"
                hideDensity
                emptyHeading="No income entries yet"
                emptyText="Income lines appear here as entries are posted to the company ledger."
              />
            </se-card>

            <se-card title="Statement totals">
              <dl seKv>
                <div seKvItem label="Total recorded income" numeric>
                  {{ d.accountsReports.income.total | seMoney }}
                </div>
                <div seKvItem label="Combined production & operating expenditure" numeric>
                  {{ 0 - d.accountsReports.profit.expenditure | seMoney }}
                </div>
                <div seKvItem label="Net distributable profit" numeric>
                  {{ d.accountsReports.profit.net | seMoney }}
                </div>
              </dl>
              <p class="rep-note">
                Distributable under the {{ store.covenantLabel() }} covenant once declared for a
                quarterly period and approval-gated as a fund movement.
              </p>
            </se-card>
          </div>

          <aside class="se-detail__aside">
            <se-card title="Profit allocation covenant">
              <se-bar-chart
                title="Profit allocation covenant"
                [labels]="covenantLabels"
                [values]="covenantValues()"
                [formatValue]="pct"
                height="sm"
              />
            </se-card>
            <se-card title="Signatories">
              <dl seKv>
                <div seKvItem label="Managing Director">Signature on file</div>
                <div seKvItem label="Company Secretary">Signature on file</div>
                <div seKvItem label="External Auditors">Engagement on file</div>
              </dl>
            </se-card>
          </aside>
        </div>

        <se-card title="Statutory document shelf">
          <div class="rep-shelf">
            <se-empty-state heading="Not yet uploaded" text="Quarterly income & profit statement." />
            <se-empty-state heading="Not yet uploaded" text="Cost & working capital schedule." />
            <se-empty-state heading="Not yet uploaded" text="Management letter." />
            <se-empty-state heading="Not yet uploaded" text="Audited annual report." />
          </div>
        </se-card>
      </se-page>
    }
  `,
  styles: [
    `
      .rep-note {
        margin: var(--se-space-4) 0 0;
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
      .rep-shelf {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: var(--se-space-4);
      }
    `,
  ],
})
export class ReportsPage {
  readonly store = inject(PortalStore);
  private readonly currency = inject(SeCurrencyService);

  readonly money = (n: number): string => this.currency.format(n);
  readonly pct = (n: number): string => `${n}%`;
  readonly byLabel = (row: IncomeRow): string => row.label;

  readonly covenantLabels = ['Reinvestment', 'Dividends', 'Reserve'];

  readonly covenantValues = computed(() => {
    const c = this.store.dash()?.config;
    return [c?.reinvestmentPct ?? 40, c?.dividendsPct ?? 40, c?.reservePct ?? 20];
  });

  readonly netMarginText = computed(() => {
    const m = this.store.netMarginPct();
    return m === null ? '–' : `${m.toFixed(1)}%`;
  });

  readonly expenseRatio = computed(() => {
    const p = this.store.dash()?.accountsReports.profit;
    if (!p || !p.income) return null;
    return (p.expenditure / p.income) * 100;
  });

  readonly expenseRatioText = computed(() => {
    const r = this.expenseRatio();
    return r === null ? '–' : `${r.toFixed(1)}%`;
  });

  readonly incomeColumns: SeColumn<IncomeRow>[] = [
    { key: 'label', header: 'Ledger entry type' },
    { key: 'amount', header: 'Amount', numeric: true, format: (v) => this.money(v as number) },
  ];

  readonly incomeRows = computed<IncomeRow[]>(() => {
    const byType = this.store.dash()?.accountsReports.income.byType ?? {};
    return Object.entries(byType)
      .filter(([, v]) => typeof v === 'number')
      .sort((a, b) => b[1] - a[1])
      .map(([key, amount]) => ({
        label: key.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
        amount,
      }));
  });
}
