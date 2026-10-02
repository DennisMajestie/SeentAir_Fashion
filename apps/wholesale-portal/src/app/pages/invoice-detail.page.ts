import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, Invoice } from '../api.service';
import { pill } from '../status-pill';
import { FactsComponent, LedgerComponent, StripComponent } from '../ui/primitives';

/**
 * Date formatting for facts built in TypeScript. `Intl` rather than injecting
 * `DatePipe`, which a standalone component only receives if it declares the
 * pipe — a dependency that fails at runtime, not at build time.
 */
const dayFormat = new Intl.DateTimeFormat('en-NG', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/**
 * W7, Invoice detail: the commercial document for one order.
 *
 * A document, not a list, so this page uses `se-strip` throughout and never
 * collapses anything: everything on an invoice has to stay visible and
 * printable at once. The manifest stays a real `<table>` because a ledger
 * with per-line totals is exactly the thing a flexbox will not line up.
 */
@Component({
  selector: 'app-invoice-detail',
  imports: [CommonModule, RouterLink, StripComponent, FactsComponent, LedgerComponent],
  template: `
    <a class="link backlink" routerLink="/orders">
      <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      Back to orders &amp; invoices
    </a>

    @if (invoice(); as inv) {
      <se-strip
        label="Document issued"
        [badge]="paid(inv) ? 'Commercial tax invoice' : 'Pro-forma invoice'"
        trailing
      >
        <span stripTrailing class="status {{ pill(inv.status) }}">{{
          inv.status.replaceAll('_', ' ')
        }}</span>
        <div class="doc-num">INV-{{ code(inv) }}</div>
        <p class="muted small" style="margin: 0 0 var(--space-sm)">
          Order production code #SNT-{{ code(inv) }}
        </p>
        <se-facts [facts]="settlementFacts(inv)" />
      </se-strip>

      <div class="parties">
        <se-strip label="Manufacturer / issuer" badge="Aba hub">
          <p class="party-name">Seentair Limited</p>
          <p class="muted small" style="margin: 0">
            Streetwear manufacturer: single factory, Aba, Nigeria.
          </p>
          <se-ledger [rows]="issuerRows()" />
        </se-strip>

        <se-strip label="Billed to &amp; consignee" badge="Verified buyer">
          <p class="party-name">{{ buyer()?.name ?? 'Wholesale account' }}</p>
          <p class="muted small" style="margin: 0">Approved Seentair wholesale buyer.</p>
          <se-ledger [rows]="buyerRows()" />
        </se-strip>
      </div>

      <se-strip
        label="Itemized manifest"
        [badge]="
          lines(inv) + (lines(inv) === 1 ? ' line' : ' lines') + ' · ' + units(inv) + ' units'
        "
      >
        <div class="table-scroll">
          <table class="table">
            <caption class="sr-only">
              Items on invoice
              {{
                code(inv)
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">Item &amp; SKU</th>
                <th scope="col" class="num">Qty</th>
                <th scope="col" class="num">Unit price</th>
                <th scope="col" class="num">Line total</th>
              </tr>
            </thead>
            <tbody>
              @for (item of inv.items; track item.sku) {
                <tr>
                  <td>
                    <code>{{ item.sku }}</code>
                  </td>
                  <td class="num">{{ item.quantity }} pcs</td>
                  <td class="num">₦{{ item.unitPrice | number: '1.0-2' }}</td>
                  <td class="num">
                    <strong>₦{{ item.lineTotal | number: '1.0-2' }}</strong>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </se-strip>

      <se-strip label="Manufacturing quality guarantee">
        <p class="small muted" style="margin: 0">
          Every batch passes factory quality control before dispatch. Defective rejects are
          destroyed and never shipped; garments with minor factory errors are repaired and restocked
          under a recorded reason code. Each movement writes to the immutable audit log.
        </p>
        <!-- GAP: signed audit code + factory-controller signature block awaits the
             audit-log export endpoint; the guarantee text states only live policy. -->
      </se-strip>

      <se-strip label="Commercial ledger">
        <se-ledger [rows]="ledgerRows(inv)" />
        @for (payment of inv.payments; track payment.id) {
          <p class="muted small" style="margin: var(--space-sm) 0 0">
            Paid ₦{{ payment.amount | number: '1.0-2' }} via
            {{ payment.method.replaceAll('_', ' ') }} on {{ payment.date | date: 'medium' }}
          </p>
        }
      </se-strip>

      <button class="cta" style="width:100%" (click)="print()">
        <span class="material-symbols-outlined" aria-hidden="true">download</span>
        Download / print PDF invoice
      </button>
      <!-- GAP: server-rendered PDF + WhatsApp share await the document service;
           browser print-to-PDF covers the download meanwhile. -->
      <div class="actions" style="justify-content: center">
        <button class="link" disabled title="WhatsApp desk line pending messaging-provider setup">
          Share via WhatsApp desk
        </button>
        <span class="status {{ pill(inv.status) }}">{{ inv.status.replaceAll('_', ' ') }}</span>
      </div>
    } @else if (missing()) {
      <p class="error">
        Invoice not found. <a class="link" routerLink="/orders">Back to orders</a>
      </p>
    } @else {
      <p class="muted">Loading invoice…</p>
    }
  `,
})
export class InvoiceDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly pill = pill;
  readonly invoice = signal<Invoice | null>(null);
  readonly buyer = signal<{ name: string; email: string } | null>(null);
  readonly missing = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.api.invoices().subscribe({
      next: (res) => {
        const inv = res.data.find((i) => i.orderId === id) ?? null;
        this.invoice.set(inv);
        this.missing.set(!inv);
      },
      error: () => this.missing.set(true),
    });
    this.api.me().subscribe({ next: (m) => this.buyer.set(m), error: () => undefined });
  }

  /** Shared by the invoice number, the production code and the caption. */
  code(inv: Invoice): string {
    return inv.orderId.slice(0, 8).toUpperCase();
  }

  paid(inv: Invoice): boolean {
    return inv.paymentStatus === 'paid';
  }

  payMethod(inv: Invoice): string {
    return (inv.payments[0]?.method ?? 'desk-confirmed').replaceAll('_', ' ');
  }

  units(inv: Invoice): number {
    return inv.items.reduce((n, i) => n + i.quantity, 0);
  }

  lines(inv: Invoice): number {
    return inv.items.length;
  }

  settlementFacts(inv: Invoice): Array<{ label: string; value: string; numeric?: boolean }> {
    const settlement = inv.payments[0];
    return [
      { label: 'Issue date', value: dayFormat.format(new Date(inv.createdAt)) },
      {
        label: this.paid(inv) ? 'Settlement date' : 'Payment ref',
        value: !settlement
          ? 'Pending'
          : this.paid(inv)
            ? dayFormat.format(new Date(settlement.date))
            : settlement.id.slice(0, 8).toUpperCase(),
      },
      { label: 'Channel', value: 'Wholesale portal' },
    ];
  }

  issuerRows(): Array<{ label: string; value: string; numeric?: boolean }> {
    return [{ label: 'Finance desk', value: '+234 1 888 7400', numeric: false }];
  }

  buyerRows(): Array<{ label: string; value: string; numeric?: boolean }> {
    return [{ label: 'Account email', value: this.buyer()?.email ?? '—', numeric: false }];
  }

  ledgerRows(
    inv: Invoice,
  ): Array<{ label: string; value: string; note?: string; total?: boolean; numeric?: boolean }> {
    const subtotal = this.subtotal(inv);
    const total: { label: string; value: string; note?: string; total: boolean } = {
      label: this.paid(inv) ? 'Total settled' : 'Total payable',
      value: `₦${this.money(inv.totalAmount)}`,
      total: true,
    };
    if (this.paid(inv)) total.note = 'Paid in full via ' + this.payMethod(inv);
    return [
      {
        label: `Merchandise subtotal (${this.units(inv)} units)`,
        value: `₦${this.money(subtotal)}`,
        numeric: false,
      },
      { label: 'Wholesale tier rate', value: 'Applied at order time', numeric: false },
      // GAP: freight and statutory-charge lines await the logistics/fees module;
      // the server-computed order total is authoritative.
      total,
    ];
  }

  subtotal(inv: Invoice): number {
    return inv.items.reduce((n, i) => n + i.lineTotal, 0);
  }

  /** Two decimals, matching the numbers the manifest table prints. */
  private money(value: number): string {
    return value.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  print(): void {
    window.print();
  }
}
