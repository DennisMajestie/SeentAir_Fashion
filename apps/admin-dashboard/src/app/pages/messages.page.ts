import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  SeActivityComponent,
  SeActivityEntry,
  SeBannerComponent,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeCurrencyService,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilterBarComponent,
  SeInputDirective,
  SeMetricCardComponent,
  SePageComponent,
  SeRowAction,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
  formatDate,
  statusMeaning,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { AdminOrder, ApiService } from '../api.service';
import { urlFilters } from '../url-filters';
import { channelLabel, orderRef } from './order-format';

export interface CustomerThread {
  id: string;
  name: string;
  orders: AdminOrder[];
  lifetimeValue: number;
  lastOrderAt: string;
}

/** Canned starters for the composer; text only, there is no macro backend. */
export const MACROS = [
  {
    label: 'Send tracking',
    text: 'Hello! Your order is with the courier; we will share the live tracking link as soon as it is dispatched.',
  },
  {
    label: 'Size exchange',
    text: 'Thanks for reaching out. Size exchanges follow the returns window: request within 12 hours of receipt and we will guide you through the swap.',
  },
  {
    label: 'Payment reminder',
    text: 'Hi! Your order is reserved and awaiting full payment; it ships as soon as payment is confirmed.',
  },
];

/** Groups recent orders by customer account; guest orders have no one to message. */
export function threadsFrom(orders: readonly AdminOrder[]): CustomerThread[] {
  const byCustomer = new Map<string, CustomerThread>();
  for (const o of orders) {
    if (!o.customer) continue;
    const t = byCustomer.get(o.customer.id) ?? {
      id: o.customer.id,
      name: o.customer.name,
      orders: [],
      lifetimeValue: 0,
      lastOrderAt: o.createdAt,
    };
    t.orders.push(o);
    t.lifetimeValue += Number(o.totalAmount) || 0;
    if (new Date(o.createdAt) > new Date(t.lastOrderAt)) t.lastOrderAt = o.createdAt;
    byCustomer.set(o.customer.id, t);
  }
  const list = [...byCustomer.values()];
  const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  for (const t of list) t.orders.sort(newestFirst);
  return list.sort((a, b) => new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime());
}

/**
 * Customer support desk. There is no inbound messaging yet (live chat and
 * WhatsApp are future integrations), so the desk is built on what is real:
 * customers with recent orders, and an order update that goes out as an
 * in-platform notification tied to one of their orders.
 */
