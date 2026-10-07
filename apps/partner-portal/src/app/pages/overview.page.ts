import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SeBarChartComponent,
  SeButtonDirective,
  SeCardComponent,
  SeCurrencyService,
  SeKvDirective,
  SeKvItemComponent,
  SeMetricCardComponent,
  SeMoneyPipe,
  SePageComponent,
} from '@seentair/ui';
import { PortalStore } from '../portal.store';

/**
 * Business overview (appendix 17, screen P2): the company's headline figures,
 * profit declared per period, the latest distribution and the partner's
 * holding. Every figure comes from the partner dashboard payload; nothing is
 * invented and nothing identifies a customer.
 */
@Component({
  selector: 'app-overview-page',
  imports: [
    DecimalPipe,
    RouterLink,
    SeBarChartComponent,
    SeButtonDirective,
    SeCardComponent,
    SeKvDirective,
    SeKvItemComponent,
    SeMetricCardComponent,
    SeMoneyPipe,
    SePageComponent,
  ],
  template: `
    @if (store.dash(); as d) {
      <se-page
        [title]="'Welcome back, ' + store.firstName()"
        [description]="
          store.periodLabel() +
          ' · Figures come from the live company ledger as aggregates; they update as the business trades.'
        "
      >
        <div class="se-metric-grid">
          <se-metric-card
            label="Revenue recorded"
            [value]="d.businessOverview.totalIncome | seMoney"
            hint="All income entries, all periods"
          />
          <se-metric-card
            label="Net profit"
            [value]="d.businessOverview.profitLoss.net | seMoney"
            [hint]="marginLine()"
          />
          <se-metric-card
            label="Distributions declared"
            [value]="d.profitSharing.length"
            hint="Quarterly profit-sharing periods"
          />
          <se-metric-card
            label="Finished goods in stock"
            [value]="(d.inventoryVisibility.finishedGoodsUnits | number) ?? 0"
            hint="Garment units, from the stock ledger"
          />
        </div>

        <div class="se-detail">
          <div class="se-detail__main">
            <se-card title="Profit declared per period">
              <a seButton size="sm" seCardActions routerLink="/profit-sharing">Profit sharing</a>
              @if (periods().length >= 2) {
                <se-bar-chart
                  title="Total profit declared for distribution, by period"
                  [labels]="periods()"
                  [values]="profits()"
                  [formatValue]="money"
                />
              } @else {
                <p>
                  The chart appears once two or more quarterly distributions have been declared.
                  Revenue by quarter is not yet published to partners.
                </p>
              }
            </se-card>
          </div>
          <div class="se-detail__aside">
            <se-card title="Latest distribution">
              @if (store.latestDistribution(); as dist) {
                <dl seKv>
                  <div seKvItem label="Your dividend" numeric>{{ dist.myDividend | seMoney }}</div>
                  <div seKvItem label="Period">{{ dist.period }}</div>
                  <div seKvItem label="Total profit declared" numeric>
                    {{ dist.totalProfit | seMoney }}
                  </div>
                  <div seKvItem [label]="'Dividend pool (' + d.config.dividendsPct + '%)'" numeric>
                    {{ dist.dividendPool | seMoney }}
                  </div>
                  <div seKvItem label="Your entitlement" numeric>
                    {{ d.investmentInformation.equityPercentage }}% equity
                  </div>
                </dl>
              } @else {
                <p>
                  No distributions yet. Dividends are declared quarterly from net profit ({{
                    store.covenantLabel()
                  }}).
                </p>
              }
            </se-card>
            <se-card title="Your holding">
              <a seButton size="sm" seCardActions routerLink="/investment">My investment</a>
              <dl seKv>
                <div seKvItem label="Invested" numeric>
                  {{ d.investmentInformation.investedAmount | seMoney }}
                </div>
                <div seKvItem label="Dividends to date" numeric>
                  {{ store.lifetimeDividends() | seMoney }}
                </div>
                <div seKvItem label="Shares held" numeric>
                  {{ d.investmentInformation.shares | number }} of
                  {{ d.investmentInformation.totalShares | number }}
                </div>
                <div seKvItem label="Equity" numeric>
                  {{ d.investmentInformation.equityPercentage }}%
                </div>
              </dl>
            </se-card>
          </div>
        </div>
      </se-page>
    }
  `,
})
export class OverviewPage {
  readonly store = inject(PortalStore);
  private readonly currency = inject(SeCurrencyService);

  readonly money = (n: number): string => this.currency.format(n);

  /** Oldest to newest; the API returns newest first. */
  private readonly rows = computed(() =>
    [...(this.store.dash()?.profitSharing ?? [])].reverse().slice(-8),
  );
  readonly periods = computed(() => this.rows().map((r) => r.period));
  readonly profits = computed(() => this.rows().map((r) => r.totalProfit));

  readonly marginLine = computed(() => {
    const margin = this.store.netMarginPct();
    const net = this.store.dash()?.businessOverview.profitLoss.net ?? 0;
    const what = net < 0 ? 'A loss: expenditure exceeds income' : 'Income less expenditure';
    return margin === null ? what : `${what} · ${margin.toFixed(1)}% margin`;
  });
}
