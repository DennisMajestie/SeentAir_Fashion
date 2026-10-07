import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDatePipe,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilter,
  SeFilterBarComponent,
  SeInputDirective,
  SeMetricCardComponent,
  SePageComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { downloadCsv } from '../csv.util';
import { orderRef } from './order-format';
import { urlFilters } from '../url-filters';

interface LedgerRow {
  id: string;
  type: string;
  amount: number;
  category: string | null;
  referenceId: string | null;
  entryDate: string;
}

const ENTRY_TYPES = ['sale', 'purchase', 'expense', 'payroll', 'tax', 'investment'];
const MANUAL_TYPES = ['expense', 'payroll', 'tax', 'investment'];
const typeLabel = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
/** Categories are typed by staff and seeded with underscores: "partner_investment". */
export const categoryLabel = (c: string | null): string =>
  c ? typeLabel(c.replaceAll('_', ' ')) : '';

/** The report figures the API serves. Profit and loss are one net figure
    shown as one card: a minus means a loss. */
const REPORTS: Array<{ name: string; key: string }> = [
  { name: 'income', key: 'total' },
  { name: 'expenditure', key: 'total' },
  { name: 'investment', key: 'total' },
  { name: 'profit', key: 'profit' },
  { name: 'loss', key: 'loss' },
];
const CARDS: Array<{ name: string; label: string; hint: string }> = [
  { name: 'income', label: 'Income', hint: 'All time' },
  { name: 'expenditure', label: 'Expenditure', hint: 'All time' },
  { name: 'investment', label: 'Investment', hint: 'All time' },
  { name: 'net', label: 'Net profit', hint: 'All time; a minus is a loss' },
];

const EMPTY_ENTRY = () => ({
  type: 'expense',
  amount: null as number | null,
  category: '',
  approvalRequestId: '',
});

/**
 * Accounting: the ledger and the profit report. Sales and purchases write
 * themselves; a manual entry is a fund movement, so it is approval-gated: the
 * entry is drafted, an approval requested, and only once Management has
 * decided in the queue can the entry be recorded against that approval.
 */
