import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Invoice, Pricing } from '../api.service';
import { pill } from '../status-pill';
import {
  EmptyComponent,
  FactsComponent,
  LedgerComponent,
  RowComponent,
  StripComponent,
} from '../ui/primitives';

/**
 * W2, Wholesale buyer home.
 *
 * Identity and tier, the four operational numbers, and the buyer's recent
 * activity. All figures derive from the live API (auth/me, wholesale/pricing,
 * wholesale/invoices, notifications) — nothing is invented.
 *
 * Recent orders and Billing used to be two separate sections looping the same
 * three invoices, which meant every number appeared twice. They are now one
 * section: the row head carries the invoice state, the panel carries the lines
 * and the money, and the actions are the ones that actually change something.
 */
@Component({
  selector: 'app-home',
  imports: [
    CommonModule,
    RouterLink,
    StripComponent,
    FactsComponent,
    LedgerComponent,
    RowComponent,
    EmptyComponent,
  ],
  template: `
    <se-strip label="Wholesale account" [badge]="approved() ? 'Verified' : 'Pending review'">
      <h1 class="home-h1">{{ buyerName() ?? 'Wholesale buyer' }}</h1>
      @if (pricing(); as p) {
        <p class="muted small" style="margin: 0 0 var(--space-sm)">
          <strong>{{ p.tier?.name ?? 'Standard tier' }}</strong>
          @if (p.tier) {
            · {{ p.tier.discountPercent }}% off retail rate active
          }
          @if (moqKnown()) {
            · {{ moq() }}-unit batch minimum
          }
        </p>
        <a class="link" routerLink="/catalogue">Tier details</a>
      } @else {
        <p class="muted small" style="margin: 0 0 var(--space-sm)">
          Wholesale account awaiting approval, apply from the catalogue.
        </p>
        <a class="link" routerLink="/catalogue">Apply</a>
      }
    </se-strip>

    <se-strip label="Operations" flush>
      <se-facts [facts]="kpis()" />
    </se-strip>

    <a class="cta hero-cta" routerLink="/catalogue">
      <span class="material-symbols-outlined" aria-hidden="true">storefront</span>
      <span>Browse wholesale catalogue</span>
      <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
    </a>

    @if (notices().length > 0) {
      <se-strip label="Desk notices" [badge]="notices().length + ''">
        @for (n of notices(); track n.id) {
          <p class="small" style="margin: 0 0 var(--space-xs)">
            <span class="status">{{ n.type.replaceAll('_', ' ') }}</span> {{ n.message }}
            <span class="muted">({{ n.sentAt | date: 'short' }})</span>
          </p>
        }
      </se-strip>
    }

    <se-strip label="Recent orders & invoices" [badge]="invoices().length + ' total'">
      <span stripTrailing>
        <a class="link" routerLink="/orders">View all orders</a>
      </span>
      @if (invoices().length === 0) {
        <se-empty
          icon="receipt_long"
          title="No orders yet"
          sub="Your first wholesale batch will appear here."
        />
      } @else {
        @for (invoice of recent(); track invoice.orderId) {
          <se-row
            [id]="invoice.orderId"
            [open]="openId() === invoice.orderId"
            (toggled)="onToggle(invoice.orderId, $event)"
          >
            <span rowIdent>
              <span class="oc-id">#{{ code(invoice) }}</span>
              <span class="oc-meta">{{ invoice.createdAt | date: 'dd MMM yyyy' }}</span>
            </span>
            <span rowTail>
              <span class="status {{ pill(invoice.status) }}">
                {{ invoice.status.replaceAll('_', ' ') }}
              </span>
              <span class="home-amount">₦{{ money(invoice.totalAmount) }}</span>
            </span>

            <ng-container rowPanel>
              <se-ledger [rows]="invoiceLedger(invoice)" />
              <p class="muted small" style="margin: var(--space-sm) 0 0">
                {{ units(invoice) }} units · {{ invoice.items.length }} line(s) ·
                {{
                  paid(invoice)
                    ? 'settled via ' + payMethod(invoice)
                    : 'payment ' + invoice.paymentStatus.replaceAll('_', ' ')
                }}
              </p>
            </ng-container>

            <span rowActions>
              <a class="cta small quiet" [routerLink]="['/orders', invoice.orderId, 'invoice']">
                <span class="material-symbols-outlined" aria-hidden="true">receipt_long</span>
                {{ paid(invoice) ? 'Download PDF' : 'View invoice' }}
              </a>
              @if (!paid(invoice)) {
                <button class="cta small outline" (click)="reorder(invoice.orderId)">
                  <span class="material-symbols-outlined" aria-hidden="true">sync</span> Reorder
                  batch
                </button>
              }
            </span>
          </se-row>
        }
      }
    </se-strip>

    @if (message()) {
      <p class="success">{{ message() }}</p>
    }

    <!-- GAP: no account-manager endpoint yet, desk identity below is the same
         factory support desk the approved W1 screen publishes, not a per-buyer
         assigned rep. Awaits a wholesale account-manager field in the API. -->
    <se-strip label="Factory desk" badge="Aba hub desk">
      <p class="party-name" style="margin: 0 0 var(--space-sm)">Aba Wholesale Desk</p>
      <p class="muted small" style="margin: 0 0 var(--space-sm)">
        Wholesale operations: Aba factory
      </p>
      <div class="actions">
        <a class="cta small outline" href="tel:+23418887400">
          <span class="material-symbols-outlined" aria-hidden="true">call</span> +234 1 888 7400
        </a>
        <!-- GAP: no verified WhatsApp business line yet (Termii/Twilio decision pending) -->
        <button
          class="cta small quiet"
          disabled
          title="WhatsApp desk line pending messaging-provider setup"
        >
          <span class="material-symbols-outlined" aria-hidden="true">chat</span> WhatsApp desk
        </button>
      </div>
    </se-strip>
  `,
})
export class HomePage implements OnInit {
  private readonly api = inject(ApiService);
  readonly pill = pill;
  readonly buyerName = signal<string | null>(null);
  readonly pricing = signal<Pricing | null>(null);
  readonly approved = signal(false);
  readonly invoices = signal<Invoice[]>([]);
  readonly notices = signal<Array<{ id: string; type: string; message: string; sentAt: string }>>(
    [],
  );
  readonly message = signal<string | null>(null);
  /** Which invoice row is expanded; null means all collapsed. */
  readonly openId = signal<string | null>(null);

