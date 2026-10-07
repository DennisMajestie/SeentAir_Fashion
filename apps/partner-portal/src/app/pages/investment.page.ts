import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import {
  SeBadgeComponent,
  SeBarChartComponent,
  SeButtonDirective,
  SeCardComponent,
  SeCellDirective,
  SeColumn,
  SeCurrencyService,
  SeKvDirective,
  SeKvItemComponent,
  SeMetricCardComponent,
  SeMoneyPipe,
  SePageComponent,
  SeTableComponent,
} from '@seentair/ui';
import { PortalStore } from '../portal.store';

interface CapRow {
  id: string;
  cls: string;
  group: string;
  shares: number;
  equityPct: number;
  rights: string;
}

interface LedgerRow {
  id: string;
  date: string;
  purpose: string;
  shares: number;
  amount: number;
  status: 'cleared';
}

/**
 * Screen P3, My Investment & Equity Structure: registry record, share
 * mechanics, equity split, capitalization table and capital ledger. The
 * founder/partners split and the share covenant are mirrored from the server
 * dashboard config, so the "other partners" slice is the partners' share minus
 * this partner's equity.
 */
@Component({
  selector: 'app-investment-page',
  imports: [
    DecimalPipe,
    SeBadgeComponent,
    SeBarChartComponent,
    SeButtonDirective,
    SeCardComponent,
    SeCellDirective,
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
        title="My Investment & Equity Structure"
        [description]="
          'Official shareholder registry record for ' +
          (store.me()?.name ?? 'this partner account') +
          ' — read-only, maintained by Seentair Limited.'
        "
      >
        <se-badge sePageStatus tone="success">Corporate ledger synced</se-badge>
        <button seButton sePageActions type="button" (click)="print()">Print registry slip</button>

        <div class="se-metric-grid">
          <se-metric-card
            label="Total capital invested"
            [value]="d.investmentInformation.investedAmount | seMoney"
            hint="Fully paid · nominal value on registry"
          />
          <se-metric-card
            label="Investment inception"
            value="On registry"
            hint="Date held by the company secretary"
          />
          <se-metric-card
            label="Shares held"
            [value]="(d.investmentInformation.shares | number) + ' shares'"
            hint="1 share = 1 ordinary voting right"
          />
          <se-metric-card
            label="Equity ownership"
            [value]="d.investmentInformation.equityPercentage + '%'"
            [hint]="(d.investmentInformation.totalShares | number) + ' total company shares'"
          />
        </div>

        <se-card title="How your shares work & capital model">
          <dl seKv>
            <div seKvItem label="Instrument">Class A voting ordinary shares</div>
            <div seKvItem label="Profit retention policy">{{ d.config.reinvestmentPct }}% reinvestment</div>
            <div seKvItem label="Dividend payout pool">{{ d.config.dividendsPct }}% of quarterly net</div>
            <div seKvItem label="Strategic reserve">{{ d.config.reservePct }}% retained</div>
            <div seKvItem label="Liquidation preference">Per shareholders' agreement</div>
          </dl>
        </se-card>

        <div class="se-detail">
          <div class="se-detail__main">
            <se-card title="Equity distribution">
              <se-bar-chart
                title="Equity split by shareholder group"
                [labels]="equityLabels()"
                [values]="equityValues()"
                [formatValue]="pct"
                height="sm"
              />
            </se-card>
          </div>
          <aside class="se-detail__aside">
            <se-card title="Registry facts">
              <dl seKv>
                <div seKvItem label="Authorized shares" numeric>
                  {{ d.config.totalShares | number }}
                </div>
                <div seKvItem label="Your shares" numeric>
                  {{ d.investmentInformation.shares | number }}
                </div>
                <div seKvItem label="Your equity" numeric>
                  {{ d.investmentInformation.equityPercentage }}%
                </div>
              </dl>
            </se-card>
          </aside>
        </div>

        <se-card title="Official capitalization table" flush>
          <se-table
            caption="Capitalization structure by shareholder group"
            [columns]="capColumns"
            [rows]="capRows()"
            hideDensity
          />
        </se-card>

        <se-card title="Investment transactions & capital calls ledger">
          <se-table
            caption="Verifiable subscriptions against the registry"
            [columns]="ledgerColumns"
            [rows]="ledgerRows()"
            hideDensity
          >
            <ng-template seCell="status" let-row>
              <se-badge tone="success">Cleared · audited</se-badge>
            </ng-template>
          </se-table>
          <p class="inv-note">
            Certified share certificates and the countersigned shareholders' agreement are issued
            by the company secretary; they appear under Documents &amp; Messages once shared.
          </p>
        </se-card>
      </se-page>
    }
  `,
  styles: [
    `
      .inv-note {
        margin: var(--se-space-4) 0 0;
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
    `,
  ],
})
export class InvestmentPage {
  readonly store = inject(PortalStore);
  private readonly currency = inject(SeCurrencyService);

  readonly money = (n: number): string => this.currency.format(n);
  readonly pct = (n: number): string => `${n.toFixed(1)}%`;

  readonly otherPartnersPct = computed(() => {
    const mine = this.store.dash()?.investmentInformation.equityPercentage ?? 0;
    const partnersPct = this.store.dash()?.config.partnersSharePct ?? 40;
    return Math.max(0, partnersPct - mine);
  });

  readonly founderShares = computed(() => {
    const total = this.store.dash()?.investmentInformation.totalShares ?? 0;
    const founderPct = this.store.dash()?.config.founderSharePct ?? 60;
    return Math.round(total * (founderPct / 100));
  });

  readonly otherPartnersShares = computed(() => {
    const d = this.store.dash()?.investmentInformation;
    if (!d) return 0;
    return Math.max(0, d.totalShares - this.founderShares() - d.shares);
  });

  readonly equityLabels = computed(() => [
    'Founder & executive team',
    'Other strategic partners',
    `Your holding (${this.store.firstName()})`,
  ]);

  readonly equityValues = computed(() => [
    this.store.dash()?.config.founderSharePct ?? 0,
    this.otherPartnersPct(),
    this.store.dash()?.investmentInformation.equityPercentage ?? 0,
  ]);

  readonly capColumns: SeColumn<CapRow>[] = [
    { key: 'cls', header: 'Class' },
    { key: 'group', header: 'Shareholder group' },
    { key: 'shares', header: 'Shares', numeric: true, format: (v) => this.num(v as number) },
    { key: 'equityPct', header: 'Equity', numeric: true, format: (v) => `${v}%` },
    { key: 'rights', header: 'Dividend rights' },
  ];

  readonly capRows = computed<CapRow[]>(() => {
    const d = this.store.dash();
    if (!d) return [];
    return [
      {
        id: 'founder',
        cls: 'A',
        group: 'Founder & executive team',
        shares: this.founderShares(),
        equityPct: d.config.founderSharePct,
        rights: `${d.config.founderSharePct}% of pool`,
      },
      {
        id: 'partners',
        cls: 'A',
        group: 'Other strategic partners',
        shares: this.otherPartnersShares(),
        equityPct: this.otherPartnersPct(),
        rights: 'Equity % of pool',
      },
      {
        id: 'me',
        cls: 'A',
        group: `${this.store.me()?.name ?? 'You'} (your holding)`,
        shares: d.investmentInformation.shares,
        equityPct: d.investmentInformation.equityPercentage,
        rights: `${d.investmentInformation.equityPercentage}% of pool`,
      },
    ];
  });

  readonly ledgerColumns: SeColumn<LedgerRow>[] = [
    { key: 'date', header: 'Date' },
    { key: 'purpose', header: 'Transaction purpose / call' },
    { key: 'shares', header: 'Shares issued', numeric: true, format: (v) => this.num(v as number) },
    { key: 'amount', header: 'Amount subscribed', numeric: true, format: (v) => this.money(v as number) },
    { key: 'status', header: 'Status' },
  ];

  readonly ledgerRows = computed<LedgerRow[]>(() => {
    const d = this.store.dash();
    if (!d) return [];
    return [
      {
        id: 'initial',
        date: 'On registry',
        purpose: 'Initial equity injection: founding partner subscription',
        shares: d.investmentInformation.shares,
        amount: d.investmentInformation.investedAmount,
        status: 'cleared',
      },
    ];
  });

  private num(value: number): string {
    return new Intl.NumberFormat('en-NG').format(value);
  }

  print(): void {
    window.print();
  }
}