@Component({
  selector: 'app-accounting-admin',
  imports: [
    FormsModule,
    SeButtonDirective,
    SeCellDirective,
    SeDatePipe,
    SeDrawerComponent,
    SeFieldComponent,
    SeFilterBarComponent,
    SeInputDirective,
    SeMetricCardComponent,
    SePageComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Accounting">
      <ng-container sePageActions>
        <button seButton type="button" (click)="exportCsv()">Export CSV</button>
        @if (canWrite) {
          <button seButton variant="primary" type="button" (click)="openEntry()">
            Record entry
          </button>
        }
      </ng-container>

      <div class="se-metric-grid">
        @for (c of cards; track c.name) {
          <se-metric-card
            [label]="c.label"
            [value]="currency.format(figures()[c.name] || 0)"
            [hint]="c.hint"
          />
        }
      </div>

      <se-table
        caption="Ledger"
        [columns]="columns"
        [rows]="rows()"
        [loading]="loading()"
        [error]="error()"
        (retry)="loadLedger()"
        [pageSize]="25"
        [emptyHeading]="filterValue()['type'] ? 'No entries of this type' : 'No entries yet'"
        emptyText="Sales and purchases write themselves; other movements are recorded here."
      >
        <se-filter-bar
          seTableToolbar
          searchLabel=""
          [filters]="filters"
          [(value)]="filterValue"
          [summary]="summary()"
        />
        <ng-template seCell="entryDate" let-row>{{ row.entryDate | seDate }}</ng-template>
      </se-table>

      @if (canWrite) {
        <se-drawer title="Record entry" [(open)]="recording">
          <form class="se-form" id="entry-form" (ngSubmit)="record()">
            <se-field label="Type">
              <select
                seInput
                [(ngModel)]="entry.type"
                name="type"
                [disabled]="!!entry.approvalRequestId"
              >
                @for (t of manualTypes; track t) {
                  <option [value]="t">{{ typeLabel(t) }}</option>
                }
              </select>
            </se-field>
            <se-field label="Amount" [error]="errors()['amount']">
              <input
                seInput
                type="number"
                min="1"
                [(ngModel)]="entry.amount"
                name="amount"
                [disabled]="!!entry.approvalRequestId"
              />
            </se-field>
            <se-field
              label="Category"
              hint="For example: September payroll"
              [error]="errors()['category']"
            >
              <input
                seInput
                [(ngModel)]="entry.category"
                name="category"
                [disabled]="!!entry.approvalRequestId"
              />
            </se-field>
            <se-field
              label="Approval"
              [hint]="
                entry.approvalRequestId
                  ? 'Requested. Management decides in the approvals queue; record the entry once it is approved.'
                  : 'A fund movement needs Management approval before it is recorded.'
              "
              [error]="errors()['approval']"
            >
              <input
                seInput
                readonly
                [value]="
                  entry.approvalRequestId
                    ? 'Request ' + entry.approvalRequestId.slice(0, 8)
                    : 'Not requested yet'
                "
                name="approval"
              />
            </se-field>
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="recording.set(false)">Cancel</button>
            @if (!entry.approvalRequestId) {
              <button
                seButton
                variant="primary"
                type="button"
                [loading]="saving()"
                (click)="requestApproval()"
              >
                Request approval
              </button>
            } @else {
              <button
                seButton
                variant="primary"
                type="submit"
                form="entry-form"
                [loading]="saving()"
              >
                Record entry
              </button>
            }
          </ng-container>
        </se-drawer>
      }
    </se-page>
  `,
})
export class AccountingAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(SeToastService);
  private readonly confirm = inject(SeConfirmService);
  private readonly access = inject(AccessService);
  readonly currency = inject(SeCurrencyService);

  readonly canWrite = this.access.can('accounting', 'full');
  readonly cards = CARDS;
  readonly figures = computed<Record<string, number>>(() => {
    const v = this.reportValues();
    return { ...v, net: (v['profit'] || 0) - (v['loss'] || 0) };
  });
  readonly reportValues = signal<Record<string, number>>({});
  readonly rows = signal<LedgerRow[]>([]);
  /** True only until the first answer arrives. */
  readonly loading = signal(true);
  readonly error = signal('');

  // ---- filter: held here, mirrored in the URL; the API filters by type ----
  private readonly urlState = urlFilters(['type']);
  readonly filterValue = this.urlState.value;
  readonly filters: SeFilter[] = [
    {
      key: 'type',
      label: 'Type',
      options: ENTRY_TYPES.map((t) => ({ value: t, label: typeLabel(t) })),
    },
  ];
  readonly summary = computed(() => {
    const n = this.rows().length;
    return `${n} ${n === 1 ? 'entry' : 'entries'}`;
  });
  private lastType = this.filterValue()['type'] ?? '';

  readonly columns: SeColumn<LedgerRow>[] = [
    { key: 'entryDate', header: 'Date', sortable: true },
    { key: 'type', header: 'Type', sortable: true, value: (e) => typeLabel(e.type) },
    { key: 'category', header: 'Category', value: (e) => categoryLabel(e.category) },
    {
      key: 'referenceId',
      header: 'Reference',
      value: (e) => (e.referenceId ? orderRef(e.referenceId) : ''),
    },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      sortable: true,
      value: (e) => Number(e.amount) || 0,
      format: (v) => this.currency.format(v as number),
    },
  ];

  readonly recording = signal(false);
  readonly saving = signal(false);
  readonly errors = signal<Record<string, string>>({});
  readonly manualTypes = MANUAL_TYPES;
  readonly typeLabel = typeLabel;
  entry = EMPTY_ENTRY();

  constructor() {
    effect(() => {
      const type = this.filterValue()['type'] ?? '';
      untracked(() => {
        if (type !== this.lastType) {
          this.lastType = type;
          this.loadLedger();
        }
      });
    });
  }

  ngOnInit(): void {
    this.loadReports();
    this.loadLedger();
  }

  private loadReports(): void {
    for (const r of REPORTS) {
      this.api.report(r.name).subscribe({
        next: (res) =>
          this.reportValues.update((v) => ({ ...v, [r.name]: Number(res[r.key] ?? 0) })),
        error: () => undefined,
      });
    }
  }

  loadLedger(): void {
    this.api.ledger(this.lastType || undefined).subscribe({
      next: (res) => {
        this.rows.set(res.data as unknown as LedgerRow[]);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (this.rows().length === 0) {
          this.error.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
  }

  exportCsv(): void {
    const rows = this.rows().map((e) => ({
      Date: e.entryDate,
      Type: e.type,
      Category: e.category ?? '',
      Amount_NGN: e.amount,
      Ref: e.referenceId ?? '',
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`ledger-${this.lastType || 'all'}-${stamp}.csv`, rows);
  }

  openEntry(): void {
    this.entry = EMPTY_ENTRY();
    this.errors.set({});
    this.recording.set(true);
  }

  private validate(): boolean {
    const errors: Record<string, string> = {};
    if (!this.entry.amount || this.entry.amount <= 0) errors['amount'] = 'Enter the amount moved.';
    if (!this.entry.category.trim()) errors['category'] = 'Say what the movement is for.';
    this.errors.set(errors);
    return Object.keys(errors).length === 0;
  }

  /** Asking for approval changes nothing yet, so no dialog. */
  requestApproval(): void {
    if (!this.validate()) return;
    this.saving.set(true);
    this.api
      .createApproval('fund_movement', {
        type: this.entry.type,
        amount: this.entry.amount,
        category: this.entry.category,
      })
      .subscribe({
        next: (r) => {
          this.saving.set(false);
          this.entry.approvalRequestId = r.id;
          this.toast.show('Approval requested. Management decides in the approvals queue.');
        },
        error: (err) => {
          this.saving.set(false);
          this.errors.set({
            approval: err?.error?.message ?? 'The approval could not be requested.',
          });
        },
      });
  }

  /** Recording moves money on the books, so it is confirmed. */
  async record(): Promise<void> {
    if (!this.validate()) return;
    const amount = this.currency.format(Number(this.entry.amount));
    const ok = await this.confirm.ask({
      title: `Record ${typeLabel(this.entry.type).toLowerCase()} of ${amount}?`,
      consequence: `The entry is written to the ledger against approval ${this.entry.approvalRequestId.slice(0, 8)} and changes the profit report. It is audited and cannot be deleted; a mistake is corrected with another entry.`,
      confirmLabel: 'Record entry',
    });
    if (!ok) return;
    this.saving.set(true);
    this.api
      .recordLedgerEntry({
        type: this.entry.type,
        amount: Number(this.entry.amount),
        category: this.entry.category,
        approvalRequestId: this.entry.approvalRequestId,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.recording.set(false);
          this.toast.show(`${typeLabel(this.entry.type)} of ${amount} recorded`);
          this.loadReports();
          this.loadLedger();
        },
        error: (err) => {
          this.saving.set(false);
          this.errors.set({
            approval:
              err?.error?.message ?? 'Not approved yet. Check the approvals queue and try again.',
          });
        },
      });
  }
}
