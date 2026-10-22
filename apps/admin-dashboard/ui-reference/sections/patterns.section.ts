import { Component, computed, inject, signal } from '@angular/core';
import {
  SeActivityComponent,
  SeActivityEntry,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDatePipe,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilter,
  SeFilterBarComponent,
  SeFilterValue,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMoneyPipe,
  SePageComponent,
  SeStatusComponent,
  SeTabPanelDirective,
  SeTableComponent,
  SeTabsComponent,
  SeToastService,
  statusMeaning,
} from '@seentair/ui';

interface Supplier {
  id: string;
  name: string;
  category: string;
  city: string;
  owed: number;
  status: string;
  lastOrder: string;
}

const SUPPLIERS: Supplier[] = [
  ['Aba Textile Mills', 'fabric', 'Aba', 412000, 'active', '2026-10-02'],
  ['Onitsha Thread Co.', 'trims', 'Onitsha', 0, 'active', '2026-09-28'],
  ['Kano Dye Works', 'fabric', 'Kano', 96500, 'active', '2026-09-30'],
  ['Lagos Label House', 'branding', 'Lagos', 38000, 'pending', '2026-10-04'],
  ['Enugu Zip & Button', 'trims', 'Enugu', 0, 'disabled', '2026-06-11'],
  ['Aba Packaging Ltd', 'packaging', 'Aba', 127400, 'active', '2026-10-05'],
  ['Ibadan Cotton Traders', 'fabric', 'Ibadan', 254000, 'active', '2026-10-01'],
  ['Nnewi Print Shop', 'branding', 'Nnewi', 0, 'pending', '2026-10-06'],
].map(([name, category, city, owed, status, lastOrder], i) => ({
  id: `s${i + 1}`,
  name: name as string,
  category: category as string,
  city: city as string,
  owed: owed as number,
  status: status as string,
  lastOrder: lastOrder as string,
}));

@Component({
  selector: 'ref-patterns',
  imports: [
    SeActivityComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeCellDirective,
    SeDatePipe,
    SeDrawerComponent,
    SeFieldComponent,
    SeFilterBarComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMoneyPipe,
    SePageComponent,
    SeStatusComponent,
    SeTabPanelDirective,
    SeTableComponent,
    SeTabsComponent,
  ],
  template: `
    <p class="ref-lede">
      The patterns are written in PATTERNS.md. These two screens are the patterns applied: a list
      and a detail page, built only from the system. Filter the list, open "Add supplier", try to
      save, then reject the request on the detail page.
    </p>

    <h3 class="ref-h3">A list screen: page template, filtering, create in a drawer</h3>
    <div class="ref-screen">
      <se-page title="Suppliers">
        <button seButton sePageActions>Export</button>
        <button seButton variant="primary" sePageActions (click)="adding.set(true)">
          Add supplier
        </button>
        <se-table
          caption="Suppliers"
          [columns]="columns"
          [rows]="rows()"
          [pageSize]="5"
          activatable
          (rowActivate)="toast.show('Opened ' + $event.name)"
          [emptyHeading]="filtering() ? 'No suppliers match these filters' : 'No suppliers yet'"
          [emptyText]="
            filtering()
              ? 'Remove a filter or clear them all to see every supplier.'
              : 'Add the first supplier to start recording purchases.'
          "
          [emptyActionLabel]="filtering() ? 'Clear all filters' : 'Add supplier'"
          (emptyAction)="filtering() ? clearFilters() : adding.set(true)"
        >
          <se-filter-bar
            seTableToolbar
            searchLabel="Search suppliers"
            searchPlaceholder="Name or city"
            [(query)]="query"
            [filters]="filters"
            [(value)]="filterValue"
            [summary]="rows().length + (rows().length === 1 ? ' supplier' : ' suppliers')"
          />
          <ng-template seCell="status" let-row>
            <se-status kind="account" [value]="row.status" />
          </ng-template>
          <ng-template seCell="lastOrder" let-row>{{ row.lastOrder | seDate }}</ng-template>
        </se-table>
      </se-page>
    </div>

    <se-drawer title="Add supplier" [(open)]="adding">
      @if (saveFailed()) {
        <se-banner
          tone="danger"
          title="The supplier was not saved"
          actionLabel="Try again"
          (action)="save()"
        >
          The server did not respond. What you typed is still here.
        </se-banner>
      }
      <form class="se-form" (submit)="$event.preventDefault(); save()">
        <se-field label="Supplier name" [error]="nameError()">
          <input seInput [value]="name()" (input)="name.set($any($event.target).value)" />
        </se-field>
        <div class="se-form__row">
          <se-field label="Category">
            <select seInput>
              <option>Fabric</option>
              <option>Trims</option>
              <option>Branding</option>
              <option>Packaging</option>
            </select>
          </se-field>
          <se-field label="City"><input seInput /></se-field>
        </div>
        <se-field label="Phone" hint="Include the country code"
          ><input seInput type="tel"
        /></se-field>
        <se-field label="Notes" optional><textarea seInput rows="3"></textarea></se-field>
      </form>
      <ng-container seDrawerFooter>
        <button seButton type="button" (click)="adding.set(false)">Cancel</button>
        <button seButton variant="primary" type="button" [loading]="saving()" (click)="save()">
          Save supplier
        </button>
      </ng-container>
    </se-drawer>

    <h3 class="ref-h3">A detail screen: header, status, facts, history, approval</h3>
    <div class="ref-screen">
      <se-page
        title="Price change: Box Tee"
        [breadcrumbs]="[
          { label: 'Approvals', link: '/approvals' },
          { label: 'Price change: Box Tee' },
        ]"
      >
        <se-status sePageStatus kind="approval" [value]="decision()" />
        <p sePageMeta>Requested by Test Sales on {{ requestedAt | seDate: 'datetime' }}</p>
        @if (decision() === 'pending') {
          <ng-container sePageActions>
            <button seButton (click)="reject()">Reject</button>
            <button seButton variant="primary" (click)="approve()">Approve</button>
          </ng-container>
        }
        <se-tabs sePageTabs #tabs label="Request sections" [tabs]="tabList" [(active)]="tab" />

        <div seTabPanel="request" [for]="tabs" class="se-detail">
          <div class="se-detail__main">
            <se-card title="What is being asked">
              <dl seKv>
                <div seKvItem label="Product">Box Tee</div>
                <div seKvItem label="Current price" numeric>{{ 24000 | seMoney }}</div>
                <div seKvItem label="Proposed price" numeric>{{ 21500 | seMoney }}</div>
                <div seKvItem label="Change" numeric>−10.4%</div>
                <div seKvItem label="Applies to">
                  Retail only. Wholesale tiers follow the new price.
                </div>
              </dl>
            </se-card>
          </div>
          <aside class="se-detail__aside">
            <se-card title="Activity">
              <se-activity [entries]="history()" />
            </se-card>
          </aside>
        </div>
        <div seTabPanel="impact" [for]="tabs">
          <se-card title="Sales at the current price">
            <p class="se-type-body">
              38 sold in the last 30 days, {{ 912000 | seMoney }} in revenue.
            </p>
          </se-card>
        </div>
      </se-page>
    </div>
  `,
})
export class PatternsSection {
  readonly toast = inject(SeToastService);
  private readonly confirm = inject(SeConfirmService);
  private readonly currency = inject(SeCurrencyService);

