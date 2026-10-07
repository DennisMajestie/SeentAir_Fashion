import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import {
  SeBadgeComponent,
  SeButtonDirective,
  SeCardComponent,
  SeCellDirective,
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

interface PayoutRow {
  id: string;
  period: string;
  totalProfit: number;
  dividendPool: number;
  myDividend: number;
}

/**
 * Screen P7, Profit Sharing & Dividend Distribution. Pool figures derive from
 * the API's distribution rows; the 40/40/20 covenant and the founder's 60%
 * pool share are confirmed company config mirrored from the server's own
 * distribution math (partners.service.ts) — never invented values.
 */
@Component({
  selector: 'app-profit-sharing-page',
  imports: [
    DecimalPipe,
    SeBadgeComponent,
    SeButtonDirective,
    SeCardComponent,
    SeCellDirective,
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
        title="Profit Sharing & Dividend Distribution"
        description="Quarterly distribution allocation for ordinary share equity partners, declared from audited net profit and approval-gated as fund movements."
      >
        <se-badge sePageStatus tone="info">{{ store.covenantLabel() }} covenant</se-badge>
        <button seButton sePageActions type="button" (click)="print()">Print statement</button>

        @if (store.latestDistribution(); as latest) {
          <div class="se-metric-grid">
            <se-metric-card
              label="Latest profit declared"
              [value]="latest.totalProfit | seMoney"
              [hint]="latest.period + ' · certified & board approved'"
            />
            <se-metric-card
              label="Dividend pool"
              [value]="latest.dividendPool | seMoney"
              [hint]="d.config.dividendsPct + '% of quarterly net profit'"
            />
            <se-metric-card
              label="Your dividend"
              [value]="latest.myDividend | seMoney"
              [hint]="d.investmentInformation.equityPercentage + '% equity entitlement'"
            />
            <se-metric-card
              label="Lifetime dividends"
              [value]="store.lifetimeDividends() | seMoney"
              [hint]="cashOnCashHint()"
            />
          </div>

          <div class="se-detail">
            <div class="se-detail__main">
              <se-card title="Allocation break-up">
                <dl seKv>
                  <div seKvItem [label]="'Capital reinvestment (' + d.config.reinvestmentPct + '%)'" numeric>
                    {{ reinvestment(latest.totalProfit) | seMoney }}
                  </div>
                  <div seKvItem [label]="'Dividend payout pool (' + d.config.dividendsPct + '%)'" numeric>
                    {{ latest.dividendPool | seMoney }}
                  </div>
                  <div seKvItem [label]="'Strategic reserve (' + d.config.reservePct + '%)'" numeric>
                    {{ reserve(latest.totalProfit) | seMoney }}
                  </div>
                  <div seKvItem label="Total operating profit declared" numeric>
                    {{ latest.totalProfit | seMoney }}
                  </div>
                </dl>
              </se-card>
            </div>
            <aside class="se-detail__aside">
              <se-card title="Your account">
                <dl seKv>
                  <div seKvItem label="Your dividend" numeric>{{ latest.myDividend | seMoney }}</div>
                  <div seKvItem label="Equity entitlement" numeric>
                    {{ d.investmentInformation.equityPercentage }}%
                  </div>
                  <div seKvItem label="Shares held" numeric>
                    {{ d.investmentInformation.shares | number }} of
                    {{ d.investmentInformation.totalShares | number }}
                  </div>
                  @if (cashOnCash() !== null) {
                    <div seKvItem label="Cash-on-cash" numeric>{{ cashOnCash() | number: '1.0-1' }}%</div>
                  }
                  <div seKvItem label="Scheduled settlement">Advised per remittance</div>
                </dl>
              </se-card>
            </aside>
          </div>
        } @else {
          <se-card title="Distribution cycle">
            <se-empty-state
              heading="No distributions yet"
              [text]="'Dividends are declared quarterly from audited net profit (' + store.covenantLabel() + ').'"
            />
          </se-card>
        }

        <se-card title="How profit sharing is calculated">
          <p class="prs-copy">
            Under Seentair Limited's shareholder covenant,
            <strong>{{ d.config.dividendsPct }}% of certified net quarterly profit</strong> is
            ring-fenced for cash dividends. Of that pool,
            <strong>{{ d.config.founderSharePct }}% accrues to the founder</strong> and each outside
            partner receives <strong>their equity percentage of the pool</strong>; a further
            <strong>{{ d.config.reinvestmentPct }}% of profit</strong> is reinvested and
            <strong>{{ d.config.reservePct }}%</strong> enters the strategic reserve. Distribution
            occurs automatically on declaration, subject to server-side approval of the fund
            movement.
          </p>
        </se-card>

        <se-card title="Historical payout ledger" flush>
          <se-table
            caption="All declared distribution periods"
            [columns]="payoutColumns"
            [rows]="payoutRows()"
            hideDensity
            emptyHeading="No distributions yet"
            emptyText="The payout ledger populates as quarterly distributions are declared."
          >
            <ng-template seCell="status" let-row>
              <se-badge tone="success">Declared</se-badge>
            </ng-template>
          </se-table>
        </se-card>
      </se-page>
    }
  `,
  styles: [
    `
      .prs-copy {
        margin: 0;
        max-width: 82ch;
        color: var(--se-color-text-muted);
        font: var(--se-type-body);
      }
      .prs-copy strong {
        color: var(--se-color-text);
      }
    `,
  ],
})
export class ProfitSharingPage {
  readonly store = inject(PortalStore);
  private readonly currency = inject(SeCurrencyService);

  readonly money = (n: number): string => this.currency.format(n);

  readonly payoutColumns: SeColumn<PayoutRow>[] = [
    { key: 'period', header: 'Quarter' },
    { key: 'totalProfit', header: 'Net certified profit', numeric: true, format: (v) => this.money(v as number) },
    { key: 'dividendPool', header: 'Dividend pool', numeric: true, format: (v) => this.money(v as number) },
    { key: 'myDividend', header: 'Your payout', numeric: true, format: (v) => this.money(v as number) },
    { key: 'status', header: 'Payment status' },
  ];

  readonly payoutRows = computed<PayoutRow[]>(() =>
    (this.store.dash()?.profitSharing ?? []).map((row) => ({ id: row.period, ...row })),
  );

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

  readonly cashOnCash = computed(() => {
    const invested = this.store.dash()?.investmentInformation.investedAmount ?? 0;
    if (!invested) return null;
    return (this.store.lifetimeDividends() / invested) * 100;
  });

  readonly cashOnCashHint = computed(() => {
    const c = this.cashOnCash();
    return c === null ? 'Cumulative dividends received' : `${c.toFixed(1)}% cash-on-cash on capital`;
  });

  print(): void {
    window.print();
  }
}
