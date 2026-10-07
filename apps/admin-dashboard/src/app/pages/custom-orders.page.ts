import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SeBadgeComponent,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDatePipe,
  formatDate,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilter,
  SeFilterBarComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMoneyPipe,
  SePageComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { urlFilters } from '../url-filters';
import { CUSTOM_STATUS_OPTIONS, countOf, customNext, customState, shortRef } from './ops-format';

export interface CustomRow {
  id: string;
  status: string;
  sizes: string;
  colours: string;
  quantity: number;
  location: string;
  fabricQuality: string;
  description: string;
  desiredDate: string;
  buyer: { name: string; email: string };
  paidAt: string | null;
  productName?: string;
}

/**
 * Custom orders: bespoke requests from submission to delivery. Full production
 * only starts after the buyer approves the sample, which the API enforces; the
 * buyer decides in their own portal.
 */
@Component({
  selector: 'app-custom-admin',
  imports: [
    FormsModule,
    SeBadgeComponent,
    SeButtonDirective,
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
    SeTableComponent,
  ],
  template: `
    <se-page
      title="Custom orders"
      description="Full production starts only after the buyer approves the sample."
    >
      <se-table
        caption="Custom orders"
        [columns]="columns"
        [rows]="rows()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [pageSize]="25"
        activatable
        (rowActivate)="open($event)"
        [emptyHeading]="filtering() ? 'No requests match these filters' : 'No custom requests yet'"
        [emptyText]="
          filtering()
            ? 'Remove a filter, or clear them all.'
            : 'Bespoke requests from customers appear here.'
        "
        [emptyActionLabel]="filtering() ? 'Clear all filters' : ''"
        (emptyAction)="clearFilters()"
      >
        <se-filter-bar
          seTableToolbar
          searchLabel="Search custom orders"
          searchPlaceholder="Buyer, product or ref"
          [(query)]="query"
          [filters]="filters"
          [(value)]="filterValue"
          [summary]="summary()"
        />
        <ng-template seCell="status" let-row>
          <se-badge [tone]="state(row.status).tone">{{ state(row.status).label }}</se-badge>
        </ng-template>
      </se-table>

      <se-drawer [title]="drawerTitle()" [open]="!!selected()" (openChange)="$event || close()">
        @if (selected(); as r) {
          <dl seKv>
            <div seKvItem label="Status">
              <se-badge [tone]="state(r.status).tone">{{ state(r.status).label }}</se-badge>
            </div>
            <div seKvItem label="Buyer">{{ r.buyer.name }} ({{ r.buyer.email }})</div>
            <div seKvItem label="Quantity" numeric>{{ r.quantity }}</div>
            <div seKvItem label="Sizes and colours">{{ r.sizes }} · {{ r.colours }}</div>
            <div seKvItem label="Fabric">{{ r.fabricQuality }}</div>
            <div seKvItem label="Wanted by">{{ r.desiredDate | seDate }}</div>
            <div seKvItem label="Deliver to">{{ r.location }}</div>
            <div seKvItem label="Request">{{ r.description }}</div>
            @if (quotation(); as q) {
              <div seKvItem label="Quotation" numeric>{{ num(q['amount']) | seMoney: 2 }}</div>
            } @else {
              <div seKvItem label="Quotation">None issued yet</div>
            }
            @if (r.status === 'sample_in_production') {
              <div seKvItem label="Waiting on">The buyer's decision on the sample</div>
            }
          </dl>
          @if (canQuote && (r.status === 'submitted' || r.status === 'under_review')) {
            <form class="se-form" (ngSubmit)="quote()">
              <se-field
                label="Quotation amount"
                hint="The full price for the whole order"
                [error]="amountError()"
              >
                <input seInput type="number" min="1" name="quote" [(ngModel)]="amount" />
              </se-field>
            </form>
          }
          @if (canAdvance && r.status === 'quote_accepted') {
            <form class="se-form" (ngSubmit)="recordPayment()">
              <se-field label="Payment method">
                <select seInput name="method" [(ngModel)]="method">
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="pos">POS</option>
                </select>
              </se-field>
              <se-field
                label="Amount paid"
                hint="Must equal the quotation; no part payments"
                [error]="amountError()"
              >
                <input seInput type="number" min="1" name="paid" [(ngModel)]="amount" />
              </se-field>
            </form>
          }
        }
        <ng-container seDrawerFooter>
          <button seButton type="button" (click)="close()">Close</button>
          @if (selected(); as r) {
            @if (canQuote && (r.status === 'submitted' || r.status === 'under_review')) {
              <button
                seButton
                variant="primary"
                type="button"
                [loading]="saving()"
                (click)="quote()"
              >
                Issue quotation
              </button>
            }
            @if (canAdvance && r.status === 'quote_accepted') {
              <button
                seButton
                variant="primary"
                type="button"
                [loading]="saving()"
                (click)="recordPayment()"
              >
                Record payment
              </button>
            }
            @if (canAdvance && next(r.status); as n) {
              <button
                seButton
                [variant]="r.status === 'submitted' ? 'secondary' : 'primary'"
                type="button"
                [loading]="saving()"
                (click)="advance(r, n.status)"
              >
                {{ n.label }}
              </button>
            }
          }
        </ng-container>
      </se-drawer>
    </se-page>
  `,
})
export class CustomAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);

  /** POST :id/quotation needs approve; PATCH :id/status (and recording payment) need full. */
  readonly canQuote = this.access.can('custom_orders', 'approve');
  readonly canAdvance = this.access.can('custom_orders', 'full');

  readonly requests = signal<CustomRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly selected = signal<CustomRow | null>(null);
  readonly quotation = signal<Record<string, unknown> | null>(null);
  readonly saving = signal(false);
  readonly amountError = signal('');
  amount: number | null = null;
  method = 'bank_transfer';

  private readonly urlState = urlFilters(['status']);
  readonly query = this.urlState.query;
  readonly filterValue = this.urlState.value;
  readonly filters: SeFilter[] = [
    { key: 'status', label: 'Status', options: CUSTOM_STATUS_OPTIONS },
  ];
  readonly filtering = computed(
    () => !!this.query().trim() || Object.keys(this.filterValue()).length > 0,
  );
  readonly rows = computed(() => {
    const status = this.filterValue()['status'];
    const q = this.query().trim().toLowerCase();
    return this.requests().filter((r) => {
      if (status && r.status !== status) return false;
      if (!q) return true;
      return [
        r.id,
        r.buyer.name,
        r.buyer.email,
        r.productName ?? '',
        this.state(r.status).label,
      ].some((v) => v.toLowerCase().includes(q));
    });
  });
  readonly summary = computed(() => countOf(this.rows().length, 'request'));
  readonly drawerTitle = computed(() => {
    const r = this.selected();
    return r ? `Custom order ${shortRef('CO', r.id)}` : 'Custom order';
  });

  readonly columns: SeColumn<CustomRow>[] = [
    { key: 'ref', header: 'Request', value: (r) => shortRef('CO', r.id) },
    { key: 'buyer', header: 'Buyer', sortable: true, value: (r) => r.buyer.name },
    { key: 'product', header: 'Product', value: (r) => r.productName ?? r.fabricQuality },
    { key: 'quantity', header: 'Units', numeric: true, sortable: true, value: (r) => r.quantity },
    {
      key: 'due',
      header: 'Wanted by',
      sortable: true,
      value: (r) => r.desiredDate,
      format: (v) => formatDate(v as string),
    },
    { key: 'status', header: 'Status', sortable: true, value: (r) => r.status },
  ];

  readonly state = customState;
  readonly next = customNext;
  num = (v: unknown): number => Number(v ?? 0);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.customOrders().subscribe({
      next: (res) => {
        const rows = res.data as unknown as CustomRow[];
        this.requests.set(rows);
        this.loading.set(false);
        this.error.set('');
        const open = this.selected();
        if (open) this.selected.set(rows.find((r) => r.id === open.id) ?? null);
      },
      error: (err) => {
        this.loading.set(false);
        if (this.requests().length === 0) {
          this.error.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
  }

  open(r: CustomRow): void {
    this.amount = null;
    this.amountError.set('');
    this.quotation.set(null);
    this.selected.set(r);
    this.api.customQuotation(r.id).subscribe({
      next: (q) => this.quotation.set(q),
      error: () => this.quotation.set(null), // none issued yet
    });
  }
  close(): void {
    this.selected.set(null);
  }
  clearFilters(): void {
    this.query.set('');
    this.filterValue.set({});
  }

  private fail(message: string, retry: () => void): void {
    this.saving.set(false);
    this.toast.show(message, { tone: 'danger', action: { label: 'Try again', run: retry } });
  }

  async quote(): Promise<void> {
    const r = this.selected();
    if (!r || !this.canQuote) return;
    if (!this.amount || this.amount <= 0) {
      this.amountError.set('Enter the full price for the order.');
      return;
    }
    this.amountError.set('');
    const amount = Number(this.amount);
    const ok = await this.confirm.ask({
      title: `Issue a quotation of ${this.currency.format(amount, 2)} to ${r.buyer.name}?`,
      consequence:
        'The buyer sees the price in their portal and can accept it. A quotation cannot be withdrawn once issued.',
      confirmLabel: 'Issue quotation',
    });
    if (!ok) return;
    this.saving.set(true);
    this.api.issueQuotation(r.id, amount).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.show('Quotation issued');
        this.open(r);
        this.load();
      },
      error: (err) =>
        this.fail(
          err?.error?.message ?? 'The quotation could not be issued',
          () => void this.quote(),
        ),
    });
  }

  async recordPayment(): Promise<void> {
    const r = this.selected();
    if (!r || !this.canAdvance) return;
    if (!this.amount || this.amount <= 0) {
      this.amountError.set('Enter the amount the buyer paid.');
      return;
    }
    this.amountError.set('');
    const amount = Number(this.amount);
    const ok = await this.confirm.ask({
      title: `Record a payment of ${this.currency.format(amount, 2)} from ${r.buyer.name}?`,
      consequence:
        'The payment is written to the ledger and the request moves to paid, so sample production can start. This is audited and cannot be undone.',
      confirmLabel: 'Record payment',
    });
    if (!ok) return;
    this.saving.set(true);
    this.api.recordCustomPayment(r.id, this.method, amount).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.show('Payment recorded');
        this.load();
      },
      error: (err) =>
        this.fail(
          err?.error?.message ?? 'The payment could not be recorded',
          () => void this.recordPayment(),
        ),
    });
  }

  async advance(r: CustomRow, status: string): Promise<void> {
    const step = customNext(r.status);
    if (!step || step.status !== status || !this.canAdvance) return;
    const ok = await this.confirm.ask({
      title: `${step.label} for ${shortRef('CO', r.id)}?`,
      consequence: `${step.consequence} A request cannot be moved back to an earlier status.`,
      confirmLabel: step.label,
    });
    if (!ok) return;
    this.saving.set(true);
    this.api.updateCustomStatus(r.id, status).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.show(
          `${shortRef('CO', r.id)} is now ${customState(status).label.toLowerCase()}`,
        );
        this.load();
      },
      error: (err) =>
        this.fail(
          err?.error?.message ?? 'The status could not be changed',
          () => void this.advance(r, status),
        ),
    });
  }
}
