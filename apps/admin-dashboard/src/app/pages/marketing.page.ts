import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SeBadgeComponent,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeCurrencyService,
  SeDatePipe,
  SeDrawerComponent,
  SeFieldComponent,
  SeInputDirective,
  SeMetricCardComponent,
  SePageComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import {
  CAMPAIGN_RUN_BADGE,
  CAMPAIGN_TYPES,
  CampaignRow,
  campaignRun,
  campaignTypeLabel,
  sourceLabel,
} from './marketing-format';

interface SourceRow {
  source: string;
  orders: number;
  revenue: number;
}

interface RoiRow {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  roi: number | null;
}

interface LoyaltyRow {
  customerId: string;
  points: number;
  lifetimePoints: number;
}

const EMPTY_CAMPAIGN = () => ({
  name: '',
  type: 'campaign',
  channel: '',
  discountPercent: null as number | null,
  spend: 0,
  startDate: '',
  endDate: '',
});

/**
 * Marketing: campaigns and where sales come from. A campaign is created from a
 * drawer (six fields); its dates decide whether it is live. Source performance
 * is read from the analytics dashboard, not kept here.
 */
@Component({
  selector: 'app-marketing-admin',
  imports: [
    FormsModule,
    SeBadgeComponent,
    SeButtonDirective,
    SeCellDirective,
    SeDatePipe,
    SeDrawerComponent,
    SeFieldComponent,
    SeInputDirective,
    SeMetricCardComponent,
    SePageComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Marketing">
      @if (canWrite) {
        <button seButton sePageActions variant="primary" type="button" (click)="openAdd()">
          Add campaign
        </button>
      }

      @if (sources().length > 0) {
        <div class="se-metric-grid">
          @for (s of sources(); track s.source) {
            <se-metric-card
              [label]="'Orders from ' + sourceLabel(s.source)"
              [value]="s.orders"
              [hint]="currency.format(s.revenue) + ' in sales'"
            />
          }
        </div>
      }

      @if (roiSummary().spend > 0) {
        <div class="se-metric-grid">
          <se-metric-card
            label="Attributed revenue"
            [value]="currency.format(roiSummary().attributedRevenue)"
            hint="Paid orders tagged with a campaign"
          />
          @if (roiSummary().unattributedRevenue > 0) {
            <se-metric-card
              label="Unattributed revenue"
              [value]="currency.format(roiSummary().unattributedRevenue)"
              hint="Paid orders with no campaign tag"
            />
          }
          <se-metric-card
            label="Campaign spend"
            [value]="currency.format(roiSummary().spend)"
            hint="What the campaigns cost"
          />
          <se-metric-card
            label="Overall ROI"
            [value]="roiSummary().roi === null ? '—' : roiSummary().roi + '%'"
            hint="(revenue − spend) ÷ spend"
          />
        </div>
      }

      <se-table
        caption="Campaigns"
        [columns]="columns"
        [rows]="campaigns()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        emptyHeading="No campaigns yet"
        [emptyText]="
          canWrite
            ? 'Add the first campaign to start tracking promotions.'
            : 'Campaigns appear here once the marketing team adds them.'
        "
        [emptyActionLabel]="canWrite ? 'Add campaign' : ''"
        (emptyAction)="openAdd()"
      >
        <ng-template seCell="runs" let-row>
          {{ row.startDate | seDate }} to {{ row.endDate | seDate }}
        </ng-template>
        <ng-template seCell="run" let-row>
          <se-badge [tone]="runBadge(row).tone">{{ runBadge(row).label }}</se-badge>
        </ng-template>
      </se-table>

      <div class="se-metric-grid" aria-label="Loyalty program">
        <se-metric-card
          label="Loyalty points outstanding"
          [value]="totalLoyaltyPoints()"
          hint="Across all shoppers"
        />
        <se-metric-card
          label="Loyalty members"
          [value]="loyaltyAccounts().length"
          hint="Shoppers with a balance"
        />
      </div>

      @if (loyaltyAccounts().length > 0) {
        <se-table
          caption="Loyalty balances"
          [columns]="loyaltyColumns"
          [rows]="loyaltyAccounts()"
          emptyHeading="No loyalty balances yet"
          emptyText="Points appear here once a shopper pays for an order."
        />
      }

      @if (canWrite) {
        <form class="se-form" (ngSubmit)="adjustLoyalty()">
          <se-field label="Customer ID" [error]="loyaltyErrors()['customerId']">
            <input seInput [(ngModel)]="loyaltyForm.customerId" name="loyaltyCustomer" />
          </se-field>
          <se-field label="Points" [error]="loyaltyErrors()['points']">
            <input seInput type="number" [(ngModel)]="loyaltyForm.points" name="loyaltyPoints" />
          </se-field>
          <se-field label="Note" [error]="loyaltyErrors()['note']">
            <input seInput [(ngModel)]="loyaltyForm.note" name="loyaltyNote" />
          </se-field>
          <se-field
            label="Approval request ID"
            hint="Create a fund-movement approval first; the server checks it"
            [error]="loyaltyErrors()['approvalRequestId']"
          >
            <input seInput [(ngModel)]="loyaltyForm.approvalRequestId" name="loyaltyApproval" />
          </se-field>
          <button seButton type="submit">Adjust points</button>
        </form>
      }

      @if (canWrite) {
        <se-drawer title="Add campaign" [(open)]="adding">
          <form class="se-form" id="campaign-form" (ngSubmit)="create()">
            <se-field label="Name" [error]="errors()['name']">
              <input seInput [(ngModel)]="form.name" name="name" />
            </se-field>
            <se-field label="Type">
              <select seInput [(ngModel)]="form.type" name="type">
                @for (t of types; track t.value) {
                  <option [value]="t.value">{{ t.label }}</option>
                }
              </select>
            </se-field>
            <se-field label="Channel" optional hint="Where it runs, such as Instagram">
              <input seInput [(ngModel)]="form.channel" name="channel" />
            </se-field>
            <se-field label="Discount percent" optional [error]="errors()['discountPercent']">
              <input
                seInput
                type="number"
                min="0"
                max="100"
                [(ngModel)]="form.discountPercent"
                name="discountPercent"
              />
            </se-field>
            <se-field
              label="Spend so far"
              optional
              hint="Money already put into this campaign, for ROI"
              [error]="errors()['spend']"
            >
              <input seInput type="number" min="0" [(ngModel)]="form.spend" name="spend" />
            </se-field>
            <div class="se-form__row">
              <se-field label="Starts" [error]="errors()['startDate']">
                <input seInput type="date" [(ngModel)]="form.startDate" name="startDate" />
              </se-field>
              <se-field label="Ends" [error]="errors()['endDate']">
                <input seInput type="date" [(ngModel)]="form.endDate" name="endDate" />
              </se-field>
            </div>
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="adding.set(false)">Cancel</button>
            <button
              seButton
              variant="primary"
              type="submit"
              form="campaign-form"
              [loading]="saving()"
            >
              Add campaign
            </button>
          </ng-container>
        </se-drawer>
      }
    </se-page>
  `,
})
export class MarketingAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(SeToastService);
  private readonly access = inject(AccessService);
  readonly currency = inject(SeCurrencyService);
  readonly sourceLabel = sourceLabel;

  readonly canWrite = this.access.can('marketing', 'full');
  readonly campaigns = signal<CampaignRow[]>([]);
  readonly sources = signal<SourceRow[]>([]);
  readonly roiById = signal<Record<string, RoiRow>>({});
  readonly roiSummary = signal<{
    attributedRevenue: number;
    unattributedRevenue: number;
    spend: number;
    roi: number | null;
  }>({
    attributedRevenue: 0,
    unattributedRevenue: 0,
    spend: 0,
    roi: null,
  });
  readonly loyaltyAccounts = signal<LoyaltyRow[]>([]);
  readonly totalLoyaltyPoints = () =>
    this.loyaltyAccounts().reduce((sum, a) => sum + a.points, 0);
  loyaltyForm = { customerId: '', points: 0, note: '', approvalRequestId: '' };
  readonly loyaltyErrors = signal<Record<string, string>>({});
  /** True only until the first answer arrives. */
  readonly loading = signal(true);
  readonly error = signal('');

  readonly adding = signal(false);
  readonly saving = signal(false);
  readonly errors = signal<Record<string, string>>({});
  readonly types = CAMPAIGN_TYPES;
  form = EMPTY_CAMPAIGN();

  readonly columns: SeColumn<CampaignRow>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'type', header: 'Type', sortable: true, value: (c) => campaignTypeLabel(c.type) },
    {
      key: 'channel',
      header: 'Channel',
      value: (c) => (c.channel ? sourceLabel(c.channel) : 'Any'),
    },
    {
      key: 'discountPercent',
      header: 'Discount',
      numeric: true,
      value: (c) => c.discountPercent,
      format: (v) => (v === null || v === undefined ? 'None' : `${v}%`),
    },
    {
      key: 'spend',
      header: 'Spend',
      numeric: true,
      value: (c) => c.spend,
      format: (v) => this.currency.format(Number(v) || 0),
    },
    {
      key: 'orders',
      header: 'Orders',
      numeric: true,
      value: (c) => this.roiById()[c.id]?.orders ?? null,
      format: (v) => (v === null || v === undefined ? '—' : String(v)),
    },
    {
      key: 'revenue',
      header: 'Attributed revenue',
      numeric: true,
      value: (c) => this.roiById()[c.id]?.revenue ?? null,
      format: (v) => (v === null || v === undefined ? '—' : this.currency.format(Number(v))),
    },
    {
      key: 'roi',
      header: 'ROI',
      numeric: true,
      value: (c) => this.roiById()[c.id]?.roi ?? null,
      format: (v) => (v === null || v === undefined ? 'No spend yet' : `${v}%`),
    },
    { key: 'runs', header: 'Runs', sortable: true, value: (c) => c.startDate },
    { key: 'run', header: 'Status', value: (c) => campaignRun(c) },
  ];

  readonly loyaltyColumns: SeColumn<LoyaltyRow>[] = [
    { key: 'customerId', header: 'Customer' },
    { key: 'points', header: 'Points', numeric: true },
    { key: 'lifetimePoints', header: 'Lifetime points', numeric: true },
  ];

  adjustLoyalty(): void {
    const f = this.loyaltyForm;
    const errors: Record<string, string> = {};
    if (!f.customerId.trim()) errors['customerId'] = 'Enter the shopper ID.';
    if (!Number.isInteger(Number(f.points)) || Number(f.points) === 0) {
      errors['points'] = 'Enter a non-zero whole number of points.';
    }
    if (!f.note.trim()) errors['note'] = 'Say why the balance is changing.';
    if (!f.approvalRequestId.trim()) errors['approvalRequestId'] = 'Enter the approved request ID.';
    this.loyaltyErrors.set(errors);
    if (Object.keys(errors).length > 0) return;
    this.api
      .adjustLoyalty(
        f.customerId.trim(),
        Number(f.points),
        f.note.trim(),
        f.approvalRequestId.trim(),
      )
      .subscribe({
        next: () => {
          this.toast.show(`Adjusted loyalty points for ${f.customerId.trim()}`);
          this.loyaltyForm = { customerId: '', points: 0, note: '', approvalRequestId: '' };
          this.loadLoyalty();
        },
        error: (err) => this.toast.show(err?.error?.message ?? 'Could not adjust points.'),
      });
  }

  private loadLoyalty(): void {
    this.api.loyaltyAccounts().subscribe({
      next: (accounts) => this.loyaltyAccounts.set(accounts),
      error: () => undefined,
    });
  }

  runBadge(c: CampaignRow) {
    return CAMPAIGN_RUN_BADGE[campaignRun(c)];
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.campaigns().subscribe({
      next: (res) => {
        this.campaigns.set(res as unknown as CampaignRow[]);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (this.campaigns().length === 0) {
          this.error.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
    this.api.dashboard().subscribe({
      next: (d) => this.sources.set(d.marketingSourcePerformance),
      error: () => undefined,
    });
    this.api.campaignRoi().subscribe({
      next: (r) => {
        this.roiById.set(
          Object.fromEntries(r.campaigns.map((c) => [c.id, c])) as Record<string, RoiRow>,
        );
        this.roiSummary.set({
          attributedRevenue: r.attributedRevenue,
          unattributedRevenue: r.unattributedRevenue,
          spend: r.spend,
          roi: r.roi,
        });
      },
      error: () => undefined,
    });
    this.loadLoyalty();
  }

  openAdd(): void {
    this.form = EMPTY_CAMPAIGN();
    this.errors.set({});
    this.adding.set(true);
  }

  create(): void {
    const f = this.form;
    const errors: Record<string, string> = {};
    if (!f.name.trim()) errors['name'] = 'Give the campaign a name.';
    if (!f.startDate) errors['startDate'] = 'Choose the day it starts.';
    if (!f.endDate) errors['endDate'] = 'Choose the day it ends.';
    if (f.startDate && f.endDate && f.endDate < f.startDate) {
      errors['endDate'] = 'The end must not be before the start.';
    }
    if (f.discountPercent !== null && (f.discountPercent < 0 || f.discountPercent > 100)) {
      errors['discountPercent'] = 'A discount is between 0 and 100 percent.';
    }
    if (f.spend !== null && f.spend !== undefined && f.spend < 0) {
      errors['spend'] = 'Spend cannot be negative.';
    }
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) return;

    this.saving.set(true);
    this.api
      .createCampaign({
        name: f.name,
        type: f.type,
        channel: f.channel || undefined,
        discountPercent: f.discountPercent ?? undefined,
        spend: f.spend || undefined,
        startDate: f.startDate,
        endDate: f.endDate,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.adding.set(false);
          this.toast.show(`Campaign ${f.name} added`);
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          // Keep the drawer and what was typed; the message sits under the dates,
          // which is what the API rejects most often.
          this.errors.set({
            endDate: err?.error?.message ?? 'The campaign could not be saved. Check the dates.',
          });
        },
      });
  }
}
