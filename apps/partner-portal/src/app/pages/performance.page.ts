import { Component, computed, inject } from '@angular/core';
import {
  SeBadgeComponent,
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

/** One income line drawn from the ledger's by-type breakdown. */
interface IncomeRow {
  label: string;
  amount: number;
}

/**
 * Screen P4, Operational & Financial Performance: yield ledger, revenue & cost
 * breakdown, and the parts of the factory picture that are not yet published to
 * partners. Every figure comes from the dashboard payload; a section with no
 * endpoint renders an honest empty state rather than a fabricated number.
 */
@Component({
  selector: 'app-performance-page',
  imports: [
    SeBadgeComponent,
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
        title="Operational & financial performance"
        description="Verified production and net yield ledgers for the Seentair garment factory, Aba — drawn live from the company accounting ledger."
      >
        <se-badge sePageStatus tone="info">{{ store.periodLabel() }} · current</se-badge>

        <div class="se-metric-grid">
          <se-metric-card
            label="Recorded income"
            [value]="d.performance.income | seMoney"
            hint="All income entries, incl. capital inflows"
          />
          <se-metric-card
            label="Total expenditure"
            [value]="d.performance.expenditure | seMoney"
            hint="Materials, production & overheads combined"
          />
          <se-metric-card
            label="Net operating profit"
            [value]="d.performance.net | seMoney"
            hint="Income less expenditure"
          />
          <se-metric-card label="Net margin" [value]="marginText()" hint="Net profit as a share of revenue" />
        </div>

        <div class="se-detail">
          <div class="se-detail__main">
            <se-card title="Revenue & cost breakdown" flush>
              <se-table
                caption="Income recognised by ledger entry type"
                [columns]="incomeColumns"
                [rows]="incomeRows()"
                hideDensity
                emptyHeading="No income entries yet"
                emptyText="Income lines appear here as entries are posted to the company ledger."
              />
            </se-card>

            <se-card title="Ledger totals">
              <dl seKv>
                <div seKvItem label="Total recorded income (topline)" numeric>
                  {{ d.performance.income | seMoney }}
                </div>
                <div seKvItem label="Total expenditure (COGS + operating)" numeric>
                  {{ d.performance.expenditure | seMoney }}
                </div>
                <div seKvItem label="Net operating profit" numeric>
                  {{ d.performance.net | seMoney }}
                </div>
              </dl>
              <p class="perf-note">
                Production cost basis: raw material + sewing + branding + packaging. Detailed
                cost-line disclosure follows officer sign-off.
              </p>
            </se-card>
          </div>

          <aside class="se-detail__aside">
            <se-card title="Net margin trend">
              <se-empty-state
                heading="Not yet published"
                [text]="marginNote()"
              />
            </se-card>

            <se-card title="More operational telemetry">
              <dl seKv>
                <div seKvItem label="Channel mix (retail · wholesale · in-store)">Not yet published</div>
                <div seKvItem label="Top products by revenue">Not yet published</div>
                <div seKvItem label="Factory floor (batches · output · QC)">Not yet published</div>
              </dl>
              <p class="perf-note">
                Product rankings, when released, are strictly anonymized SKU telemetry —
                aggregates only, never down to individual people.
              </p>
            </se-card>
          </aside>
        </div>
      </se-page>
    }
  `,
  styles: [
    `
      .perf-note {
        margin: var(--se-space-4) 0 0;
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
    `,
  ],
})
export class PerformancePage {
  readonly store = inject(PortalStore);
  private readonly currency = inject(SeCurrencyService);

  readonly money = (n: number): string => this.currency.format(n);

  readonly incomeColumns: SeColumn<IncomeRow>[] = [
    { key: 'label', header: 'Ledger entry type' },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      format: (value) => this.money(value as number),
    },
  ];

  /** Real revenue-by-ledger-type rows from accountsReports.income.byType. */
  readonly incomeRows = computed<IncomeRow[]>(() => {
    const byType = this.store.dash()?.accountsReports.income.byType ?? {};
    return Object.entries(byType)
      .filter(([, value]) => typeof value === 'number')
      .sort((a, b) => b[1] - a[1])
      .map(([key, amount]) => ({
        label: key.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
        amount,
      }));
  });

  readonly marginText = computed(() => {
    const margin = this.store.netMarginPct();
    return margin === null ? '–' : `${margin.toFixed(1)}%`;
  });

  readonly marginNote = computed(() => {
    const margin = this.store.netMarginPct();
    const now =
      margin === null
        ? 'No income has been recorded yet, so the margin is not computable.'
        : `The all-time net margin is ${margin.toFixed(1)}%.`;
    return `${now} A quarter-by-quarter trend appears once quarterly ledger snapshots are published.`;
  });
}
