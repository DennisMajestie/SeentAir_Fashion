import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SeConfirmService, SeCurrencyService, SeDatePipe, SeMoneyPipe, formatDate } from '@seentair/ui';
import { ApiService, Invoice } from '../api.service';
import { isClosed, isPaid, orderRef, payMethod, units } from '../wholesale-format';
import { pill } from '../status-pill';

/**
 * W7 Invoice Detail, carried verbatim from the Stitch screen: the commercial
 * document for one wholesale order.
 *
 * Nothing on it collapses, because the page doubles as the printable
 * invoice. The money comes from the server-computed order total; the
 * amount handed to Paystack is that total, never an editable field, because
 * wholesale is full payment upfront.
 */
@Component({
  selector: 'app-invoice-detail',
  imports: [SeDatePipe, SeMoneyPipe],
  template: `
    <div class="stitch">
      <div class="bg-canvas text-light-on-surface min-h-screen md:pl-56 pb-32 antialiased md:pb-8 selection:bg-accent/20">
        <header class="px-4 pt-4 pb-3 border-b border-border/70 bg-canvas/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <a routerLink="/orders" class="w-8 h-8 rounded-full bg-light-surface border border-border flex items-center justify-center text-light-primary" aria-label="Back to orders">
              <span class="material-symbols-outlined text-[18px]">arrow_back</span>
            </a>
            <div>
              <h1 class="text-[16px] font-bold text-light-primary font-mono">{{ ref() }}</h1>
              @if (invoice(); as inv) {
                <span class="text-[11px] text-light-secondary">{{ lineSummary(inv) }}</span>
              }
            </div>
          </div>
          @if (invoice(); as inv) {
            <button type="button" aria-label="Print invoice" class="print-btn w-8 h-8 rounded-full bg-light-surface border border-border flex items-center justify-center text-light-primary no-print" (click)="print()">
              <span class="material-symbols-outlined text-[16px]">print</span>
            </button>
          }
        </header>

        <main class="px-4 py-4 flex flex-col gap-4 max-w-[390px] mx-auto w-full md:max-w-5xl">
          @if (invoice(); as inv) {
            <p class="meta-line text-[11px] text-light-secondary px-1">{{ metaLine(inv) }}</p>

            <!-- Payment Status Banner -->
            <div
              class="pay-banner p-4 rounded-xl border flex items-center justify-between gap-2"
              [class]="payToneClass(inv)"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span class="status-pill" [class]="statusPillClass(pill(inv.status))">{{ statusLabel(inv.status) }}</span>
                  <span class="status-pill" [class]="statusPillClass(pill(inv.paymentStatus))">{{ statusLabel(inv.paymentStatus) }}</span>
                </div>
                <h2 class="text-[16px] font-bold leading-tight mt-0.5" [class]="payHeadClass(inv)">{{ payHeadline(inv) }}</h2>
                <span class="text-[11px] text-light-secondary block mt-0.5">{{ payNote(inv) }}</span>
              </div>
              <span class="material-symbols-outlined text-[28px]" [class]="payIconClass(inv)">{{ payable(inv) ? 'pending' : paid(inv) ? 'verified' : 'block' }}</span>
            </div>

            @if (payError(); as msg) {
              <div class="pay-error p-3 rounded-xl bg-light-surface border border-danger/30">
                <strong class="text-[13px] font-bold text-danger block">Payment could not start</strong>
                <span class="text-[11px] text-light-secondary">{{ msg }}</span>
              </div>
            }

            <!-- Commercial Invoice Sheet -->
            <section class="bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] flex flex-col gap-4">
              <!-- Issuer & Billed To -->
              <div class="grid grid-cols-2 gap-3 text-[12px] border-b border-border pb-3.5">
                <div>
                  <span class="text-[10px] uppercase font-mono text-light-secondary block">Manufacturer</span>
                  <strong class="font-bold text-light-primary block">Seentair Limited</strong>
                  <span class="text-light-secondary text-[11px]">Aba, Nigeria</span>
                  <span class="text-[11px] text-light-secondary block mt-0.5">
                    Finance desk:
                    <a class="text-accent font-semibold" href="tel:+23418887400">+234 1 888 7400</a>
                  </span>
                </div>
                <div>
                  <span class="text-[10px] uppercase font-mono text-light-secondary block">Billed To (Buyer)</span>
                  <strong class="font-bold text-light-primary block">{{ buyer()?.name ?? '—' }}</strong>
                  <span class="text-light-secondary text-[11px] break-all">{{ buyer()?.email ?? '—' }}</span>
                  <span class="font-mono text-[10px] text-light-secondary block mt-0.5">Channel: Wholesale portal</span>
                </div>
              </div>

              <!-- Line Items List -->
              <div class="flex flex-col gap-2">
                <span class="text-[11px] font-semibold uppercase tracking-wider text-light-secondary">{{ lineSummary(inv) }}</span>
                @for (item of inv.items; track item.sku) {
                  <div class="line-item p-3 rounded-lg bg-canvas/70 border border-border/80 flex flex-col gap-1 text-[12px]">
                    <div class="flex justify-between items-start gap-2">
                      <span class="font-bold text-light-primary font-mono break-all">{{ item.sku }}</span>
                      <span class="font-mono font-bold text-light-primary whitespace-nowrap">{{ item.lineTotal | seMoney: 2 }}</span>
                    </div>
                    <span class="text-[11px] text-light-secondary">{{ item.quantity }} units @ {{ item.unitPrice | seMoney: 2 }}/unit</span>
                  </div>
                }
              </div>

              <!-- Financial Totals -->
              <div class="pt-3 border-t border-border flex flex-col gap-1.5 text-[13px]">
                <div class="flex justify-between text-light-secondary">
                  <span>Merchandise ({{ units(inv) }} units)</span>
                  <span class="font-mono text-light-primary">{{ subtotal(inv) | seMoney: 2 }}</span>
                </div>
                <div class="flex justify-between text-light-secondary">
                  <span>Wholesale tier rate</span>
                  <span class="font-mono text-light-primary">Applied at order time</span>
                </div>
                <div class="pt-2 border-t border-border flex justify-between items-baseline font-bold" [attr.data-kv]="totalLabel(inv)">
                  <span class="text-light-primary text-[15px]">{{ totalLabel(inv) }}</span>
                  <span class="font-mono text-[20px] text-accent">{{ inv.totalAmount | seMoney: 2 }}</span>
                </div>
              </div>
            </section>

            <!-- Payments -->
            <section class="bg-light-surface rounded-xl p-4 border border-border flex flex-col gap-2">
              <h3 class="text-[13px] font-bold text-light-primary flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[16px] text-accent">payments</span>
                Payments
              </h3>
              @if (inv.payments.length) {
                <dl class="flex flex-col gap-1.5 text-[12px]">
                  @for (payment of inv.payments; track payment.id) {
                    <div class="flex justify-between gap-2 text-light-secondary">
                      <span>{{ payment.date | seDate: 'datetime' }}</span>
                      <span class="font-mono text-light-primary">{{ payment.amount | seMoney: 2 }} via {{ method(payment.method) }}</span>
                    </div>
                  }
                </dl>
              } @else {
                <p class="text-[11px] text-light-secondary">No payment recorded yet.</p>
              }
            </section>

            <!-- Manufacturing Quality Guarantee -->
            <div class="p-3 rounded-lg bg-canvas-tint/70 border border-border text-[11px] text-light-secondary leading-normal">
              Manufacturing quality guarantee: every batch passes factory quality control before dispatch. Defective rejects are destroyed and never shipped; garments with minor factory errors are repaired and restocked under a recorded reason code.
            </div>
          } @else if (failed()) {
            <div class="load-error p-3.5 rounded-xl bg-light-surface border border-danger/30 flex items-center justify-between gap-2">
              <div>
                <h2 class="text-[13px] font-bold text-danger">The invoice could not be loaded</h2>
                <span class="text-[11px] text-light-secondary">Check your connection and try again.</span>
              </div>
              <button type="button" class="px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold flex-shrink-0" (click)="load()">Try again</button>
            </div>
          } @else if (missing()) {
            <div class="empty-state bg-light-surface p-3.5 rounded-xl border border-border flex flex-col items-center gap-1.5 text-center">
              <span class="material-symbols-outlined text-[28px] text-light-secondary">receipt_long</span>
              <strong class="text-[14px] text-light-primary">Invoice not found</strong>
              <p class="text-[11px] text-light-secondary">This order is not on your account.</p>
              <button type="button" class="mt-1 px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold" (click)="router.navigate(['/orders'])">Back to orders</button>
            </div>
          } @else {
            <div aria-busy="true">
              <span class="text-[11px] font-mono text-light-secondary uppercase tracking-wider block mb-2">Loading invoice…</span>
              <div class="bg-light-surface/60 rounded-xl p-3.5 border border-dashed border-border flex gap-3.5 animate-pulse">
                <div class="w-24 h-20 rounded-lg bg-canvas-tint/80 flex-shrink-0"></div>
                <div class="flex-1 flex flex-col justify-between py-1">
                  <div class="space-y-2">
                    <div class="h-3 w-1/3 bg-canvas-tint rounded"></div>
                    <div class="h-4 w-4/5 bg-canvas-tint rounded"></div>
                  </div>
                  <div class="h-5 w-24 bg-canvas-tint rounded-full"></div>
                </div>
              </div>
            </div>
          }
        </main>

        @if (invoice(); as inv) {
          @if (payable(inv)) {
            <!-- Sticky Bottom Pay CTA -->
            <aside aria-label="Pay invoice" class="fixed bottom-0 left-0 right-0 max-w-[390px] mx-auto md:left-56 md:max-w-none md:mx-0 bg-light-surface border-t border-border px-4 py-3 flex items-center justify-between shadow-[0_-8px_20px_rgba(27,25,22,0.06)] z-30 no-print">
              <div>
                <span class="text-[11px] text-light-secondary block font-medium">Full Amount Due</span>
                <span class="font-mono font-bold text-[18px] text-light-primary">{{ inv.totalAmount | seMoney: 2 }}</span>
              </div>
              <button
                type="button"
                aria-label="Pay now"
                class="px-6 py-3.5 rounded-full bg-accent text-on-accent font-semibold text-[14px] flex items-center gap-2 shadow-sm hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
                [disabled]="paying()"
                (click)="payNow(inv)"
              >
                <span>{{ paying() ? 'Opening Paystack…' : 'Pay now' }}</span>
                <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </aside>
          }
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      @media print {
        .no-print,
        ws-tab-bar {
          display: none !important;
        }
      }
    `,
  ],
})
export class InvoiceDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(SeConfirmService);
  private readonly currency = inject(SeCurrencyService);
  readonly router = inject(Router);

  readonly invoice = signal<Invoice | null>(null);
  readonly buyer = signal<{ name: string; email: string } | null>(null);
  readonly missing = signal(false);
  readonly failed = signal(false);
  /** True while the Paystack handoff is in flight, so the button cannot double-fire. */
  readonly paying = signal(false);
  readonly payError = signal<string | null>(null);

  readonly units = units;
  readonly paid = isPaid;
  readonly pill = pill;
  /** Why an unpaid invoice has no Pay button. */
  closedNote(inv: Invoice): string {
    if (isPaid(inv) || !isClosed(inv)) return '';
    return `. This order is ${inv.status.replaceAll('_', ' ')}, so nothing is payable.`;
  }
  /** Only an open, unpaid order can be paid: a cancelled or returned one never. */
  readonly payable = (inv: Invoice): boolean => !isPaid(inv) && !isClosed(inv);
  readonly ref = computed(() => orderRef(this.invoice()?.orderId ?? this.id));

  private id = '';

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
    this.api.me().subscribe({ next: (m) => this.buyer.set(m), error: () => undefined });
  }

  load(): void {
    this.failed.set(false);
    this.missing.set(false);
    this.api.invoices().subscribe({
      next: (res) => {
        const inv = res.data.find((i) => i.orderId === this.id) ?? null;
        this.invoice.set(inv);
        this.missing.set(!inv);
      },
      error: () => this.failed.set(true),
    });
  }

  lineSummary(inv: Invoice): string {
    const n = inv.items.length;
    return `${n} ${n === 1 ? 'line' : 'lines'}, ${units(inv)} units`;
  }

  method(raw: string): string {
    return raw.replaceAll('_', ' ');
  }

  subtotal(inv: Invoice): number {
    return inv.items.reduce((n, i) => n + i.lineTotal, 0);
  }

  statusLabel(status: string): string {
    const words = status.replaceAll('_', ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  statusPillClass(tone: string): string {
    const base = 'px-2.5 py-0.5 rounded-full font-semibold text-[11px] whitespace-nowrap';
    if (tone === 'ok') return `${base} bg-success/15 text-success`;
    if (tone === 'warn') return `${base} bg-warning/15 text-warning`;
    if (tone === 'bad') return `${base} bg-danger/15 text-danger`;
    return `${base} bg-canvas-tint text-light-secondary`;
  }

  totalLabel(inv: Invoice): string {
    if (isPaid(inv)) return 'Total settled';
    if (this.payable(inv)) return 'Total payable';
    return 'Total';
  }

  payToneClass(inv: Invoice): string {
    if (this.payable(inv)) return 'bg-warning/15 border-warning/30';
    if (isPaid(inv)) return 'bg-success/15 border-success/30';
    return 'bg-danger/10 border-danger/30';
  }

  payHeadClass(inv: Invoice): string {
    if (this.payable(inv)) return 'text-warning';
    if (isPaid(inv)) return 'text-success';
    return 'text-danger';
  }

  payIconClass(inv: Invoice): string {
    if (this.payable(inv)) return 'text-warning';
    if (isPaid(inv)) return 'text-success';
    return 'text-danger';
  }

  payHeadline(inv: Invoice): string {
    if (this.payable(inv)) return 'Awaiting 100% Upfront Settlement';
    if (isPaid(inv)) return 'Settled in full';
    return 'Nothing is payable';
  }

  payNote(inv: Invoice): string {
    if (this.payable(inv))
      return 'Wholesale is full payment upfront; there are no part-payments. Prefer a transfer? Call the finance desk on +234 1 888 7400.';
    if (isPaid(inv)) return this.settledLine(inv);
    return 'The order is closed, so the invoice carries nothing payable.';
  }

  metaLine(inv: Invoice): string {
    const kind = isPaid(inv) ? 'Commercial tax invoice' : 'Pro-forma invoice';
    return `${kind} issued ${formatDate(inv.createdAt)}${isPaid(inv) ? '. ' + this.settledLine(inv) : ''}${this.closedNote(inv)}`;
  }

  /**
   * Hands the invoice to Paystack and leaves the app, after the buyer has
   * confirmed the amount. The amount is the invoice total, never an editable
   * field: wholesale is full payment upfront.
   */
  async payNow(inv: Invoice): Promise<void> {
    if (this.paying() || !this.payable(inv)) return;
    const amount = this.currency.format(inv.totalAmount, 2);
    const ok = await this.confirm.ask({
      title: `Pay ${amount} for order ${orderRef(inv.orderId)}?`,
      consequence: `You will be taken to Paystack to settle ${amount} in full. Wholesale orders have no part-payments; production starts once payment clears.`,
      confirmLabel: `Pay ${amount}`,
    });
    if (!ok) return;
    this.paying.set(true);
    this.payError.set(null);
    this.api.payWithPaystack(inv.orderId, inv.totalAmount).subscribe({
      next: (res) => {
        // Never navigate to an empty URL: a blank authorizationUrl would
        // reload the invoice in place and look like a silent failure.
        if (!res?.authorizationUrl) {
          this.paying.set(false);
          this.payError.set('Paystack returned no checkout URL. Nothing has been charged.');
          return;
        }
        window.location.href = res.authorizationUrl;
      },
      error: (err) => {
        this.paying.set(false);
        this.payError.set(
          err?.error?.message ??
            'Could not reach Paystack. Nothing has been charged. Try again, or call the finance desk.',
        );
      },
    });
  }

  print(): void {
    window.print();
  }

  /** How and when the invoice was settled, for the meta line. */
  settledLine(inv: Invoice): string {
    const p = inv.payments[0];
    return p ? `Settled ${payMethod(inv)} on ${formatDate(p.date)}` : 'Settled';
  }
}
