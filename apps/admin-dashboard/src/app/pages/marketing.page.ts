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

const EMPTY_CAMPAIGN = () => ({
  name: '',
  type: 'campaign',
  channel: '',
  discountPercent: null as number | null,
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
    { key: 'runs', header: 'Runs', sortable: true, value: (c) => c.startDate },
    { key: 'run', header: 'Status', value: (c) => campaignRun(c) },
  ];

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
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) return;

    this.saving.set(true);
    this.api
      .createCampaign({
        name: f.name,
        type: f.type,
        channel: f.channel || undefined,
        discountPercent: f.discountPercent ?? undefined,
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