  // ---- list ----
  readonly query = signal('');
  readonly filterValue = signal<SeFilterValue>({});
  readonly filters: SeFilter[] = [
    {
      key: 'category',
      label: 'Category',
      options: ['fabric', 'trims', 'branding', 'packaging'].map((v) => ({
        value: v,
        label: v[0].toUpperCase() + v.slice(1),
      })),
    },
    {
      key: 'status',
      label: 'Status',
      options: ['active', 'pending', 'disabled'].map((v) => ({
        value: v,
        label: statusMeaning('account', v).label,
      })),
    },
  ];
  readonly filtering = computed(
    () => !!this.query().trim() || Object.keys(this.filterValue()).length > 0,
  );
  readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const f = this.filterValue();
    return SUPPLIERS.filter(
      (s) =>
        (!q || s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q)) &&
        (!f['category'] || s.category === f['category']) &&
        (!f['status'] || s.status === f['status']),
    );
  });
  readonly columns: SeColumn<Supplier>[] = [
    { key: 'name', header: 'Supplier', sortable: true },
    { key: 'category', header: 'Category', sortable: true, format: (v) => capitalise(String(v)) },
    { key: 'city', header: 'City', sortable: true },
    { key: 'status', header: 'Status' },
    { key: 'lastOrder', header: 'Last order', sortable: true },
    {
      key: 'owed',
      header: 'Owed',
      numeric: true,
      sortable: true,
      format: (v) => this.currency.format(v as number),
    },
  ];

  clearFilters(): void {
    this.query.set('');
    this.filterValue.set({});
  }

  // ---- create ----
  readonly adding = signal(false);
  readonly name = signal('');
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly saveFailed = signal(false);
  private attempts = 0;
  readonly nameError = computed(() =>
    this.submitted() && !this.name().trim() ? 'Enter the supplier name.' : '',
  );

  /** First attempt fails, to show the error pattern; the retry succeeds. */
  save(): void {
    this.submitted.set(true);
    if (this.nameError()) return;
    this.saving.set(true);
    this.saveFailed.set(false);
    setTimeout(() => {
      this.saving.set(false);
      if (++this.attempts === 1) {
        this.saveFailed.set(true);
        return;
      }
      this.adding.set(false);
      this.toast.show(`${this.name()} saved`);
      this.name.set('');
      this.submitted.set(false);
      this.attempts = 0;
    }, 900);
  }

  // ---- detail ----
  readonly requestedAt = '2026-10-06T09:12:00';
  readonly tabList = [
    { id: 'request', label: 'Request' },
    { id: 'impact', label: 'Impact' },
  ];
  readonly tab = signal('request');
  readonly decision = signal<'pending' | 'approved' | 'rejected'>('pending');
  readonly history = signal<SeActivityEntry[]>([
    { at: '2026-10-06T09:12:00', text: 'Price change requested', actor: 'Test Sales' },
    { at: '2026-10-01T16:40:00', text: 'Price last changed to 24,000', actor: 'Test Owner' },
  ]);

  async approve(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Approve this price change?',
      consequence:
        'Box Tee can then be set to the new price for every retail customer. Your approval is written to the audit log and cannot be withdrawn.',
      confirmLabel: 'Approve change',
    });
    if (!ok) return;
    this.decision.set('approved');
    this.history.update((h) => [
      { at: new Date(), text: 'Approved', actor: 'You', tone: 'success' },
      ...h,
    ]);
    this.toast.show('Price change approved');
  }

  async reject(): Promise<void> {
    const reason = await this.confirm.askWithReason({
      title: 'Reject this price change?',
      consequence:
        'The request is closed and Box Tee stays at its current price. Your reason is shown to the requester and written to the audit log.',
      confirmLabel: 'Reject request',
      reasonLabel: 'Reason for rejection',
      danger: true,
    });
    if (reason === null) return;
    this.decision.set('rejected');
    this.history.update((h) => [
      { at: new Date(), text: `Rejected: ${reason}`, actor: 'You', tone: 'danger' },
      ...h,
    ]);
    this.toast.show('Request rejected');
  }
}

function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
