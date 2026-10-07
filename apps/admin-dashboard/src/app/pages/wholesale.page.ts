import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SE_STATUS,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeDatePipe,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilter,
  SeFilterBarComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SePageComponent,
  SeRowAction,
  SeStatusComponent,
  SeTableComponent,
  SeTabPanelDirective,
  SeTabsComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { urlFilters } from '../url-filters';
import { AccountRow, TierRow, buyerLabel, place, tierLabel } from './wholesale-format';

const EMPTY_TIER = () => ({
  name: '',
  discountPercent: null as number | null,
  ruleDescription: '',
});

/**
 * Wholesale: buyer applications and the price tiers. Approving an application
 * assigns a tier; rejecting needs a reason. A tier's name and rule can be
 * edited at once, but its discount is a price change, so it goes through an
 * approval request that Management decides in the queue before it is applied.
 */
@Component({
  selector: 'app-wholesale-admin',
  imports: [
    FormsModule,
    SeButtonDirective,
    SeCellDirective,
    SeDatePipe,
    SeDrawerComponent,
    SeFieldComponent,
    SeFilterBarComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SePageComponent,
    SeStatusComponent,
    SeTableComponent,
    SeTabPanelDirective,
    SeTabsComponent,
  ],
  template: `
    <se-page title="Wholesale">
      @if (canEditTiers && tab() === 'tiers') {
        <button seButton sePageActions variant="primary" type="button" (click)="openAddTier()">
          Add tier
        </button>
      }
      <se-tabs #t sePageTabs label="Wholesale sections" [tabs]="tabs()" [(active)]="tab" />

      <div seTabPanel="accounts" [for]="t">
        <se-table
          caption="Wholesale accounts"
          [columns]="accountColumns"
          [rows]="accountRows()"
          [loading]="loading()"
          [error]="error()"
          (retry)="load()"
          [pageSize]="25"
          [actions]="accountActions"
          activatable
          (rowActivate)="openAccount($event)"
          [emptyHeading]="filtering() ? 'No accounts match' : 'No applications yet'"
          emptyText="Wholesale buyers apply from the storefront and appear here for review."
        >
          <se-filter-bar
            seTableToolbar
            searchLabel="Search accounts"
            searchPlaceholder="Name, email or business"
            [(query)]="query"
            [filters]="filters"
            [(value)]="filterValue"
            [summary]="accountSummary()"
          />
          <ng-template seCell="createdAt" let-row>{{ row.createdAt | seDate }}</ng-template>
          <ng-template seCell="status" let-row
            ><se-status kind="account" [value]="row.status"
          /></ng-template>
        </se-table>
      </div>

      <div seTabPanel="tiers" [for]="t">
        <se-table
          caption="Price tiers"
          [columns]="tierColumns"
          [rows]="tiers()"
          [loading]="loading()"
          [error]="error()"
          (retry)="load()"
          [actions]="tierActions"
          hideDensity
          emptyHeading="No tiers yet"
          emptyText="Add a tier to give wholesale buyers a discount. Tier criteria are still open (question 2)."
        />
      </div>

      <!-- One account: the application on file, the tier choice and the decision. -->
      <se-drawer [title]="account()?.user?.name ?? 'Account'" [(open)]="accountOpen">
        @if (account(); as a) {
          <dl seKv>
            <div seKvItem label="Email">{{ a.user.email }}</div>
            <div seKvItem label="Status"><se-status kind="account" [value]="a.status" /></div>
            <div seKvItem label="Business">
              {{ a.businessName || 'One-click application, no details' }}
            </div>
            <div seKvItem label="Buyer type">{{ buyerLabel(a.buyerType) }}</div>
            <div seKvItem label="Location">{{ place(a) || 'Not given' }}</div>
            <div seKvItem label="Phone">{{ a.businessPhone || 'Not given' }}</div>
            <div seKvItem label="Expected volume" numeric>
              {{ a.openingVolume === null ? 'Not given' : a.openingVolume + ' units' }}
            </div>
            <div seKvItem label="Applied">{{ a.createdAt | seDate: 'datetime' }}</div>
            @if (a.reviewedAt) {
              <div seKvItem label="Reviewed">{{ a.reviewedAt | seDate: 'datetime' }}</div>
            }
          </dl>
          @if (canDecide) {
            <form class="se-form">
              <se-field label="Tier" hint="The discount this buyer gets once approved">
                <select seInput [(ngModel)]="tierChoice[a.id]" name="tier">
                  <option value="">No tier</option>
                  @for (tier of tiers(); track tier.id) {
                    <option [value]="tier.id">{{ tierLabel(tier) }}</option>
                  }
                </select>
              </se-field>
            </form>
          }
        }
        <ng-container seDrawerFooter>
          <button seButton type="button" (click)="accountOpen.set(false)">Close</button>
          @if (canDecide && account(); as a) {
            <button seButton variant="danger" type="button" (click)="decide(a, 'rejected')">
              Reject
            </button>
            <button seButton variant="primary" type="button" (click)="decide(a, 'approved')">
              Approve
            </button>
          }
        </ng-container>
      </se-drawer>

      <!-- Add or edit a tier. The discount of an existing tier is approval-gated. -->
      @if (canEditTiers) {
        <se-drawer [title]="tier() ? 'Edit tier ' + tier()!.name : 'Add tier'" [(open)]="tierOpen">
          <form class="se-form" id="tier-form" (ngSubmit)="saveTier()">
            <se-field label="Name" [error]="errors()['name']">
              <input seInput [(ngModel)]="tierForm.name" name="name" />
            </se-field>
            <se-field
              label="Rule"
              optional
              hint="Who qualifies, in words, until question 2 is settled"
            >
              <input seInput [(ngModel)]="tierForm.ruleDescription" name="ruleDescription" />
            </se-field>
            @if (!tier()) {
              <se-field label="Discount percent" [error]="errors()['discountPercent']">
                <input
                  seInput
                  type="number"
                  min="0"
                  max="100"
                  [(ngModel)]="tierForm.discountPercent"
                  name="discountPercent"
                />
              </se-field>
            } @else {
              <se-field
                label="New discount percent"
                optional
                [hint]="
                  tierApprovals[tier()!.id]
                    ? 'Approval ' +
                      tierApprovals[tier()!.id].slice(0, 8) +
                      ' requested. Apply it once Management has approved.'
                    : 'Now ' +
                      tier()!.discountPercent +
                      '%. A change is a price change and needs Management approval.'
                "
                [error]="errors()['discountPercent']"
              >
                <input
                  seInput
                  type="number"
                  min="0"
                  max="100"
                  [(ngModel)]="tierForm.discountPercent"
                  name="discountPercent"
                  [disabled]="!!tierApprovals[tier()!.id]"
                />
              </se-field>
              <div class="se-form__actions">
                @if (!tierApprovals[tier()!.id]) {
                  <button seButton size="sm" type="button" (click)="requestTierApproval(tier()!)">
                    Request discount approval
                  </button>
                } @else {
                  <button seButton size="sm" type="button" (click)="cancelTierApproval(tier()!)">
                    Cancel request
                  </button>
                  <button seButton size="sm" type="button" (click)="applyDiscount(tier()!)">
                    Apply discount
                  </button>
                }
              </div>
            }
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="tierOpen.set(false)">Cancel</button>
            <button seButton variant="primary" type="submit" form="tier-form" [loading]="saving()">
              {{ tier() ? 'Save tier' : 'Add tier' }}
            </button>
          </ng-container>
        </se-drawer>
      }
    </se-page>
  `,
})
export class WholesaleAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly access = inject(AccessService);

  readonly canDecide = this.access.can('wholesale_orders', 'full');
  readonly canEditTiers = this.access.can('catalogue', 'full');
  readonly buyerLabel = buyerLabel;
  readonly place = place;
  readonly tierLabel = tierLabel;

  readonly accounts = signal<AccountRow[]>([]);
  readonly tiers = signal<TierRow[]>([]);
  /** True only until the first answer arrives. */
  readonly loading = signal(true);
  readonly error = signal('');
  readonly tab = signal('accounts');
  readonly tabs = computed(() => [
    {
      id: 'accounts',
      label: 'Accounts',
      count: this.accounts().filter((a) => a.status === 'pending').length,
    },
    { id: 'tiers', label: 'Tiers', count: this.tiers().length },
  ]);

  private readonly urlState = urlFilters(['status']);
  readonly query = this.urlState.query;
  readonly filterValue = this.urlState.value;
  readonly filters: SeFilter[] = [
    {
      key: 'status',
      label: 'Status',
      options: Object.entries(SE_STATUS.account).map(([value, m]) => ({ value, label: m.label })),
    },
  ];
  readonly filtering = computed(
    () => !!this.query().trim() || Object.keys(this.filterValue()).length > 0,
  );
  readonly accountRows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const status = this.filterValue()['status'];
    return this.accounts().filter((a) => {
      if (status && a.status !== status) return false;
      if (!q) return true;
      return [a.user.name, a.user.email, a.businessName ?? '', a.tier?.name ?? ''].some((v) =>
        v.toLowerCase().includes(q),
      );
    });
  });
  readonly accountSummary = computed(() => {
    const n = this.accountRows().length;
    return `${n} ${n === 1 ? 'account' : 'accounts'}`;
  });

  readonly accountColumns: SeColumn<AccountRow>[] = [
    { key: 'name', header: 'Applicant', sortable: true, value: (a) => a.user.name },
    {
      key: 'business',
      header: 'Business',
      value: (a) => a.businessName || 'One-click application',
    },
    { key: 'createdAt', header: 'Applied', sortable: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'tier', header: 'Tier', value: (a) => a.tier?.name ?? 'None' },
  ];
  readonly accountActions: SeRowAction<AccountRow>[] = this.canDecide
    ? [
        {
          label: 'Approve',
          hidden: (a) => a.status !== 'pending',
          run: (a) => void this.decide(a, 'approved'),
        },
        {
          label: 'Reject',
          danger: true,
          hidden: (a) => a.status !== 'pending',
          run: (a) => void this.decide(a, 'rejected'),
        },
      ]
    : [];

  readonly tierColumns: SeColumn<TierRow>[] = [
    { key: 'name', header: 'Tier', sortable: true },
    {
      key: 'discountPercent',
      header: 'Discount',
      numeric: true,
      sortable: true,
      format: (v) => `${v}%`,
    },
    { key: 'ruleDescription', header: 'Rule', value: (t) => t.ruleDescription || 'Not set' },
    {
      key: 'accounts',
      header: 'Accounts',
      numeric: true,
      value: (t) => this.accounts().filter((a) => a.tier?.id === t.id).length,
    },
  ];
  readonly tierActions: SeRowAction<TierRow>[] = this.canEditTiers
    ? [
        { label: 'Edit', run: (t) => this.openEditTier(t) },
        { label: 'Delete', danger: true, run: (t) => void this.deleteTier(t) },
      ]
    : [];

  // ---- drawers ----
  readonly accountOpen = signal(false);
  readonly account = signal<AccountRow | null>(null);
  tierChoice: Record<string, string> = {};
  readonly tierOpen = signal(false);
  readonly tier = signal<TierRow | null>(null);
  readonly saving = signal(false);
  readonly errors = signal<Record<string, string>>({});
  tierForm = EMPTY_TIER();
  /** Pending price-change approvals, by tier, until applied or cancelled. */
  tierApprovals: Record<string, string> = {};

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.wholesaleAccounts().subscribe({
      next: (res) => {
        const rows = res as unknown as AccountRow[];
        this.accounts.set(rows);
        for (const a of rows) if (a.tier) this.tierChoice[a.id] ??= a.tier.id;
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (this.accounts().length === 0) {
          this.error.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
    this.api.tiers().subscribe({
      next: (res) => this.tiers.set(res as unknown as TierRow[]),
      error: () => undefined,
    });
  }

  private fail(err: { error?: { message?: string } }, fallback: string, retry: () => void): void {
    this.toast.show(err?.error?.message ?? fallback, {
      tone: 'danger',
      action: { label: 'Try again', run: retry },
    });
  }

  // ---- accounts ----
  /** Opens the drawer with the row, then reads the full record back (GET /wholesale/accounts/:id). */
  openAccount(row: AccountRow): void {
    this.account.set(row);
    this.accountOpen.set(true);
    this.api.wholesaleAccount(row.id).subscribe({
      next: (a) => this.account.set({ ...row, ...(a as unknown as AccountRow) }),
      error: () => undefined,
    });
  }

  async decide(a: AccountRow, status: 'approved' | 'rejected'): Promise<void> {
    const tier = this.tiers().find((t) => t.id === this.tierChoice[a.id]);
    const who = a.businessName || a.user.name;
    let ok: boolean;
    if (status === 'approved') {
      ok = await this.confirm.ask({
        title: `Approve ${who} as a wholesale buyer?`,
        consequence: `${a.user.name} can sign in to the wholesale portal and order at ${tier ? tierLabel(tier) : 'no tier discount'}, with the 20-unit minimum. The decision is audited and can be reversed by rejecting the account later.`,
        confirmLabel: 'Approve account',
      });
    } else {
      const reason = await this.confirm.askWithReason({
        title: `Reject ${who}?`,
        consequence:
          'The applicant cannot order wholesale. The decision is audited; they may apply again.',
        confirmLabel: 'Reject account',
        danger: true,
        reasonLabel: 'Reason for rejecting',
      });
      ok = reason !== null;
    }
    if (!ok) return;
    // The body is what the API checks; the reason is for the person deciding.
    this.api
      .reviewWholesaleAccount(a.id, { status, tierId: this.tierChoice[a.id] || undefined })
      .subscribe({
        next: () => {
          this.toast.show(`${who} ${status}`);
          this.accountOpen.set(false);
          this.load();
        },
        error: (err) =>
          this.fail(err, `${who} could not be ${status}`, () => void this.decide(a, status)),
      });
  }

  // ---- tiers ----
  openAddTier(): void {
    this.tier.set(null);
    this.tierForm = EMPTY_TIER();
    this.errors.set({});
    this.tierOpen.set(true);
  }

  openEditTier(t: TierRow): void {
    this.tier.set(t);
    this.tierForm = {
      name: t.name,
      discountPercent: null,
      ruleDescription: t.ruleDescription ?? '',
    };
    this.errors.set({});
    this.tierOpen.set(true);
  }

  /** Name and rule are saved at once; a new tier's discount too, since it is not yet a price. */
  saveTier(): void {
    const name = this.tierForm.name.trim();
    const rule = this.tierForm.ruleDescription.trim();
    const errors: Record<string, string> = {};
    if (!name) errors['name'] = 'Give the tier a name.';
    const t = this.tier();
    if (
      !t &&
      (this.tierForm.discountPercent === null ||
        this.tierForm.discountPercent < 0 ||
        this.tierForm.discountPercent > 100)
    ) {
      errors['discountPercent'] = 'A discount is between 0 and 100 percent.';
    }
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) return;
    this.saving.set(true);
    const req = t
      ? this.api.updateTier(t.id, { name, ruleDescription: rule || undefined })
      : this.api.createTier({
          name,
          discountPercent: Number(this.tierForm.discountPercent),
          ruleDescription: rule || undefined,
        });
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.tierOpen.set(false);
        this.toast.show(t ? `Tier ${name} saved` : `Tier ${name} added`);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.errors.set({ name: err?.error?.message ?? 'The tier could not be saved.' });
      },
    });
  }

  /** Asking for approval changes nothing yet, so no dialog. */
  requestTierApproval(t: TierRow): void {
    const to = this.tierForm.discountPercent;
    if (to === null) {
      this.errors.set({ discountPercent: 'Enter the new discount first.' });
      return;
    }
    this.errors.set({});
    this.api
      .createApproval('price_change', { tier: t.name, from: t.discountPercent, to })
      .subscribe({
        next: (r) => {
          this.tierApprovals = { ...this.tierApprovals, [t.id]: r.id };
          this.toast.show('Approval requested. Management decides in the approvals queue.');
        },
        error: (err) =>
          this.errors.set({
            discountPercent: err?.error?.message ?? 'The approval could not be requested.',
          }),
      });
  }

  async applyDiscount(t: TierRow): Promise<void> {
    const to = Number(this.tierForm.discountPercent);
    const ok = await this.confirm.ask({
      title: `Change ${t.name} from ${t.discountPercent}% to ${to}%?`,
      consequence:
        'Every wholesale buyer on this tier pays the new price from their next order. This is a price change: it is applied against the approval and audited. Changing it back needs another approval.',
      confirmLabel: 'Apply discount',
    });
    if (!ok) return;
    this.api
      .updateTier(t.id, { discountPercent: to, approvalRequestId: this.tierApprovals[t.id] })
      .subscribe({
        next: () => {
          const { [t.id]: _, ...rest } = this.tierApprovals;
          this.tierApprovals = rest;
          this.tierOpen.set(false);
          this.toast.show(`Tier ${t.name} is now ${to}% off`);
          this.load();
        },
        error: (err) =>
          this.errors.set({
            discountPercent: err?.error?.message ?? 'Not approved yet. Check the approvals queue.',
          }),
      });
  }

  /** Drops the pending request locally; the tier's discount stays unchanged. */
  cancelTierApproval(t: TierRow): void {
    const { [t.id]: _, ...rest } = this.tierApprovals;
    this.tierApprovals = rest;
    this.toast.show(`Request for ${t.name} cancelled. The tier is unchanged.`);
  }

  async deleteTier(t: TierRow): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete tier ${t.name}?`,
      consequence: `The ${t.discountPercent}% tier is removed for good. It cannot be deleted while wholesale accounts still use it.`,
      confirmLabel: 'Delete tier',
      danger: true,
    });
    if (!ok) return;
    this.api.deleteTier(t.id).subscribe({
      next: () => {
        this.toast.show(`Tier ${t.name} deleted`);
        this.load();
      },
      error: (err) =>
        this.fail(err, `Tier ${t.name} could not be deleted`, () => void this.deleteTier(t)),
    });
  }
}
