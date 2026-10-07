import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SeBadgeComponent,
  SeButtonDirective,
  SeCardComponent,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDrawerComponent,
  SeFieldComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMetricCardComponent,
  SeMoneyPipe,
  SePageComponent,
  SeRowAction,
  SeSkeletonComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import {
  DEFAULT_SHARE_CONFIG,
  DistributionRow,
  PERIOD_PATTERN,
  PartnerDashboard,
  PartnerRow,
  ShareConfig,
  allocatedEquity,
  covenantSentence,
  sharesFor,
} from './partners-format';

interface Candidate {
  id: string;
  name: string;
  email: string;
}

/**
 * Partners and investors: who holds what, what has been paid out, and the
 * two writes the owner makes here (a new partner record, a quarterly
 * distribution). A distribution moves funds, so it is approval-gated: the
 * request goes to the approvals queue first and the declaration carries the
 * approval id, which the API checks (principle #3).
 *
 * "View as partner" shows the same aggregate read the partner portal gets:
 * never customer data (principle #6).
 */
@Component({
  selector: 'app-partners-admin',
  imports: [
    DecimalPipe,
    FormsModule,
    SeBadgeComponent,
    SeButtonDirective,
    SeCardComponent,
    SeDrawerComponent,
    SeFieldComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMetricCardComponent,
    SeMoneyPipe,
    SePageComponent,
    SeSkeletonComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Partners" [description]="covenant()">
      @if (canManage) {
        <ng-container sePageActions>
          <button seButton type="button" (click)="openDistribution()">Declare distribution</button>
          <button seButton variant="primary" type="button" (click)="openAdd()">Add partner</button>
        </ng-container>
      }

      <div class="se-metric-grid">
        <se-metric-card label="Partners" [value]="partners().length" />
        <se-metric-card
          label="Equity allocated"
          [value]="allocated() + '%'"
          [hint]="'of the partners’ ' + config().partnersSharePct + '%'"
        />
        <se-metric-card label="Invested" [value]="invested() | seMoney" />
        <se-metric-card
          label="Last distribution"
          [value]="distributions()[0]?.period ?? 'None yet'"
          [hint]="
            distributions()[0] ? (distributions()[0].dividendPool | seMoney) + ' in dividends' : ''
          "
        />
      </div>

      <se-table
        caption="Partners"
        [columns]="columns"
        [rows]="partners()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [actions]="actions"
        hideDensity
        emptyHeading="No partners yet"
        emptyText="A partner needs a staff login with the partner role first; then add their record here."
      >
      </se-table>

      <se-card title="Distributions" flush>
        <se-table
          caption="Quarterly profit distributions"
          [columns]="distributionColumns"
          [rows]="distributions()"
          [rowId]="distributionId"
          [loading]="loading()"
          [error]="error()"
          (retry)="load()"
          activatable
          (rowActivate)="showDistribution($event)"
          hideDensity
          emptyHeading="No distributions yet"
          emptyText="Quarterly payouts appear here once declared."
        />
      </se-card>

      <se-drawer [title]="viewing()?.user?.name ?? 'Partner'" [(open)]="viewOpen">
        @if (viewError()) {
          <p>{{ viewError() }}</p>
        } @else if (view(); as v) {
          <p>
            <se-badge tone="info">As the partner sees it</se-badge>
            What their portal shows: business totals and their own stake. No customer data.
          </p>
          <dl seKv>
            <div seKvItem label="Equity">{{ v.investmentInformation.equityPercentage }}%</div>
            <div seKvItem label="Shares" numeric>
              {{ v.investmentInformation.shares | number }} of
              {{ v.investmentInformation.totalShares | number }}
            </div>
            <div seKvItem label="Invested" numeric>
              {{ v.investmentInformation.investedAmount | seMoney }}
            </div>
            <div seKvItem label="Dividends received" numeric>
              {{ dividendsOf(v) | seMoney: 2 }}
            </div>
            <div seKvItem label="Business income" numeric>
              {{ v.businessOverview.totalIncome | seMoney }}
            </div>
            <div seKvItem label="Finished goods in stock" numeric>
              {{ v.inventoryVisibility.finishedGoodsUnits | number }} units
            </div>
          </dl>
        } @else {
          <div aria-busy="true"><se-skeleton shape="detail" [rows]="6" /></div>
        }
      </se-drawer>

      <se-drawer [title]="'Distribution ' + (shown()?.period ?? '')" [(open)]="shownOpen">
        @if (shown(); as d) {
          <dl seKv>
            <div seKvItem label="Total profit" numeric>{{ d.totalProfit | seMoney }}</div>
            <div seKvItem label="Reinvested" numeric>{{ d.reinvestmentAmount | seMoney }}</div>
            <div seKvItem label="Dividend pool" numeric>{{ d.dividendPool | seMoney }}</div>
            <div seKvItem label="Reserve" numeric>{{ d.reserveAmount | seMoney }}</div>
            <div seKvItem label="Founder / CEO" numeric>
              {{ d.perPartnerBreakdown.founderCeo | seMoney }}
            </div>
            @for (p of d.perPartnerBreakdown.partners; track $index) {
              <div seKvItem [label]="p.name" numeric>{{ p.amount | seMoney }}</div>
            }
          </dl>
        }
      </se-drawer>

      @if (canManage) {
        <se-drawer title="Add partner" [(open)]="adding">
          <form class="se-form" id="add-partner" (ngSubmit)="createPartner()">
            <se-field
              label="Account"
              hint="Staff accounts with the partner role that have no partner record yet"
              [error]="addErrors()['userId']"
            >
              <select seInput name="userId" [(ngModel)]="np.userId">
                <option value="">Choose an account</option>
                @for (c of candidates(); track c.id) {
                  <option [value]="c.id">{{ c.name }} ({{ c.email }})</option>
                }
              </select>
            </se-field>
            <se-field
              label="Equity"
              [hint]="remaining() + '% of the partners\\' share is still unallocated'"
              [error]="addErrors()['equity']"
            >
              <input
                seInput
                name="equity"
                type="number"
                inputmode="decimal"
                min="0.01"
                [max]="remaining()"
                step="0.01"
                [(ngModel)]="np.equityPercentage"
              />
            </se-field>
            <se-field
              label="Invested amount"
              [hint]="'In ' + currencyCode() + '; their payment is recorded automatically'"
              [error]="addErrors()['invested']"
            >
              <input
                seInput
                name="invested"
                type="number"
                inputmode="decimal"
                min="1"
                step="0.01"
                [(ngModel)]="np.investedAmount"
              />
            </se-field>
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="adding.set(false)">Cancel</button>
            <button
              seButton
              variant="primary"
              type="submit"
              form="add-partner"
              [loading]="saving()"
            >
              Add partner
            </button>
          </ng-container>
        </se-drawer>

        <se-drawer title="Declare distribution" [(open)]="distributing">
          <form class="se-form" id="declare-distribution" (ngSubmit)="declare()">
            <p>
              A distribution moves funds, so management approves it first. Request the approval
              here; once it is approved in the queue, come back and declare.
            </p>
            <se-field
              label="Period"
              hint="A quarter, written 2026-Q4"
              [error]="distErrors()['period']"
            >
              <input
                seInput
                name="period"
                [(ngModel)]="nd.period"
                [disabled]="!!nd.approvalRequestId"
                autocomplete="off"
              />
            </se-field>
            <se-field
              label="Total profit"
              [hint]="'In ' + currencyCode() + ', for the whole period'"
              [error]="distErrors()['totalProfit']"
            >
              <input
                seInput
                name="totalProfit"
                type="number"
                inputmode="decimal"
                min="1"
                step="0.01"
                [(ngModel)]="nd.totalProfit"
                [disabled]="!!nd.approvalRequestId"
              />
            </se-field>
            @if (nd.approvalRequestId) {
              <p>
                <se-badge tone="info">Approval requested</se-badge>
                Request {{ nd.approvalRequestId.slice(0, 8).toUpperCase() }} is in the queue.
              </p>
            }
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="distributing.set(false)">Cancel</button>
            @if (nd.approvalRequestId) {
              <button
                seButton
                variant="primary"
                type="submit"
                form="declare-distribution"
                [loading]="saving()"
              >
                Declare distribution
              </button>
            } @else {
              <button
                seButton
                variant="primary"
                type="button"
                [loading]="saving()"
                (click)="requestApproval()"
              >
                Request approval
              </button>
            }
          </ng-container>
        </se-drawer>
      }
    </se-page>
  `,
})
export class PartnersAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);

  /** Adding a partner and declaring a distribution both need full access. */
  readonly canManage = this.access.can('partners', 'full');

  readonly partners = signal<PartnerRow[]>([]);
  readonly distributions = signal<DistributionRow[]>([]);
  readonly config = signal<ShareConfig>(DEFAULT_SHARE_CONFIG);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);

  readonly covenant = computed(() => covenantSentence(this.config()));
  readonly allocated = computed(() => allocatedEquity(this.partners()));
  readonly remaining = computed(() =>
    Math.max(0, Math.round((this.config().partnersSharePct - this.allocated()) * 100) / 100),
  );
  readonly invested = computed(() =>
    this.partners().reduce((s, p) => s + Number(p.investedAmount), 0),
  );
  readonly currencyCode = computed(() => this.currency.config()?.currencyCode ?? '');

  readonly columns: SeColumn<PartnerRow>[] = [
    { key: 'name', header: 'Partner', sortable: true, value: (p) => p.user.name },
    { key: 'email', header: 'Account', value: (p) => p.user.email },
    {
      key: 'equity',
      header: 'Equity',
      numeric: true,
      sortable: true,
      value: (p) => Number(p.equityPercentage),
      format: (v) => `${v}%`,
    },
    {
      key: 'shares',
      header: 'Shares',
      numeric: true,
      value: (p) => sharesFor(p.equityPercentage, this.config().totalShares),
      format: (v) => Number(v).toLocaleString('en'),
    },
    {
      key: 'invested',
      header: 'Invested',
      numeric: true,
      sortable: true,
      value: (p) => Number(p.investedAmount),
      format: (v) => this.currency.format(v as number),
    },
  ];
  readonly actions: SeRowAction<PartnerRow>[] = [
    { label: 'View as partner', icon: 'eye', run: (p) => this.viewAs(p) },
  ];

  readonly distributionId = (d: DistributionRow) => d.id ?? d.period;
  readonly distributionColumns: SeColumn<DistributionRow>[] = [
    { key: 'period', header: 'Period', sortable: true },
    {
      key: 'totalProfit',
      header: 'Profit',
      numeric: true,
      format: (v) => this.currency.format(v as number),
    },
    {
      key: 'reinvestmentAmount',
      header: 'Reinvested',
      numeric: true,
      format: (v) => this.currency.format(v as number),
    },
    {
      key: 'dividendPool',
      header: 'Dividends',
      numeric: true,
      format: (v) => this.currency.format(v as number),
    },
    {
      key: 'reserveAmount',
      header: 'Reserve',
      numeric: true,
      format: (v) => this.currency.format(v as number),
    },
  ];

  // ---- view as partner ----
  readonly viewOpen = signal(false);
  readonly viewing = signal<PartnerRow | null>(null);
  readonly view = signal<PartnerDashboard | null>(null);
  readonly viewError = signal('');

  // ---- distribution detail ----
  readonly shownOpen = signal(false);
  readonly shown = signal<DistributionRow | null>(null);

  // ---- add partner ----
  readonly adding = signal(false);
  readonly addErrors = signal<Record<string, string | undefined>>({});
  readonly candidates = signal<Candidate[]>([]);
  np = {
    userId: '',
    equityPercentage: null as number | null,
    investedAmount: null as number | null,
  };

  // ---- declare distribution ----
  readonly distributing = signal(false);
  readonly distErrors = signal<Record<string, string | undefined>>({});
  nd = { period: '', totalProfit: null as number | null, approvalRequestId: '' };

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.partners().subscribe({
      next: (res) => {
        const rows = res as unknown as PartnerRow[];
        this.partners.set(rows);
        this.error.set('');
        if (rows.length === 0) {
          this.distributions.set([]);
          this.loading.set(false);
          return;
        }
        // Distributions and the covenant are the same for every partner; read
        // them through the first one.
        this.api.partnerDistributions(rows[0].id).subscribe({
          next: (d) => {
            this.distributions.set(d as unknown as DistributionRow[]);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
        this.api.partnerDashboard(rows[0].id).subscribe({
          next: (v) => this.config.set((v as unknown as PartnerDashboard).config),
          error: () => undefined,
        });
      },
      error: (err) => {
        this.loading.set(false);
        if (this.partners().length === 0) {
          this.error.set(err?.error?.message ?? 'The server did not respond.');
        }
      },
    });
  }

  dividendsOf(v: PartnerDashboard): number {
    return v.profitSharing.reduce((s, p) => s + Number(p.myDividend), 0);
  }

  viewAs(p: PartnerRow): void {
    this.viewing.set(p);
    this.view.set(null);
    this.viewError.set('');
    this.viewOpen.set(true);
    this.api.partnerDashboard(p.id).subscribe({
      next: (v) => this.view.set(v as unknown as PartnerDashboard),
      error: (err) =>
        this.viewError.set(err?.error?.message ?? 'Could not load that partner view.'),
    });
  }

  showDistribution(d: DistributionRow): void {
    this.shown.set(d);
    this.shownOpen.set(true);
  }

  openAdd(): void {
    this.np = { userId: '', equityPercentage: null, investedAmount: null };
    this.addErrors.set({});
    this.adding.set(true);
    const taken = new Set(this.partners().map((p) => p.user.id));
    this.api.users().subscribe({
      next: (res) =>
        this.candidates.set(
          res.data
            .filter(
              (u) =>
                (u['role'] as { name?: string } | undefined)?.name === 'partner_investor' &&
                !taken.has(u['id'] as string),
            )
            .map((u) => ({
              id: u['id'] as string,
              name: u['name'] as string,
              email: u['email'] as string,
            })),
        ),
      error: () => this.candidates.set([]),
    });
  }

  createPartner(): void {
    const errors: Record<string, string> = {};
    const equity = Number(this.np.equityPercentage);
    const invested = Number(this.np.investedAmount);
    if (!this.np.userId) errors['userId'] = 'Choose the account that becomes a partner.';
    if (!(equity > 0)) errors['equity'] = 'Enter their equity as a percentage.';
    else if (equity > this.remaining())
      errors['equity'] = `Only ${this.remaining()}% is left to allocate.`;
    if (!(invested > 0)) errors['invested'] = 'Enter the amount they invested.';
    this.addErrors.set(errors);
    if (Object.keys(errors).length > 0) return;
    this.saving.set(true);
    this.api
      .createPartner({ userId: this.np.userId, equityPercentage: equity, investedAmount: invested })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.adding.set(false);
          this.toast.show('Partner added; their investment is recorded in the ledger');
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.addErrors.set({ equity: err?.error?.message ?? 'The partner could not be added.' });
        },
      });
  }

  openDistribution(): void {
    this.distErrors.set({});
    this.distributing.set(true);
  }

  private validDistribution(): boolean {
    const errors: Record<string, string> = {};
    if (!PERIOD_PATTERN.test(this.nd.period.trim()))
      errors['period'] = 'Write the quarter as 2026-Q4.';
    if (!(Number(this.nd.totalProfit) > 0))
      errors['totalProfit'] = 'Enter the period’s total profit.';
    this.distErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  requestApproval(): void {
    if (!this.validDistribution()) return;
    this.saving.set(true);
    this.api
      .createApproval('fund_movement', {
        purpose: `profit distribution ${this.nd.period.trim()}`,
        totalProfit: Number(this.nd.totalProfit),
      })
      .subscribe({
        next: (r) => {
          this.saving.set(false);
          this.nd.approvalRequestId = r.id;
          this.toast.show('Approval requested; management decides in the Approvals queue');
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.show(err?.error?.message ?? 'The approval could not be requested', {
            tone: 'danger',
            action: { label: 'Try again', run: () => this.requestApproval() },
          });
        },
      });
  }

  async declare(): Promise<void> {
    if (!this.nd.approvalRequestId || !this.validDistribution()) return;
    const period = this.nd.period.trim();
    const total = Number(this.nd.totalProfit);
    const c = this.config();
    const ok = await this.confirm.ask({
      title: `Declare the ${period} distribution?`,
      consequence:
        `${this.currency.format(total)} of profit is split ${c.reinvestmentPct}% reinvested, ` +
        `${c.dividendsPct}% dividends and ${c.reservePct}% reserve, and every partner sees their ` +
        `share in the portal. A period can only be distributed once.`,
      confirmLabel: 'Declare distribution',
    });
    if (!ok) return;
    this.saving.set(true);
    this.api
      .createDistribution({
        period,
        totalProfit: total,
        approvalRequestId: this.nd.approvalRequestId,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.distributing.set(false);
          this.nd = { period: '', totalProfit: null, approvalRequestId: '' };
          this.toast.show(`${period} distribution declared; partners can see it in their portal`);
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.distErrors.set({
            period:
              err?.error?.message ?? 'Not approved yet, or this period is already distributed.',
          });
        },
      });
  }
}
