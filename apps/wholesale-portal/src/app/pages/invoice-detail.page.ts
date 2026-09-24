import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, Invoice } from '../api.service';
import { pill } from '../status-pill';

/**
 * W7 — Invoice detail: commercial document header, issuer / consignee
 * panels, itemized manifest, quality-guarantee note, commercial ledger
 * and document actions. Built entirely from the live invoice record.
 */
@Component({
  selector: 'app-invoice-detail',
  imports: [CommonModule, RouterLink],
  template: `
    <a class="link backlink" routerLink="/orders">
      <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      Back to orders &amp; invoices
    </a>

    @if (invoice(); as inv) {
      <div class="doc-head">
        <div class="dh-row">
          <span class="chip">{{ paid(inv) ? 'Commercial tax invoice' : 'Pro-forma invoice' }}</span>
          @if (paid(inv)) {
            <span class="chip okc">Paid in full · {{ payMethod(inv) }}</span>
          } @else {
            <span class="chip accent">{{ inv.paymentStatus.replaceAll('_', ' ') }}</span>
          }
        </div>
        <p class="muted small" style="margin: var(--space-sm) 0 0">Document issued</p>
        <div class="dh-num">INV-{{ inv.orderId.slice(0, 8).toUpperCase() }}</div>
        <div class="dh-code">
          Order production code
          <strong>#SNT-{{ inv.orderId.slice(0, 8).toUpperCase() }}</strong>
        </div>
      </div>

      <div class="meta-grid">
        <div class="mg"><span class="m-l">Issue date</span>
          <span class="m-v">{{ inv.createdAt | date: 'dd MMM yyyy' }}</span></div>
        <div class="mg"><span class="m-l">Settlement date</span>
          <span class="m-v">{{ inv.payments[0] ? (inv.payments[0].date | date: 'dd MMM yyyy') : '—' }}</span></div>
        <div class="mg"><span class="m-l">Payment ref</span>
          <span class="m-v">{{ inv.payments[0] ? inv.payments[0].id.slice(0, 8).toUpperCase() : 'Pending' }}</span></div>
        <div class="mg"><span class="m-l">Channel</span>
          <span class="m-v">Wholesale portal</span></div>
      </div>

      <!-- GAP: issuer RC / TIN / registered street address are not exposed by any
           config endpoint — the block carries only what the business docs state. -->
      <div class="party">
        <div class="p-head"><span>Manufacturer / issuer</span><span class="chip">Aba hub</span></div>
        <div class="p-name">Seentair Limited</div>
        <p class="p-sub">Streetwear manufacturer — single factory, Aba, Nigeria.</p>
        <div class="p-foot"><span>Finance desk</span><span class="v">+234 1 888 7400</span></div>
      </div>

      <div class="party">
        <div class="p-head"><span>Billed to &amp; consignee</span><span class="chip okc">Verified buyer</span></div>
        <div class="p-name">{{ buyer()?.name ?? 'Wholesale account' }}</div>
        <p class="p-sub">Approved Seentair wholesale buyer.</p>
        <div class="p-foot"><span>Account email</span><span class="v">{{ buyer()?.email ?? '—' }}</span></div>
      </div>

      <div class="section-head">
        <h2>Itemized manifest</h2>
        <span class="aside">{{ lines(inv) }} line{{ lines(inv) === 1 ? '' : 's' }} · {{ units(inv) }} units</span>
      </div>
      <table class="table">
        <thead>
          <tr><th>Item &amp; SKU</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Line total</th></tr>
        </thead>
        <tbody>
          @for (item of inv.items; track item.sku) {
            <tr>
              <td><code>{{ item.sku }}</code></td>
              <td class="num">{{ item.quantity }} pcs</td>
              <td class="num">₦{{ item.unitPrice | number: '1.0-2' }}</td>
              <td class="num"><strong>₦{{ item.lineTotal | number: '1.0-2' }}</strong></td>
            </tr>
          }
        </tbody>
      </table>

      <section class="panel">
        <div class="tagbar">
          <span><span class="material-symbols-outlined" style="font-size:14px; vertical-align:-2px"
            aria-hidden="true">verified</span> Manufacturing quality guarantee</span>
        </div>
        <p class="small muted" style="margin:0">
          Every batch passes factory quality control before dispatch. Defective rejects are
          destroyed and never shipped; garments with minor factory errors are repaired and
          restocked under a recorded reason code. Each movement writes to the immutable
          audit log.
        </p>
        <!-- GAP: signed audit code + factory-controller signature block awaits the
             audit-log export endpoint; the guarantee text above states only live policy. -->
      </section>

      <div class="section-head"><h2>Commercial ledger</h2></div>
      <section class="panel">
        <div class="ledger">
          <div class="lg-row"><span>Merchandise subtotal ({{ units(inv) }} units)</span>
            <span class="v">₦{{ subtotal(inv) | number: '1.0-2' }}</span></div>
          <div class="lg-row disc"><span>Wholesale tier rate</span>
            <span class="v">Applied at order time</span></div>
          <!-- GAP: freight and statutory-charge lines await the logistics/fees module;
               the server-computed order total is authoritative. -->
          <div class="lg-row total">
            <span>Total {{ paid(inv) ? 'settled' : 'payable' }}<br />
              @if (paid(inv)) {
                <span class="success" style="font-weight:400; font-size: var(--type-body-sm); text-transform:none; letter-spacing:normal">
                  Paid in full via {{ payMethod(inv) }}</span>
              }
            </span>
            <span class="v">₦{{ inv.totalAmount | number: '1.0-2' }}</span>
          </div>
        </div>
        @for (payment of inv.payments; track payment.id) {
          <p class="muted small" style="margin: var(--space-sm) 0 0">
            Paid ₦{{ payment.amount | number: '1.0-2' }} via {{ payment.method.replaceAll('_', ' ') }}
            on {{ payment.date | date: 'medium' }}</p>
        }
      </section>

      <button class="cta" style="width:100%" (click)="print()">
        <span class="material-symbols-outlined" aria-hidden="true">download</span>
        Download / print PDF invoice
      </button>
      <!-- GAP: server-rendered PDF + WhatsApp share await the document service;
           browser print-to-PDF covers the download meanwhile. -->
      <div class="actions" style="justify-content:center">
        <button class="link" disabled title="WhatsApp desk line pending messaging-provider setup">
          Share via WhatsApp desk</button>
        <span class="status" [class]="'status ' + pill(inv.status)">{{ inv.status.replaceAll('_', ' ') }}</span>
      </div>
    } @else if (missing()) {
      <p class="error">Invoice not found. <a class="link" routerLink="/orders">Back to orders</a></p>
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

  subtotal(inv: Invoice): number {
    return inv.items.reduce((n, i) => n + i.lineTotal, 0);
  }

  print(): void {
    window.print();
  }
}
