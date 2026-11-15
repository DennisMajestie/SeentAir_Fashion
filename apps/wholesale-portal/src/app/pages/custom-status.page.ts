import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  SeConfirmService,
  SeCurrencyService,
  SeDatePipe,
  SeMoneyPipe,
  SeToastService,
  formatDate,
} from '@seentair/ui';
import { ApiService, CustomOrder } from '../api.service';
import { WholesaleTabBar } from '../tab-bar';
import { customRef } from '../wholesale-format';

type Quote = { amount: number; note: string | null };

/**
 * One custom design request. At each stage the buyer has at most one
 * decision (accept the quote, approve or reject the sample), so the page
 * leads with that decision and the spec card holds the facts behind it.
 */
@Component({
  selector: 'app-custom-status',
  imports: [RouterLink, SeDatePipe, SeMoneyPipe, WholesaleTabBar],
  template: `
    <div class="stitch">
      <div class="bg-canvas text-light-on-surface min-h-screen pb-28 antialiased selection:bg-accent/20">
        <!-- Header -->
        <header class="px-4 pt-4 pb-3 border-b border-border/70 bg-canvas/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <a routerLink="/custom" class="w-8 h-8 rounded-full bg-light-surface border border-border flex items-center justify-center text-light-primary" aria-label="Back to custom designs">
              <span class="material-symbols-outlined text-[18px]">arrow_back</span>
            </a>
            <div>
              <h1 class="text-[16px] font-bold text-light-primary font-mono">{{ ref }}</h1>
              @if (request(); as req) {
                <span class="text-[11px] text-light-secondary">Submitted {{ formatDate(req.createdAt) }}</span>
              }
            </div>
          </div>
          @if (request(); as req) {
            <span class="stage-badge text-[11px] font-mono px-2.5 py-0.5 rounded-full border font-semibold whitespace-nowrap" [class]="badgeClass(req.status)">{{ statusLabel(req.status).toUpperCase() }}</span>
          }
        </header>

        <!-- Content -->
        <main class="px-4 py-4 flex flex-col gap-4 max-w-[390px] mx-auto w-full">
          @if (loading()) {
            <div aria-busy="true">
              <span class="text-[11px] font-mono text-light-secondary uppercase tracking-wider block mb-2">Loading request…</span>
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
          } @else if (loadError()) {
            <div class="load-error p-3.5 rounded-xl bg-light-surface border border-danger/30 flex items-center justify-between gap-2">
              <div>
                <h2 class="text-[13px] font-bold text-danger">The request could not be loaded</h2>
                <span class="text-[11px] text-light-secondary">{{ loadError() }}</span>
              </div>
              <button type="button" class="px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold flex-shrink-0" (click)="load()">Try again</button>
            </div>
          } @else if (request(); as req) {
            @if (nextStep()) {
              <p class="next-step text-[12px] text-light-secondary px-1">{{ nextStep() }}</p>
            }

            @if (req.reviewNote) {
              <div class="desk-note p-3.5 rounded-xl bg-light-surface border border-border flex items-start gap-2.5">
                <span class="material-symbols-outlined text-[20px] text-accent flex-shrink-0">info</span>
                <div>
                  <strong class="text-[13px] font-bold text-light-primary block">Note from the production desk</strong>
                  <span class="text-[12px] text-light-secondary leading-normal">{{ req.reviewNote }}</span>
                </div>
              </div>
            }

            @if (req.status === 'quoted') {
              <!-- Primary Action: Quotation Card -->
              <section class="quote-card bg-light-surface rounded-xl p-5 border border-accent/40 shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] flex flex-col gap-3 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-accent"></div>
                @if (quote(); as q) {
                  <div class="flex items-start justify-between">
                    <div>
                      <span class="text-[11px] font-bold uppercase tracking-wider text-accent block">Official Aba Factory Quote</span>
                      <h2 class="text-[20px] font-bold text-light-primary leading-tight mt-0.5 font-mono">{{ q.amount | seMoney }}</h2>
                      <span class="text-[12px] text-light-secondary mt-0.5 block">Covers the full {{ req.quantity }}-unit batch all-inclusive</span>
                    </div>
                    <span class="material-symbols-outlined text-[28px] text-accent">price_check</span>
                  </div>

                  <div class="p-3 rounded-lg bg-canvas-tint/70 text-[11px] text-light-primary leading-relaxed">
                    {{ q.note || 'Covers raw material, sewing, branding and packaging.' }}
                    Accepting the quote makes the full amount due upfront. No part-payments.
                  </div>
                } @else {
                  <div class="flex items-start justify-between">
                    <div>
                      <span class="text-[11px] font-bold uppercase tracking-wider text-accent block">Official Aba Factory Quote</span>
                      <span class="text-[12px] text-light-secondary mt-0.5 block">The factory has quoted this request.</span>
                    </div>
                    <span class="material-symbols-outlined text-[28px] text-accent">price_check</span>
                  </div>
                  <button type="button" class="self-start px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold" (click)="loadQuote(req.id)">View quotation</button>
                }
              </section>
            }

            @if (req.status === 'quote_accepted') {
              <div class="pay-banner p-4 rounded-xl bg-warning/15 border border-warning/30 flex items-start gap-2.5">
                <span class="material-symbols-outlined text-[20px] text-warning flex-shrink-0">pending</span>
                <div>
                  <strong class="text-[13px] font-bold text-warning block">Full payment due now</strong>
                  <span class="text-[12px] text-light-secondary leading-normal block">
                    Pay the quoted amount by bank transfer or POS; the desk confirms it, then the
                    approval sample enters production. No part-payments.
                  </span>
                </div>
              </div>
            }

            <!-- Request Facts & Technical Spec -->
            <section class="specs-card bg-light-surface rounded-xl p-4 border border-border flex flex-col gap-3">
              <h3 class="text-[14px] font-bold text-light-primary">Bespoke Specifications</h3>

              @if (req.referenceImageUrl) {
                <!-- Reference Image Preview -->
                <a [href]="req.referenceImageUrl" target="_blank" rel="noopener" class="flex items-center gap-3 p-3 rounded-lg bg-canvas border border-border">
                  <div class="w-16 h-16 rounded-md bg-canvas-tint border border-border flex items-center justify-center flex-shrink-0 relative overflow-hidden">
                    <img [src]="req.referenceImageUrl" alt="Reference image for this custom design request" class="w-full h-full object-cover" />
                  </div>
                  <div>
                    <span class="text-[12px] font-bold text-light-primary block">Reference image</span>
                    <span class="text-[11px] text-light-secondary block">Tap to expand the high-res image</span>
                  </div>
                </a>
              }

              <div class="flex flex-col gap-2 text-[12px]">
                <div class="flex justify-between py-1 border-b border-border/60 gap-3">
                  <span class="text-light-secondary">Silhouette</span>
                  <strong class="text-light-primary text-right">{{ req.description }}</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-border/60 gap-3">
                  <span class="text-light-secondary">Fabric Quality</span>
                  <strong class="text-light-primary text-right">{{ req.fabricQuality }}</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-border/60 gap-3">
                  <span class="text-light-secondary">Colourways</span>
                  <strong class="text-light-primary text-right">{{ req.colours }}</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-border/60 gap-3">
                  <span class="text-light-secondary">Total Units</span>
                  <strong class="font-mono text-light-primary text-right">{{ req.quantity }} units ({{ req.sizes }})</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-border/60 gap-3">
                  <span class="text-light-secondary">Delivery Destination</span>
                  <strong class="text-light-primary text-right">{{ req.location }}</strong>
                </div>
                <div class="flex justify-between py-1 border-b border-border/60 gap-3">
                  <span class="text-light-secondary">Target Completion</span>
                  <strong class="font-mono text-light-primary text-right">{{ formatDate(req.desiredDate) }}</strong>
                </div>
                <div class="flex justify-between py-1 gap-3">
                  <span class="text-light-secondary">Submitted</span>
                  <strong class="font-mono text-light-primary text-right">{{ formatDate(req.createdAt) }}</strong>
                </div>
                @if (req.paidAt) {
                  <div class="flex justify-between py-1 gap-3">
                    <span class="text-light-secondary">Paid</span>
                    <strong class="font-mono text-light-primary text-right">{{ formatDate(req.paidAt) }} (desk-confirmed)</strong>
                  </div>
                }
              </div>
            </section>

            <!-- Activity & Milestone History -->
            <section class="bg-light-surface rounded-xl p-4 border border-border flex flex-col gap-3">
              <h3 class="text-[13px] font-bold text-light-primary">Request Timeline</h3>
              @if (history().length) {
                <div class="relative pl-5 flex flex-col gap-4 text-[12px] before:content-[''] before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  @for (e of history(); track e.at + e.text; let i = $index) {
                    <div class="relative">
                      @if (i === 0) {
                        <span class="absolute -left-5 top-0.5 w-3 h-3 rounded-full bg-accent ring-2 ring-accent/30"></span>
                      } @else if (e.tone === 'success') {
                        <span class="absolute -left-5 top-0.5 w-3 h-3 rounded-full bg-success"></span>
                      } @else {
                        <span class="absolute -left-5 top-0.5 w-3 h-3 rounded-full bg-border"></span>
                      }
                      <strong class="text-light-primary block">{{ e.text }}</strong>
                      <span class="text-[11px] text-light-secondary">{{ e.at | seDate: 'datetime' }}</span>
                    </div>
                  }
                </div>
              } @else {
                <p class="text-[12px] text-light-secondary">No updates yet.</p>
              }
            </section>

            <!-- Approval sample -->
            <section class="sample-card bg-light-surface rounded-xl p-4 border border-border flex flex-col gap-2">
              <h3 class="text-[13px] font-bold text-light-primary">Approval sample</h3>
              @if (req.status === 'sample_in_production') {
                <p class="text-[12px] text-light-secondary leading-normal">
                  The factory is making one physical sample for you to check seams, prints and
                  fabric weight. Once it reaches you, record your decision here: bulk production
                  only starts after your approval.
                </p>
                <div class="pt-2 flex items-center gap-2.5">
                  <button type="button" [disabled]="busy()" class="w-1/2 py-2.5 rounded-full bg-accent text-on-accent text-[12px] font-bold hover:brightness-105 shadow-sm disabled:opacity-50" (click)="approve(req)">
                    Approve sample
                  </button>
                  <button type="button" [disabled]="busy()" class="w-1/2 py-2.5 rounded-full bg-light-surface border border-border text-light-secondary text-[12px] font-semibold hover:bg-canvas disabled:opacity-50" (click)="reject(req)">
                    Request changes
                  </button>
                </div>
              } @else if (samplePassed(req.status)) {
                <p class="text-[12px] text-light-secondary leading-normal">Sample approved. The batch is cleared for production.</p>
              } @else {
                <p class="text-[12px] text-light-secondary leading-normal">
                  Sample production begins after you accept the quote and the desk confirms full
                  payment.
                </p>
              }
            </section>

            <!-- Factory Policy Notice -->
            <div class="p-3 rounded-lg bg-canvas-tint/70 border border-border text-[11px] text-light-secondary leading-normal">
              Bespoke production terms: full payment upfront prior to cut-and-sew scheduling, and custom orders are excluded from the 12-hour returns window. Bespoke pieces are non-refundable once cutting begins.
            </div>
          } @else {
            <div class="empty-state bg-light-surface p-3.5 rounded-xl border border-border flex flex-col items-center gap-1.5 text-center">
              <span class="material-symbols-outlined text-[28px] text-light-secondary">design_services</span>
              <strong class="text-[14px] text-light-primary">Request not found</strong>
              <p class="text-[11px] text-light-secondary">It may have been removed, or the link is wrong.</p>
              <button type="button" class="mt-1 px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold" (click)="router.navigate(['/custom'])">Back to custom designs</button>
            </div>
          }
        </main>

        @if (request(); as req) {
          @if (req.status === 'quoted' && quote(); as q) {
            <!-- Sticky Bottom Quick Action -->
            <aside aria-label="Quotation action" class="fixed bottom-0 left-0 right-0 max-w-[390px] mx-auto bg-light-surface border-t border-border px-4 py-3 flex items-center justify-between shadow-[0_-8px_20px_rgba(27,25,22,0.06)] z-30">
              <div>
                <span class="text-[11px] text-light-secondary block font-medium">Full Amount Due</span>
                <span class="font-mono font-bold text-[18px] text-light-primary">{{ q.amount | seMoney }}</span>
              </div>
              <button type="button" [disabled]="busy()" class="px-6 py-3.5 rounded-full bg-accent text-on-accent font-semibold text-[14px] flex items-center gap-2 shadow-sm hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50" (click)="accept(req, q)">
                <span>Accept quote</span>
                <span class="material-symbols-outlined text-[18px]">verified</span>
              </button>
            </aside>
          }
        }

        <ws-tab-bar />
      </div>
    </div>
  `,
})
export class CustomStatusPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);
  readonly router = inject(Router);
  readonly formatDate = formatDate;

  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly ref = customRef(this.id);

  readonly request = signal<CustomOrder | null>(null);
  readonly quote = signal<Quote | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly busy = signal(false);

  /** What the buyer or the factory does next, in one sentence. */
  readonly nextStep = computed(() => {
    const req = this.request();
    if (!req) return '';
    switch (req.status) {
      case 'submitted':
      case 'under_review':
        return 'The factory is reviewing feasibility; you will be notified when it is quoted.';
      case 'quoted':
        return 'Accept the quotation to move on to payment.';
      case 'quote_accepted':
        return 'Full payment is due now; the sample starts once the desk confirms it.';
      case 'paid':
        return 'Payment confirmed. The factory is preparing your approval sample.';
      case 'sample_in_production':
        return 'Your sample is in production. Approve it or request changes when it arrives.';
      case 'sample_approved':
        return 'Sample approved. The batch is queued for cutting.';
      case 'in_production':
        return 'Your batch is on the factory floor.';
      case 'fulfilled':
      case 'delivered':
        return 'This batch is complete.';
      case 'declined':
        return 'The factory could not take this request.';
      case 'cancelled':
        return 'This request was cancelled.';
      default:
        return '';
    }
  });

  /** Only events with a real timestamp from the API; newest first. */
  readonly history = computed<Array<{ at: string; text: string; tone?: 'success' }>>(() => {
    const req = this.request();
    if (!req) return [];
    const entries: Array<{ at: string; text: string; tone?: 'success' }> = [
      { at: req.createdAt, text: 'Request submitted' },
    ];
    if (req.paidAt) {
      entries.push({
        at: req.paidAt,
        text: 'Full payment confirmed by the desk',
        tone: 'success',
      });
    }
    return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.customOrders().subscribe({
      next: (res) => {
        const req = res.data.find((r) => r.id === this.id) ?? null;
        this.request.set(req);
        this.loading.set(false);
        if (req && !/pending|submitted|under_review|rejected/.test(req.status)) {
          this.api.quotation(req.id).subscribe({
            next: (q) => this.quote.set(q),
            error: () => undefined,
          });
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message ?? 'The server did not respond.');
      },
    });
  }

  samplePassed(status: string): boolean {
    return /sample_approved|in_production|fulfilled|delivered|completed/.test(status);
  }

  loadQuote(id: string): void {
    this.api.quotation(id).subscribe({
      next: (q) => this.quote.set(q),
      error: (err) =>
        this.toast.show(err?.error?.message ?? 'The quotation is not available yet', {
          tone: 'danger',
        }),
    });
  }

  statusLabel(status: string): string {
    const words = status.replaceAll('_', ' ').trim();
    return words ? words[0].toUpperCase() + words.slice(1) : 'Update';
  }

  badgeClass(status: string): string {
    const s = status.toLowerCase();
    if (/quoted|review|pending|submitted|under_review/.test(s)) return 'bg-warning/15 text-warning border-warning/30';
    if (/declined|cancelled|rejected/.test(s)) return 'bg-danger/15 text-danger border-danger/30';
    if (/accepted|paid|approved|production|fulfilled|delivered|completed/.test(s)) return 'bg-success/15 text-success border-success/30';
    return 'bg-canvas-tint text-light-secondary border-border';
  }

  async accept(req: CustomOrder, q: Quote): Promise<void> {
    const amount = this.currency.format(q.amount);
    const ok = await this.confirm.ask({
      title: `Accept the quote of ${amount}?`,
      consequence: `The full ${amount} becomes due upfront by bank transfer or POS. The approval sample starts once the desk confirms payment.`,
      confirmLabel: 'Accept quote',
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.acceptQuote(req.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show(`Quote accepted: settle ${amount} with the desk to start the sample`);
        this.reload();
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.show(err?.error?.message ?? 'The quote could not be accepted', {
          tone: 'danger',
          action: { label: 'Try again', run: () => void this.accept(req, q) },
        });
      },
    });
  }

  async approve(req: CustomOrder): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Approve the sample?',
      consequence: `This authorises bulk production of the ${req.quantity}-unit batch and locks the cutting schedule.`,
      confirmLabel: 'Approve sample',
    });
    if (!ok) return;
    this.decide(req, true, undefined);
  }

  async reject(req: CustomOrder): Promise<void> {
    const note = await this.confirm.askWithReason({
      title: 'Request changes to the sample?',
      consequence:
        'The factory reworks the sample from your notes. Bulk production does not start until you approve a sample.',
      confirmLabel: 'Request changes',
      reasonLabel: 'What needs to change',
      danger: true,
    });
    if (note === null) return;
    this.decide(req, false, note.trim() || undefined);
  }

  private decide(req: CustomOrder, approved: boolean, note: string | undefined): void {
    this.busy.set(true);
    this.api.decideSample(req.id, approved, note).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show(
          approved
            ? `Sample approved: the ${req.quantity}-unit batch is authorised for production`
            : 'Changes requested: the factory will rework the sample',
        );
        this.reload();
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.show(err?.error?.message ?? 'Your decision could not be recorded', {
          tone: 'danger',
        });
      },
    });
  }

  private reload(): void {
    this.api.customOrders().subscribe({
      next: (res) => this.request.set(res.data.find((r) => r.id === this.id) ?? null),
      error: () => undefined,
    });
  }
}
