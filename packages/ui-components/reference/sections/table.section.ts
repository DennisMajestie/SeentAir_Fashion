import { Component, computed, inject, signal } from '@angular/core';
import {
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeCurrencyService,
  SeRowAction,
  SeRowId,
  SeSearchComponent,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';

interface OrderRow {
  id: string;
  ref: string;
  customer: string;
  placed: string;
  items: number;
  total: number;
  status: string;
  payment: string;
}

const CUSTOMERS = ['Adaeze O.', 'Chinedu A.', 'Ngozi E.', 'Tunde B.', 'Amaka I.', 'Emeka U.', 'Halima S.'];
const STATUSES = ['order_received', 'processing', 'shipped', 'delivered', 'awaiting_payment', 'stock_exception'];
const ORDERS: OrderRow[] = Array.from({ length: 37 }, (_, i) => {
  const status = STATUSES[i % STATUSES.length];
  return {
    id: `o${i + 1}`,
    ref: `SE-${(48210 + i * 7).toString()}`,
    customer: CUSTOMERS[i % CUSTOMERS.length],
    placed: `2026-10-${String(1 + (i % 6)).padStart(2, '0')}`,
    items: 1 + ((i * 3) % 7),
    total: 5000 + ((i * 7919) % 92) * 1500,
    status,
    payment: status === 'awaiting_payment' ? 'unpaid' : i % 11 === 0 ? 'refunded' : 'paid',
  };
});

@Component({
  selector: 'ref-table',
  imports: [
    SeButtonDirective,
    SeCellDirective,
    SeSearchComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <p class="ref-lede">
      The one table for every list screen. Sortable columns, right-aligned figures, selection, row
      actions, paging, a density toggle, and its own loading, empty and error states. Sort a
      column, select rows, open one, change the density.
    </p>
    <div class="ref-row">
      <span class="ref-tag">state</span>
      @for (s of states; track s) {
        <button seButton size="sm" [attr.aria-pressed]="state() === s" (click)="state.set(s)">
          {{ s }}
        </button>
      }
    </div>
    <div class="ref-row"></div>
    <se-table
      caption="Orders"
      [columns]="columns"
      [rows]="rows()"
      [loading]="state() === 'loading'"
      [error]="state() === 'error' ? 'The server did not respond. Nothing has been changed.' : ''"
      (retry)="state.set('data')"
      selectable
      [(selection)]="selected"
      [pageSize]="10"
      [actions]="actions"
      activatable
      (rowActivate)="toast.show('Opened ' + $event.ref)"
      maxHeight="26rem"
      [emptyHeading]="query() ? 'No orders match that search' : 'No orders yet'"
      [emptyText]="
        query()
          ? 'Check the spelling, or clear the search to see every order.'
          : 'Orders appear here as soon as a customer checks out.'
      "
      [emptyActionLabel]="query() ? 'Clear search' : ''"
      (emptyAction)="query.set('')"
    >
      <se-search
        seTableToolbar
        label="Search orders"
        placeholder="Order ref or customer"
        [(value)]="query"
      />
      <button seButton size="sm" seTableBulk (click)="toast.show(selected().length + ' orders marked as shipped')">
        Mark as shipped
      </button>
      <ng-template seCell="status" let-row>
        <se-status kind="order" [value]="row.status" />
      </ng-template>
      <ng-template seCell="payment" let-row>
        <se-status kind="payment" [value]="row.payment" />
      </ng-template>
    </se-table>
    <p class="ref-dont">
      <b>Not for:</b> two or three key/value pairs (use a detail list), or a layout grid. Do not
      build another table for one screen: if this one is missing something, it gains it for
      everyone. Keep row actions to two; anything more belongs on the detail page.
    </p>
  `,
})
export class TableSection {
  readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);

  readonly states = ['data', 'loading', 'empty', 'error'] as const;
  readonly state = signal<(typeof this.states)[number]>('data');
  readonly query = signal('');
  readonly selected = signal<readonly SeRowId[]>([]);

  readonly rows = computed(() => {
    if (this.state() === 'empty') return [];
    const q = this.query().trim().toLowerCase();
    return q
      ? ORDERS.filter((o) => o.ref.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q))
      : ORDERS;
  });

  readonly columns: SeColumn<OrderRow>[] = [
    { key: 'ref', header: 'Order', sortable: true },
    { key: 'customer', header: 'Customer', sortable: true },
    { key: 'placed', header: 'Placed', sortable: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'payment', header: 'Payment' },
    { key: 'items', header: 'Items', numeric: true, sortable: true },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      sortable: true,
      format: (v) => this.currency.format(v as number),
    },
  ];
  readonly actions: SeRowAction<OrderRow>[] = [
    { label: 'Print invoice', icon: 'download', run: (o) => this.toast.show(`Invoice for ${o.ref} sent to print`) },
    {
      label: 'Refund',
      icon: 'trash',
      danger: true,
      disabled: (o) => o.payment !== 'paid',
      run: (o) => this.toast.show(`Refund started for ${o.ref}`),
    },
  ];
}