  readonly recent = computed(() => this.invoices().slice(0, 3));
  readonly openOrders = computed(
    () => this.invoices().filter((i) => !/delivered|cancelled|completed/.test(i.status)).length,
  );
  readonly awaitingPay = computed(() => this.invoices().filter((i) => !this.paid(i)).length);
  readonly inTransit = computed(
    () => this.invoices().filter((i) => /shipped|transit|dispatch|out_for/.test(i.status)).length,
  );
  readonly lastOrder = computed(() => this.invoices()[0] ?? null);

  ngOnInit(): void {
    this.api.me().subscribe({ next: (m) => this.buyerName.set(m.name), error: () => undefined });
    this.api.pricing().subscribe({
      next: (p) => {
        this.pricing.set(p);
        this.approved.set(true);
      },
      error: () => this.approved.set(false),
    });
    this.api
      .invoices()
      .subscribe({ next: (r) => this.invoices.set(r.data), error: () => undefined });
    this.api.notifications().subscribe({
      next: (r) => this.notices.set(r.data.slice(0, 3)),
      error: () => undefined,
    });
  }

  /** One at a time, the same rule as the orders log. */
  onToggle(orderId: string, open: boolean): void {
    this.openId.set(open ? orderId : null);
  }

  moq(): number {
    return this.pricing()?.moq ?? 0;
  }

  moqKnown(): boolean {
    return this.moq() > 0;
  }

  code(invoice: Invoice): string {
    return invoice.orderId.slice(0, 8).toUpperCase();
  }

  two(n: number): string {
    return n.toString().padStart(2, '0');
  }

  kpis(): Array<{ label: string; value: string; numeric?: boolean }> {
    const last = this.lastOrder();
    return [
      { label: 'Open orders', value: this.two(this.openOrders()), numeric: true },
      {
        label: 'Awaiting payment',
        value: this.awaitingPay() > 0 ? this.two(this.awaitingPay()) : 'Clear',
        numeric: true,
      },
      { label: 'In transit', value: this.two(this.inTransit()), numeric: true },
      {
        label: 'Last order',
        value: last ? this.day(last.createdAt) + ' · ' + last.status.replaceAll('_', ' ') : '—',
      },
    ];
  }

  invoiceLedger(
    invoice: Invoice,
  ): Array<{ label: string; value: string; note?: string; total?: boolean }> {
    const rows: Array<{ label: string; value: string; note?: string; total?: boolean }> =
      invoice.items.map((item) => ({
        label: item.sku,
        value: `₦${this.money(item.lineTotal)}`,
        note: `${item.quantity} × ₦${this.money(item.unitPrice)}`,
      }));
    rows.push({
      label: this.paid(invoice) ? 'Total settled' : 'Total due',
      value: `₦${this.money(invoice.totalAmount)}`,
      total: true,
    });
    return rows;
  }

  units(invoice: Invoice): number {
    return invoice.items.reduce((n, i) => n + i.quantity, 0);
  }

  paid(invoice: Invoice): boolean {
    return invoice.paymentStatus === 'paid';
  }

  payMethod(invoice: Invoice): string {
    return (invoice.payments[0]?.method ?? 'confirmed').replaceAll('_', ' ');
  }

  reorder(orderId: string): void {
    this.api.reorder(orderId).subscribe({
      next: (order) =>
        this.message.set(`Reorder placed: ${order.id.slice(0, 8)}- repriced at your current tier.`),
      error: (err) => this.message.set(err?.error?.message ?? 'Reorder failed.'),
    });
  }

  money(value: number): string {
    return value.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private day(value: string): string {
    return new Intl.DateTimeFormat('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }
}
