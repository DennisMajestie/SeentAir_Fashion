import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SeCurrencyService, SeToastService, formatDate } from '@seentair/ui';
import { ApiService, Invoice, Pricing } from '../api.service';
import { CartService } from '../cart.service';
import { pill } from '../status-pill';
import {
  PIPELINE,
  isClosed,
  isPaid,
  orderRef,
  payMethod,
  pipelineStep,
  summarise,
  units,
} from '../wholesale-format';

/**
 * W2 Dashboard, carried verbatim from the Stitch screen. Every figure comes
 * from the API (auth/me, wholesale/pricing, wholesale/invoices, notifications);
 * nothing is invented.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <div class="stitch">
      <div class="bg-canvas text-light-on-surface min-h-screen md:bg-transparent pb-24 antialiased md:pb-8 selection:bg-accent/20">
        <header class="px-4 pt-4 pb-3 flex items-center justify-between border-b border-border/70 bg-canvas/90 backdrop-blur-md sticky top-0 z-30 md:hidden">
          <div class="flex items-center gap-2.5">
            <img class="vessa-logo vessa-logo--light h-9 w-auto" src="assets/logo-light.png" alt="Seentair — Style for Everyone" width="834" height="299" />
            <img class="vessa-logo vessa-logo--dark h-9 w-auto" src="assets/logo-dark.png" alt="" aria-hidden="true" width="243" height="78" />
            <div>
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-canvas-tint text-light-primary border border-border">WHOLESALE</span>
              </div>
              <span class="text-[11px] text-light-secondary font-medium block">Aba Industrial Line</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <a routerLink="/cart" class="w-9 h-9 rounded-full bg-light-surface border border-border flex items-center justify-center text-light-primary relative" aria-label="Bulk cart">
              <span class="material-symbols-outlined text-[18px]">shopping_bag</span>
              @if (cart.units() > 0) {
                <span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent text-on-accent text-[10px] font-bold flex items-center justify-center">{{ cart.units() }}</span>
              }
            </a>
            <div class="w-8 h-8 rounded-full bg-accent/20 text-warning font-bold text-[12px] flex items-center justify-center border border-accent/30">
              {{ initials() }}
            </div>
          </div>
        </header>

        <main class="px-4 py-4 flex flex-col gap-4 max-w-[390px] mx-auto w-full md:max-w-5xl">
          <!-- Greeting & Buyer Tier Card -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)]">
            <div class="flex items-start justify-between">
              <div>
                <span class="text-[12px] text-light-secondary font-medium">Welcome back,</span>
                <h1 class="text-[18px] font-bold text-light-primary">{{ buyerName() ?? 'Wholesale buyer' }}</h1>
              </div>
              <span [class]="tierPillClass()">
                <span class="w-1.5 h-1.5 rounded-full" [class.bg-accent]="approved()" [class.bg-warning]="!approved()"></span>
                {{ tierLine() }}
              </span>
            </div>
            <div class="mt-3 pt-3 border-t border-border flex items-center justify-between text-[12px]">
              <span class="ws-tier text-light-secondary flex items-center gap-1">
                <span class="material-symbols-outlined text-[15px] text-accent">rule</span>
                {{ accountLine() }}
              </span>
              <span [class]="approved() ? 'text-success font-semibold flex items-center gap-1' : 'text-warning font-semibold flex items-center gap-1'">
                <span class="w-1.5 h-1.5 rounded-full" [class.bg-success]="approved()" [class.bg-warning]="!approved()"></span>
                {{ approved() ? 'Active Verified' : 'Pending review' }}
              </span>
            </div>
          </section>

          <!-- Alert Banner: Payment Due -->
          @if (summary().awaitingPayment > 0) {
            <button type="button" class="pay-alert p-3.5 rounded-xl bg-warning/10 border border-warning/30 flex items-center justify-between active:scale-[0.99] transition-all text-left w-full" (click)="router.navigate(['/orders'])">
              <div class="flex items-center gap-2.5">
                <span class="w-8 h-8 rounded-full bg-warning/20 text-warning flex items-center justify-center flex-shrink-0">
                  <span class="material-symbols-outlined text-[18px]">receipt_long</span>
                </span>
                <div>
                  <h2 class="text-[13px] font-bold text-warning">{{ paymentHeadline() }}</h2>
                  <span class="text-[11px] text-light-secondary">{{ summary().next }}</span>
                </div>
              </div>
              <span class="text-[12px] font-bold text-warning flex items-center gap-0.5">
                View
                <span class="material-symbols-outlined text-[16px]">chevron_right</span>
              </span>
            </button>
          }

          <!-- 4 Metric Cards (2x2 Grid) -->
          <section class="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <div class="bg-light-surface p-3.5 rounded-xl border border-border flex flex-col justify-between">
              <div class="flex items-center justify-between text-light-secondary text-[11px]">
                <span>Open Orders</span>
                <span class="material-symbols-outlined text-[16px] text-accent">inventory_2</span>
              </div>
              <div class="mt-2">
                <span class="text-[22px] font-bold text-light-primary leading-none block">{{ summary().open }}</span>
                <span class="text-[11px] text-light-secondary mt-1 block">{{ stageLine() }}</span>
              </div>
            </div>

            <div class="bg-light-surface p-3.5 rounded-xl border border-border flex flex-col justify-between">
              <div class="flex items-center justify-between text-light-secondary text-[11px]">
                <span>Awaiting Payment</span>
                <span class="material-symbols-outlined text-[16px] text-warning">pending</span>
              </div>
              <div class="mt-2">
                <span [class]="summary().awaitingPayment > 0 ? 'text-[22px] font-bold text-warning leading-none block' : 'text-[22px] font-bold text-light-primary leading-none block'">
                  {{ summary().awaitingPayment === 0 ? 'Clear' : summary().awaitingPayment }}
                </span>
                <span class="text-[11px] text-light-secondary mt-1 block">{{ summary().awaitingPayment === 0 ? 'Nothing to pay' : 'Full payment upfront' }}</span>
              </div>
            </div>

            <div class="bg-light-surface p-3.5 rounded-xl border border-border flex flex-col justify-between">
              <div class="flex items-center justify-between text-light-secondary text-[11px]">
                <span>In Transit</span>
                <span class="material-symbols-outlined text-[16px] text-success">local_shipping</span>
              </div>
              <div class="mt-2">
                <span class="text-[22px] font-bold text-light-primary leading-none block">{{ summary().inTransit }}</span>
                <span class="text-[11px] text-light-secondary mt-1 block">With the courier</span>
              </div>
            </div>

            <div class="bg-light-surface p-3.5 rounded-xl border border-border flex flex-col justify-between">
              <div class="flex items-center justify-between text-light-secondary text-[11px]">
                <span>Last Batch</span>
                <span class="material-symbols-outlined text-[16px] text-light-secondary">history</span>
              </div>
              <div class="mt-2">
                <span class="text-[18px] font-bold text-light-primary leading-tight block">{{ lastOrder() ? formatDate(lastOrder()!.createdAt) : 'None yet' }}</span>
                @if (lastOrder()) {
                  <span class="text-[11px] text-success font-semibold mt-0.5 block">{{ statusLabel(lastOrder()!.status) }} ({{ units(lastOrder()!) }}u)</span>
                }
              </div>
            </div>
          </section>

          <!-- Batch Progress Card: 4-Step Pipeline -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)]">
            <div class="flex items-center justify-between mb-2">
              <h2 class="text-[13px] font-bold text-light-primary">Latest batch progress</h2>
              <span class="text-[11px] font-mono text-light-secondary">{{ lastOrder() ? orderRef(lastOrder()!.orderId) : '—' }}</span>
            </div>
            <p class="text-[12px] text-light-secondary mb-3">{{ summary().next }}</p>

            <div
              class="track relative flex items-center justify-between pt-2 pb-1"
              role="progressbar"
              [attr.aria-label]="'Batch progress: ' + stageLine()"
              aria-valuemin="0"
              [attr.aria-valuemax]="pipeline.length"
              [attr.aria-valuenow]="step() + 1"
            >
              <div class="absolute left-3 right-3 top-4 h-0.5 bg-border -z-0"></div>
              <div class="absolute left-3 top-4 h-0.5 bg-accent -z-0" [style.width.%]="fillPercent()"></div>

              @for (s of pipeline; track s.key; let i = $index) {
                <div class="flex flex-col items-center gap-1 z-10">
                  <span [class]="trackNodeClass(i)" [class.track-on]="i <= step()">
                    @if (i < step()) { ✓ } @else { {{ i + 1 }} }
                  </span>
                  <span [class]="trackLabelClass(i)">{{ s.label }}</span>
                </div>
              }
            </div>
          </section>

          <!-- Recent Orders List -->
          <section class="flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <h2 class="text-[15px] font-bold text-light-primary">Recent Orders</h2>
              <a routerLink="/orders" class="text-[12px] font-semibold text-accent hover:underline">View all</a>
            </div>

            @if (loading()) {
              <div class="bg-light-surface p-3.5 rounded-xl border border-border text-[12px] text-light-secondary" aria-busy="true">Loading orders…</div>
            } @else if (error()) {
              <div class="load-error bg-light-surface p-3.5 rounded-xl border border-border flex flex-col gap-2">
                <p class="text-[13px] text-light-primary">{{ error() }}</p>
                <button type="button" class="self-start px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold" (click)="load()">Try again</button>
              </div>
            } @else if (recent().length === 0) {
              <div class="bg-light-surface p-3.5 rounded-xl border border-border flex flex-col items-center gap-1.5 text-center">
                <strong class="text-[14px] text-light-primary">No orders yet</strong>
                <p class="text-[11px] text-light-secondary">Your first wholesale batch will appear here.</p>
                <a routerLink="/catalogue" class="mt-1 px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold">Browse catalogue</a>
              </div>
            } @else {
              @for (inv of recent(); track inv.orderId) {
                <article class="order-row bg-light-surface p-3.5 rounded-xl border border-border flex flex-col gap-2.5">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="font-mono font-bold text-[13px] text-light-primary">{{ orderRef(inv.orderId) }}</span>
                      <span class="text-[11px] text-light-secondary">{{ formatDate(inv.createdAt) }}</span>
                    </div>
                    <span [class]="statusPillClass(pill(inv.paymentStatus))">
                      {{ inv.paymentStatus === 'paid' ? 'Paid' : 'Payment Due' }}
                    </span>
                  </div>

                  <div class="flex items-center justify-between text-[13px]">
                    <span class="text-light-secondary">{{ units(inv) }} units</span>
                    <span class="font-bold font-mono text-light-primary">{{ currency.format(inv.totalAmount) }}</span>
                  </div>

                  <div class="flex items-center justify-between pt-2 border-t border-border gap-2 flex-wrap">
                    @if (!isPaid(inv) && !isClosed(inv)) {
                      <span class="text-[11px] text-light-secondary">Status: {{ statusLabel(inv.status) }}</span>
                      <button type="button" class="px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold hover:brightness-105" (click)="openInvoice(inv)">
                        Pay now
                      </button>
                    } @else {
                      <span class="text-[11px] text-success font-medium">{{ isPaid(inv) ? '100% Paid • ' + payMethod(inv) : statusLabel(inv.status) }}</span>
                      <a [routerLink]="['/orders', inv.orderId, 'tracking']" class="px-3 py-1.5 rounded-full bg-light-surface-variant border border-border text-light-primary text-[12px] font-semibold">
                        Track batch
                      </a>
                    }
                    <button type="button" class="px-3 py-1.5 rounded-full bg-light-surface border border-border text-light-primary text-[12px] font-semibold" (click)="reorder(inv)">
                      Reorder
                    </button>
                  </div>
                </article>
              }
            }
          </section>

          @if (notices().length > 0) {
            <section class="bg-light-surface rounded-xl p-4 border border-border flex flex-col gap-2.5">
              <h2 class="text-[13px] font-bold text-light-primary">Desk notices</h2>
              <ul class="flex flex-col gap-2.5">
                @for (n of noticeEntries(); track $index) {
                  <li class="text-[12px] text-light-primary">
                    <strong class="font-semibold">{{ n.actor }}</strong>
                    <span class="text-[11px] text-light-secondary"> • {{ formatDate(n.at) }}</span>
                    <p class="mt-0.5">{{ n.text }}</p>
                  </li>
                }
              </ul>
            </section>
          }

          <!-- Factory Desk Contact Card -->
          <section class="bg-canvas-tint/70 p-4 rounded-xl border border-border flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-light-primary text-accent flex items-center justify-center">
                <span class="material-symbols-outlined text-[20px]">support_agent</span>
              </div>
              <div>
                <h2 class="text-[13px] font-bold text-light-primary">Seentair Wholesale Desk</h2>
                <span class="text-[11px] text-light-secondary">Your orders and invoices are always available here</span>
              </div>
            </div>
            <a routerLink="/orders" class="w-9 h-9 rounded-full bg-light-surface border border-border flex items-center justify-center text-light-primary hover:bg-canvas" aria-label="View orders">
              <span class="material-symbols-outlined text-[18px]">receipt_long</span>
            </a>
          </section>
        </main>

      </div>
    </div>
  `,
  styles: [`:host { display: block; }`],
})
export class HomePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(SeToastService);
  readonly currency = inject(SeCurrencyService);
  readonly cart = inject(CartService);
  readonly router = inject(Router);

  readonly formatDate = formatDate;
  readonly pipeline = PIPELINE;
  readonly isPaid = isPaid;
  readonly isClosed = isClosed;
  readonly orderRef = orderRef;
  readonly units = units;
  readonly payMethod = payMethod;
  readonly pill = pill;

  readonly buyerName = signal<string | null>(null);
  readonly pricing = signal<Pricing | null>(null);
  readonly approved = signal(false);
  readonly invoices = signal<Invoice[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notices = signal<Array<{ id: string; type: string; message: string; sentAt: string }>>(
    [],
  );

  readonly summary = computed(() => summarise(this.invoices()));
  readonly step = computed(() => pipelineStep(this.invoices()));
  readonly recent = computed(() => this.invoices().slice(0, 5));
  readonly lastOrder = computed(() => this.invoices()[0] ?? null);

  readonly initials = computed(() => {
    const name = this.buyerName() ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'WH';
    return parts
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  });

  /** Tier pill: the account's tier and its cut, or where vetting stands. */
  readonly tierLine = computed(() => {
    const p = this.pricing();
    if (!this.approved() || !p?.tier) return 'Pending review';
    const d = p.tier.discountPercent;
    return p.hasDiscount && d ? `${p.tier.name} (${d}% Cut)` : (p.tier.name ?? 'Tier assigned');
  });

  readonly tierPillClass = computed(() => {
    const base =
      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold text-[11px] border';
    return this.approved()
      ? `${base} bg-accent/15 text-warning border-accent/25`
      : `${base} bg-warning/15 text-warning border-warning/25`;
  });

  /** Tier, discount and batch minimum in one line; or where the application stands. */
  readonly accountLine = computed(() => {
    const p = this.pricing();
    if (!p) return 'Your wholesale application is being reviewed. Prices show once it is approved.';
    const parts = [p.tier?.name ?? 'Standard tier'];
    if (p.tier && p.hasDiscount) parts.push(`${p.tier.discountPercent}% off retail`);
    if (p.moq > 0) parts.push(`${p.moq}-unit minimum per batch`);
    return parts.join(' • ');
  });

  readonly noticeEntries = computed(() =>
    this.notices().map((n) => ({
      at: n.sentAt,
      text: n.message,
      actor: n.type.replaceAll('_', ' '),
    })),
  );

  /** Width of the accent segment under the pipeline track, in percent. */
  readonly fillPercent = computed(() =>
    this.step() < 0 ? 0 : ((this.step() + 1) / this.pipeline.length) * 100,
  );

  trackNodeClass(i: number): string {
    const base =
      'w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center bg-light-surface border-2 border-border text-light-secondary font-semibold';
    if (i <= this.step()) return base.replace('border-2 border-border text-light-secondary font-semibold', 'bg-accent text-on-accent border-accent');
    return base;
  }

  trackLabelClass(i: number): string {
    if (i === this.step())
      return 'text-[10px] font-bold text-accent';
    if (i < this.step()) return 'text-[10px] font-semibold text-light-primary';
    return 'text-[10px] font-medium text-light-secondary';
  }

  statusPillClass(tone: string): string {
    const base = 'px-2 py-0.5 rounded-full text-[11px] font-semibold';
    if (tone === 'ok') return `${base} bg-success/15 text-success`;
    if (tone === 'warn') return `${base} bg-warning/15 text-warning`;
    if (tone === 'bad') return `${base} bg-danger/15 text-danger`;
    return `${base} bg-canvas-tint text-light-primary border border-border`;
  }

  ngOnInit(): void {
    this.api.me().subscribe({ next: (m) => this.buyerName.set(m.name), error: () => undefined });
    this.api.pricing().subscribe({
      next: (p) => {
        this.pricing.set(p);
        this.approved.set(true);
      },
      error: () => this.approved.set(false),
    });
    this.api.notifications().subscribe({
      next: (r) => this.notices.set(r.data.slice(0, 3)),
      error: () => undefined,
    });
    this.load();
  }

  load(): void {
    this.api.invoices(1, 100).subscribe({
      next: (r) => {
        this.invoices.set(r.data);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (this.invoices().length === 0) {
          this.error.set(err?.error?.message ?? 'The server did not respond.');
        }
      },
    });
  }

  /** "Shipped • 2 open orders", or "Nothing in flight". */
  stageLine(): string {
    const step = this.step();
    if (step < 0) return 'Nothing in flight';
    const n = this.summary().open;
    return `${PIPELINE[step].label} • ${n} open ${n === 1 ? 'order' : 'orders'}`;
  }

  statusLabel(status: string): string {
    const words = status.replaceAll('_', ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  paymentHeadline(): string {
    const { awaitingPayment } = this.summary();
    const total = this.invoices().length;
    return `${awaitingPayment} of ${total} ${total === 1 ? 'order' : 'orders'} awaiting payment`;
  }

  openInvoice(invoice: Invoice): void {
    void this.router.navigate(['/orders', invoice.orderId, 'invoice']);
  }

  reorder(invoice: Invoice): void {
    this.api.reorder(invoice.orderId).subscribe({
      next: (order) => {
        this.toast.show(`Reorder ${orderRef(order.id)} placed at your current tier`, {
          action: { label: 'View', run: () => this.openInvoice({ ...invoice, orderId: order.id }) },
        });
        this.load();
      },
      error: (err) =>
        this.toast.show(err?.error?.message ?? 'The reorder could not be placed', {
          tone: 'danger',
          action: { label: 'Try again', run: () => this.reorder(invoice) },
        }),
    });
  }
}