@Component({
  selector: 'app-messages',
  imports: [
    FormsModule,
    RouterLink,
    SeActivityComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCellDirective,
    SeDrawerComponent,
    SeFieldComponent,
    SeFilterBarComponent,
    SeInputDirective,
    SeMetricCardComponent,
    SePageComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page
      title="Messages"
      description="Send an order update to a customer. It arrives as an in-app notification on their order; inbound chat and WhatsApp are not connected yet."
    >
      <div class="se-metric-grid">
        <se-metric-card label="Customers" [value]="threads().length" hint="with recent orders" />
        <se-metric-card label="Open orders" [value]="openOrders()" hint="not yet delivered" />
        <se-metric-card
          label="Awaiting payment"
          [value]="unpaidOrders()"
          hint="the most common reason to get in touch"
        />
        <a class="se-metric-link" routerLink="/returns">
          <se-metric-card
            label="Returns requested"
            [value]="returnsPending()"
            hint="handled on the Returns page"
          />
        </a>
      </div>

      <se-table
        caption="Customers"
        [columns]="columns"
        [rows]="rows()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [actions]="actions"
        activatable
        (rowActivate)="open($event)"
        [emptyHeading]="query().trim() ? 'No customers match that search' : 'No customers yet'"
        [emptyText]="
          query().trim()
            ? 'Try another name.'
            : 'Customers with an account and an order appear here so you can reach them.'
        "
      >
        <se-filter-bar
          seTableToolbar
          searchLabel="Search customers"
          searchPlaceholder="Customer name"
          [(query)]="query"
          [summary]="summary()"
        />
        <ng-template seCell="latest" let-row>
          <se-status kind="order" [value]="row.orders[0].status" />
        </ng-template>
      </se-table>

      <se-drawer [title]="selected()?.name ?? 'Customer'" [(open)]="drawerOpen">
        @if (selected(); as t) {
          @if (canSend) {
            <form class="se-form" id="send-update" (ngSubmit)="send(t)">
              <se-field label="Regarding order">
                <select seInput name="orderId" [(ngModel)]="orderId">
                  @for (o of t.orders; track o.id) {
                    <option [value]="o.id">
                      {{ orderRef(o.id) }}, {{ statusLabel(o.status) }}
                    </option>
                  }
                </select>
              </se-field>
              <se-field label="Message" [error]="draftError()">
                <textarea seInput name="draft" rows="4" [(ngModel)]="draft"></textarea>
              </se-field>
              <div class="macros" role="group" aria-label="Starter messages">
                @for (m of macros; track m.label) {
                  <button seButton size="sm" type="button" (click)="applyMacro(m.text)">
                    {{ m.label }}
                  </button>
                }
              </div>
            </form>
          } @else {
            <se-banner tone="info">Your role can see customers but not message them.</se-banner>
          }
          <h3 class="drawer-heading">Order activity</h3>
          <se-activity [entries]="activity()" />
        }
        <ng-container seDrawerFooter>
          <button seButton type="button" (click)="drawerOpen.set(false)">Close</button>
          @if (canSend) {
            <button
              seButton
              variant="primary"
              type="submit"
              form="send-update"
              [loading]="sending()"
            >
              Send update
            </button>
          }
        </ng-container>
      </se-drawer>
    </se-page>
  `,
  styles: [
    `
      .drawer-heading {
        margin: var(--se-space-6) 0 var(--se-space-2);
        font: var(--se-type-overline);
        letter-spacing: var(--se-type-overline-tracking);
        text-transform: uppercase;
        color: var(--se-color-text-muted);
      }
      .macros {
        display: flex;
        flex-wrap: wrap;
        gap: var(--se-space-2);
      }
    `,
  ],
})
export class MessagesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);

  /** Sending a notification is a write on the communication module. */
  readonly canSend = this.access.can('communication', 'full');

  readonly orders = signal<AdminOrder[]>([]);
  readonly returnsPending = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly macros = MACROS;
  readonly orderRef = orderRef;
  readonly statusLabel = statusLabel;

  readonly query = urlFilters([]).query;

  readonly threads = computed(() => threadsFrom(this.orders()));
  readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.threads().filter((t) => t.name.toLowerCase().includes(q)) : this.threads();
  });
  readonly summary = computed(() => {
    const n = this.rows().length;
    return `${n} ${n === 1 ? 'customer' : 'customers'}`;
  });
  readonly openOrders = computed(
    () =>
      this.orders().filter((o) => !['delivered', 'returned', 'cancelled'].includes(o.status))
        .length,
  );
  readonly unpaidOrders = computed(
    () => this.orders().filter((o) => o.paymentStatus !== 'paid').length,
  );

  readonly columns: SeColumn<CustomerThread>[] = [
    { key: 'name', header: 'Customer', sortable: true },
    { key: 'orders', header: 'Orders', numeric: true, value: (t) => t.orders.length },
    {
      key: 'lifetimeValue',
      header: 'Lifetime value',
      numeric: true,
      sortable: true,
      format: (v) => this.currency.format(v as number),
    },
    {
      key: 'lastOrderAt',
      header: 'Last order',
      sortable: true,
      format: (v) => formatDate(v as string),
    },
    { key: 'latest', header: 'Latest order', value: (t) => t.orders[0]?.status },
  ];
  readonly actions: SeRowAction<CustomerThread>[] = [
    {
      label: 'Send update',
      icon: 'message',
      hidden: () => !this.canSend,
      run: (t) => this.open(t),
    },
  ];

  // ---- drawer ----
  readonly drawerOpen = signal(false);
  readonly selected = signal<CustomerThread | null>(null);
  readonly sending = signal(false);
  readonly draftError = signal('');
  draft = '';
  orderId = '';
  readonly activity = computed<SeActivityEntry[]>(() => {
    const t = this.selected();
    if (!t) return [];
    return t.orders.map((o) => ({
      at: o.createdAt,
      text: `${orderRef(o.id)} · ${channelLabel(o.channel)} · ${this.currency.format(Number(o.totalAmount))} · ${statusLabel(o.status)}`,
      actor: o.paymentStatus === 'paid' ? 'Paid' : 'Awaiting payment',
      tone: o.paymentStatus === 'paid' ? undefined : 'warning',
    }));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.orders(undefined, 100).subscribe({
      next: (res) => {
        this.orders.set(res.data);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (this.orders().length === 0) {
          this.error.set(err?.error?.message ?? 'The server did not respond.');
        }
      },
    });
    this.api.returns().subscribe({
      next: (res) =>
        this.returnsPending.set(res.data.filter((r) => r.status === 'requested').length),
      error: () => undefined,
    });
  }

  open(t: CustomerThread): void {
    this.selected.set(t);
    this.orderId = t.orders[0]?.id ?? '';
    this.draft = '';
    this.draftError.set('');
    this.drawerOpen.set(true);
  }

  applyMacro(text: string): void {
    this.draft = this.draft.trim() ? `${this.draft.trim()}\n${text}` : text;
  }

  send(t: CustomerThread): void {
    const message = this.draft.trim();
    if (!message) {
      this.draftError.set('Write the update first.');
      return;
    }
    if (!this.orderId) return;
    this.draftError.set('');
    this.sending.set(true);
    this.api
      .sendNotification({
        recipientId: t.id,
        channel: 'in_platform',
        type: 'order_update',
        message,
        relatedOrderId: this.orderId,
      })
      .subscribe({
        next: () => {
          this.sending.set(false);
          this.drawerOpen.set(false);
          this.draft = '';
          this.toast.show(`Update sent to ${t.name}`);
        },
        error: (err) => {
          this.sending.set(false);
          this.draftError.set(err?.error?.message ?? 'The update could not be sent.');
        },
      });
  }
}

function statusLabel(status: string): string {
  return statusMeaning('order', status).label;
}
