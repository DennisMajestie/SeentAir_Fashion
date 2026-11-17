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
import { ApiService, PayrollRun } from '../api.service';
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

/** '2026-10' -> 'Oct 2026' — built locally so tests stay locale-stable. */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export const monthLabel = (period: string): string => {
  const [year, month] = period.split('-').map(Number);
  return MONTHS[month - 1] ? `${MONTHS[month - 1]} ${year}` : period;
};

const EMPTY_PAYROLL = () => ({
  periodMonth: '',
  approvalRequestId: '',
  lines: [{ name: '', amount: null as number | null }],
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

      <se-table
        caption="Payroll runs"
        [columns]="payrollColumns"
        [rows]="payrollRows()"
        [loading]="payrollLoading()"
        [error]="payrollError()"
        (retry)="loadPayroll()"
        [pageSize]="10"
        [hideDensity]="true"
        emptyHeading="No payroll runs yet"
        emptyText="Start a run to pay the team for a month; the total posts to the ledger as payroll."
      >
        @if (canWrite) {
          <button
            seButton
            seTableToolbar
            variant="primary"
            type="button"
            (click)="openPayroll()"
          >
            Start payroll
          </button>
        }
        <ng-template seCell="periodMonth" let-row>{{ monthLabel(row.periodMonth) }}</ng-template>
        <ng-template seCell="paid" let-row>{{ names(row) }}</ng-template>
        <ng-template seCell="postedAt" let-row>{{ row.postedAt | seDate }}</ng-template>
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

        <se-drawer title="Start payroll" [(open)]="startingPayroll">
          <form class="se-form" id="payroll-form" (ngSubmit)="startPayroll()">
            <se-field
              label="Month"
              hint="The month being paid, not today's month."
              [error]="payrollErrors()['periodMonth']"
            >
              <input seInput type="month" [(ngModel)]="payroll.periodMonth" name="periodMonth" />
            </se-field>
            <div class="payroll-lines">
              <div class="payroll-lines__head">
                <span>Staff lines</span>
                <button seButton size="sm" type="button" (click)="addLine()">Add line</button>
              </div>
              @if (payrollRows().length > 0) {
                <button seButton variant="ghost" type="button" (click)="copyLastLines()">
                  Copy last run's lines
                </button>
              }
              @for (line of payroll.lines; track $index) {
                <div class="payroll-line">
                  <input
                    seInput
                    placeholder="Staff name"
                    [(ngModel)]="line.name"
                    [name]="'payroll-name-' + $index"
                  />
                  <input
                    seInput
                    type="number"
                    min="1"
                    placeholder="Amount"
                    [(ngModel)]="line.amount"
                    [name]="'payroll-amount-' + $index"
                  />
                  @if (payroll.lines.length > 1) {
                    <button seButton variant="ghost" type="button" (click)="removeLine($index)">
                      Remove
                    </button>
                  }
                </div>
              }
              <p class="payroll-lines__total">Total {{ currency.format(total()) }}</p>
            </div>
            <se-field
              label="Approval"
              [hint]="
                payroll.approvalRequestId
                  ? 'Requested. Management decides in the approvals queue; post the run once it is approved.'
                  : 'Paying staff is a fund movement and needs Management approval first.'
              "
              [error]="payrollErrors()['approval']"
            >
              <input
                seInput
                readonly
                [value]="
                  payroll.approvalRequestId
                    ? 'Request ' + payroll.approvalRequestId.slice(0, 8)
                    : 'Not requested yet'
                "
                name="payrollApproval"
              />
            </se-field>
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="startingPayroll.set(false)">Cancel</button>
            @if (!payroll.approvalRequestId) {
              <button
                seButton
                variant="primary"
                type="button"
                [loading]="payrollSaving()"
                (click)="requestPayrollApproval()"
              >
                Request approval
              </button>
            } @else {
              <button
                seButton
                variant="primary"
                type="submit"
                form="payroll-form"
                [loading]="payrollSaving()"
              >
                Post payroll
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
    this.loadPayroll();
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

  // ---- payroll runs ----
  readonly payrollRows = signal<PayrollRun[]>([]);
  readonly payrollLoading = signal(true);
  readonly payrollError = signal('');
  readonly startingPayroll = signal(false);
  readonly payrollSaving = signal(false);
  readonly payrollErrors = signal<Record<string, string>>({});
  readonly monthLabel = monthLabel;
  readonly names = (row: PayrollRun): string => row.lines.map((l) => l.name).join(', ');
  payroll = EMPTY_PAYROLL();

  readonly payrollColumns: SeColumn<PayrollRun>[] = [
    { key: 'periodMonth', header: 'Month', sortable: true, value: (r) => r.periodMonth },
    { key: 'paid', header: 'Paid' },
    {
      key: 'staff',
      header: 'Staff',
      numeric: true,
      value: (r) => r.lines.length,
    },
    {
      key: 'totalAmount',
      header: 'Total',
      numeric: true,
      sortable: true,
      value: (r) => Number(r.totalAmount) || 0,
      format: (v) => this.currency.format(v as number),
    },
    { key: 'status', header: 'Status', value: (r) => typeLabel(r.status) },
    { key: 'postedAt', header: 'Posted', value: (r) => r.postedAt ?? '' },
  ];

  loadPayroll(): void {
    this.api.payrollRuns().subscribe({
      next: (res) => {
        this.payrollRows.set(res.data);
        this.payrollLoading.set(false);
        this.payrollError.set('');
      },
      error: (err) => {
        this.payrollLoading.set(false);
        // A failed refresh must not wipe a list that is already on screen.
        if (this.payrollRows().length === 0) {
          this.payrollError.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
  }

  readonly total = computed(() =>
    this.payroll.lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0),
  );

  openPayroll(): void {
    this.payroll = EMPTY_PAYROLL();
    this.payrollErrors.set({});
    this.startingPayroll.set(true);
  }

  addLine(): void {
    this.payroll.lines.push({ name: '', amount: null });
  }

  removeLine(index: number): void {
    this.payroll.lines.splice(index, 1);
  }

  /** Last month's lines as the starting point for this month's run. */
  copyLastLines(): void {
    const last = this.payrollRows()[0];
    if (!last) return;
    this.payroll.lines = last.lines.map((l) => ({ name: l.name, amount: l.amount }));
  }

  private validatePayroll(): boolean {
    const errors: Record<string, string> = {};
    if (!/^\d{4}-\d{2}$/.test(this.payroll.periodMonth)) {
      errors['periodMonth'] = 'Pick the month being paid.';
    }
    if (this.payroll.lines.length === 0) {
      errors['periodMonth'] = errors['periodMonth'] ?? 'Add at least one staff line.';
    }
    for (const line of this.payroll.lines) {
      if (!line.name.trim()) errors['periodMonth'] = 'Give every line a staff name.';
      if (!line.amount || Number(line.amount) <= 0) {
        errors['periodMonth'] = 'Give every line an amount.';
      }
    }
    this.payrollErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  /** Asking for approval changes nothing yet, so no dialog. */
  requestPayrollApproval(): void {
    if (!this.validatePayroll()) return;
    this.payrollSaving.set(true);
    this.api
      .createApproval('fund_movement', {
        type: 'payroll',
        amount: this.total(),
        category: `payroll ${this.payroll.periodMonth}`,
        periodMonth: this.payroll.periodMonth,
      })
      .subscribe({
        next: (r) => {
          this.payrollSaving.set(false);
          this.payroll.approvalRequestId = r.id;
          this.toast.show('Approval requested. Management decides in the approvals queue.');
        },
        error: (err) => {
          this.payrollSaving.set(false);
          this.payrollErrors.set({
            approval: err?.error?.message ?? 'The approval could not be requested.',
          });
        },
      });
  }

  /** Posting payroll moves money on the books, so it is confirmed. */
  async startPayroll(): Promise<void> {
    if (!this.validatePayroll()) return;
    const amount = this.currency.format(this.total());
    const ok = await this.confirm.ask({
      title: `Post payroll for ${monthLabel(this.payroll.periodMonth)}?`,
      consequence: `A payroll ledger entry of ${amount} is recorded against approval ${this.payroll.approvalRequestId.slice(0, 8)} and changes the profit report. It is audited and cannot be deleted.`,
      confirmLabel: 'Post payroll',
    });
    if (!ok) return;
    this.payrollSaving.set(true);
    this.api
      .createPayrollRun({
        periodMonth: this.payroll.periodMonth,
        approvalRequestId: this.payroll.approvalRequestId,
        lines: this.payroll.lines.map((l) => ({
          name: l.name.trim(),
          amount: Number(l.amount),
        })),
      })
      .subscribe({
        next: () => {
          this.payrollSaving.set(false);
          this.startingPayroll.set(false);
          this.toast.show(`Payroll for ${monthLabel(this.payroll.periodMonth)} posted`);
          this.loadPayroll();
          this.loadReports();
          this.loadLedger();
        },
        error: (err) => {
          this.payrollSaving.set(false);
          this.payrollErrors.set({
            approval:
              err?.error?.message ?? 'Not approved yet. Check the approvals queue and try again.',
          });
        },
      });
  }
}
