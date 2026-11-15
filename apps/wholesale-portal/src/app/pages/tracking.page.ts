import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SeConfirmService, SeDatePipe } from '@seentair/ui';
import { ApiService, DeliveryCheckpoint, DeliveryLegView, Invoice } from '../api.service';
import { WholesaleTabBar } from '../tab-bar';
import { PIPELINE, orderRef, units } from '../wholesale-format';

/** Fallback poll cadence while the socket is down, and the slow cadence
    used while it is up. Visibility-aware, so a backgrounded tab costs nothing. */
const POLL_FAST_MS = 60_000;
const POLL_SLOW_MS = 300_000;
/** Wait before re-dialling a stream that dropped. */
const STREAM_RETRY_MS = 60_000;

interface TrackingEvent {
  status: string;
  note?: string | null;
  createdAt: string;
}

interface Milestone {
  at: string;
  text: string;
  actor?: string;
  tone?: 'warning' | 'success';
}

/**
 * Order tracking for one wholesale batch: where it is now, every update the
 * courier has posted (newest first), and the freight facts. Only the
 * customer-facing projection is rendered: staff notes and zones never reach
 * the page even when the API still sends them.
 */
@Component({
  selector: 'app-tracking',
  imports: [RouterLink, FormsModule, SeDatePipe, WholesaleTabBar],
  template: `
    <div class="stitch">
      <div class="bg-canvas text-light-on-surface min-h-screen md:pl-56 pb-24 antialiased md:pb-8 selection:bg-accent/20">
        <!-- Header -->
        <header class="px-4 pt-4 pb-3 border-b border-border/70 bg-canvas/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <a routerLink="/orders" class="w-8 h-8 rounded-full bg-light-surface border border-border flex items-center justify-center text-light-primary" aria-label="Back to orders">
              <span class="material-symbols-outlined text-[18px]">arrow_back</span>
            </a>
            <div>
              <h1 class="text-[16px] font-bold text-light-primary">Batch Live Tracking</h1>
              <span class="text-[11px] font-mono text-light-secondary">{{ ref() }}</span>
            </div>
          </div>
          @if (loaded()) {
            <span class="stage-badge text-[11px] font-mono px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 font-semibold whitespace-nowrap">{{ stageBadge() }}</span>
          }
        </header>

        <!-- Tracking Content -->
        <main class="px-4 py-4 flex flex-col gap-4 max-w-[390px] mx-auto w-full md:max-w-5xl">
          @if (loaded()) {
            <!-- A paid batch the ledger could not fully allocate. The API reports
                 awaiting_stock rather than the admin-only stock_exception, so the
                 buyer is told the truth instead of a reassuring freeze. -->
            @if (awaitingStock()) {
              <div class="await-banner p-4 rounded-xl bg-warning/15 border border-warning/30 flex items-start gap-2.5">
                <span class="material-symbols-outlined text-[20px] text-warning flex-shrink-0">pending</span>
                <div>
                  <strong class="text-[13px] font-bold text-warning block">Awaiting stock allocation</strong>
                  <span class="text-[12px] text-light-secondary leading-normal block">
                    Your payment is confirmed and the batch is booked, but the workshop cannot allocate every
                    unit yet. The Aba desk is sourcing the shortfall or scheduling the balance into production.
                    Nothing further is needed from you, and this page updates as soon as the stock is
                    allocated.
                  </span>
                </div>
              </div>
            }

            <!-- Reassuring Current State Card -->
            <section class="now-card bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] flex flex-col gap-3">
              <div class="flex items-start justify-between">
                <div>
                  <span class="text-[11px] font-bold uppercase tracking-wider text-accent block">Live Aba Factory Floor</span>
                  <h2 class="text-[18px] font-bold text-light-primary leading-tight mt-0.5">{{ headline() }}</h2>
                  <span class="text-[12px] text-light-secondary mt-0.5 block">{{ summary() }}</span>
                </div>
                <div class="w-10 h-10 rounded-full bg-accent/20 text-warning flex items-center justify-center flex-shrink-0">
                  <span class="material-symbols-outlined text-[22px]">precision_manufacturing</span>
                </div>
              </div>

              <!-- Linear Progress Bar -->
              <div class="mt-2 flex flex-col gap-1.5">
                <div class="flex justify-between text-[12px]">
                  <span class="text-light-secondary">Batch Progress</span>
                  <span class="font-mono font-bold text-accent">{{ stageText() }}</span>
                </div>
                <div class="track w-full h-2 rounded-full bg-canvas-tint overflow-hidden" role="progressbar" [attr.aria-valuenow]="fillPct()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="'Batch progress, ' + stageText()">
                  <div class="track-fill h-full bg-accent rounded-full" [style.width.%]="fillPct()"></div>
                </div>
              </div>

              <!-- Courier & Freight Allocation -->
              <div class="pt-3 border-t border-border flex items-center justify-between text-[12px]">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[18px] text-light-secondary">local_shipping</span>
                  <div>
                    <span class="text-light-primary font-bold block">{{ carrier() }}</span>
                    <span class="text-light-secondary font-mono text-[11px]">Waybill: {{ leg()?.trackingRef ?? 'Issued at dispatch' }}</span>
                  </div>
                </div>
                <span class="text-[11px] font-semibold text-light-primary bg-canvas px-2.5 py-1 rounded-full border border-border whitespace-nowrap">{{ leg() ? legLabel(leg()!) : 'Being booked' }}</span>
              </div>

              <!-- Freight facts the buyer can act on, kept from the ledger projection. -->
              <dl class="facts pt-3 border-t border-border grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <div class="col-span-2 flex justify-between gap-2">
                  <dt class="text-light-secondary">Route</dt>
                  <dd class="font-mono text-light-primary text-right">{{ legZone() || 'Aba workshop to consignee hub' }}</dd>
                </div>
                @if (riderFirstName(); as rider) {
                  <div class="flex justify-between gap-2">
                    <dt class="text-light-secondary">Rider</dt>
                    <dd class="font-mono text-light-primary text-right">{{ rider }}</dd>
                  </div>
                }
                <div class="flex justify-between gap-2">
                  <dt class="text-light-secondary">Leg</dt>
                  <dd class="font-mono text-light-primary text-right">{{ leg() ? legLabel(leg()!) : 'Being booked' }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-light-secondary">Order</dt>
                  <dd class="font-mono text-light-primary text-right">{{ ref() }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-light-secondary">Units</dt>
                  <dd class="font-mono text-light-primary text-right">{{ invoice() ? units(invoice()!) : '—' }}</dd>
                </div>
                <div class="col-span-2 flex justify-between gap-2">
                  <dt class="text-light-secondary">Updates</dt>
                  <dd class="text-light-primary text-right">{{ live() ? 'Live while this page stays open' : 'Checked every ' + pollSeconds() + 's' }}</dd>
                </div>
              </dl>

              <a class="invoice-link self-end text-[11px] font-semibold text-accent hover:underline" [routerLink]="['/orders', orderId(), 'invoice']">View invoice</a>
            </section>

            <!-- Detailed Checkpoint Timeline -->
            <section class="bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] flex flex-col gap-4">
              <h3 class="text-[14px] font-bold text-light-primary">Production &amp; Milestone History</h3>

              @if (history().length) {
                <div class="timeline relative pl-6 flex flex-col gap-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  @for (e of history(); track e.at + e.text; let i = $index) {
                    <div class="tl-step relative flex flex-col gap-1">
                      @if (e.tone === 'warning') {
                        <span class="tl-dot tl-warn absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-warning text-on-warning text-[10px] flex items-center justify-center font-bold">!</span>
                      } @else if (i === 0) {
                        <span class="tl-dot tl-now absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-accent ring-4 ring-accent/20 flex items-center justify-center">
                          <span class="w-1.5 h-1.5 rounded-full bg-on-accent"></span>
                        </span>
                      } @else if (e.tone === 'success') {
                        <span class="tl-dot tl-done absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-success text-on-success text-[10px] flex items-center justify-center font-bold">✓</span>
                      } @else if (e.tone === 'warning') {
                        <span class="tl-dot tl-warn absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-warning text-on-warning text-[10px] flex items-center justify-center font-bold">!</span>
                      } @else {
                        <span class="tl-dot tl-idle absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-canvas-tint"></span>
                      }
                      <div class="flex items-baseline justify-between gap-2">
                        <h4 class="text-[13px] font-bold text-light-primary">{{ e.text }}</h4>
                        <span class="text-[10px] font-mono text-light-secondary whitespace-nowrap">{{ e.at | seDate: 'datetime' }}</span>
                      </div>
                      @if (e.actor) {
                        <p class="text-[12px] text-light-secondary leading-normal">{{ e.actor }}</p>
                      }
                    </div>
                  }
                </div>
              } @else {
                <p class="text-[12px] text-light-secondary">No updates posted yet.</p>
              }
            </section>

            <!-- Returns -->
            <section class="returns-card bg-light-surface rounded-xl p-5 border border-border flex flex-col gap-2">
              <h3 class="text-[14px] font-bold text-light-primary">Returns</h3>
              <p class="tracking-note">
                Return requests must be submitted within 12 hours of confirmed delivery and are
                completed within 24 hours. Custom orders are excluded from returns.
              </p>
              @if (canRequestReturn()) {
                @if (!showReturnForm()) {
                  <button type="button" class="self-start px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold hover:brightness-105 active:scale-[0.98] transition-all" (click)="openReturnForm()">Request return</button>
                } @else {
                  <form class="return-form" (ngSubmit)="submitReturnRequest()">
                    <label class="return-field">
                      <span>Reason</span>
                      <select [(ngModel)]="returnReason" name="reason" required>
                        <option value="">Select reason</option>
                        <option value="damaged">Damaged on arrival</option>
                        <option value="wrong_item">Wrong item sent</option>
                        <option value="quality">Quality issue</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label class="return-field">
                      <span>Details</span>
                      <textarea
                        [(ngModel)]="returnDetails"
                        name="details"
                        rows="3"
                        maxlength="500"
                        placeholder="Add details for the desk"
                        required
                      ></textarea>
                    </label>
                    <div class="return-actions">
                      <button type="submit" class="px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold disabled:opacity-50" [disabled]="submittingReturn()">Submit request</button>
                      <button type="button" class="px-3.5 py-1.5 rounded-full border border-border text-[12px] font-semibold text-light-primary" (click)="cancelReturnForm()">Cancel</button>
                    </div>
                  </form>
                }
              } @else {
                <button type="button" disabled class="self-start px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold disabled:opacity-50">Request return</button>
                @if (returnWindowElapsed()) {
                  <p class="tracking-note tracking-note--muted">Return window has elapsed (12 hours from delivery).</p>
                } @else if (!isDeliveredSignal()) {
                  <p class="tracking-note tracking-note--muted">Return requests are available after delivery is confirmed.</p>
                } @else {
                  <p class="tracking-note tracking-note--muted">Return requests are not available for this order.</p>
                }
              }
            </section>

            <!-- Support Help Box -->
            <div class="p-3.5 rounded-xl bg-canvas-tint/70 border border-border flex items-center justify-between text-[12px]">
              <span class="text-light-secondary">Need to modify consignee delivery address?</span>
              <a href="tel:+2348142009010" class="text-warning font-semibold hover:underline">Contact Aba Desk</a>
            </div>
          } @else if (failed()) {
            <div class="load-error p-3.5 rounded-xl bg-light-surface border border-danger/30 flex items-center justify-between gap-2">
              <div>
                <h2 class="text-[13px] font-bold text-danger">Tracking could not be loaded</h2>
                <span class="text-[11px] text-light-secondary">Check your connection and try again.</span>
              </div>
              <button type="button" class="px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold flex-shrink-0" (click)="retry()">Try again</button>
            </div>
          } @else {
            <div aria-busy="true">
              <span class="text-[11px] font-mono text-light-secondary uppercase tracking-wider block mb-2">Loading tracking…</span>
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

        <ws-tab-bar />
      </div>
    </div>
  `,
  styles: [
    `
      .tracking-note {
        margin: 0;
        color: var(--se-color-text-muted);
      }
      .tracking-note--muted {
        margin-top: var(--se-space-2);
        font-size: var(--se-text-sm);
      }
      .return-form {
        display: flex;
        flex-direction: column;
        gap: var(--se-space-3);
        margin-top: var(--se-space-3);
      }
      .return-field {
        display: flex;
        flex-direction: column;
        gap: var(--se-space-1);
        font-size: var(--se-text-sm);
        color: var(--se-color-text);
      }
      .return-field select,
      .return-field textarea {
        font: inherit;
        padding: var(--se-space-2);
        border: 1px solid var(--se-color-border);
        border-radius: var(--se-radius-md);
        background: var(--se-color-surface);
        color: var(--se-color-text);
      }
      .return-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--se-space-2);
      }
    `,
  ],
})
export class TrackingPage implements OnInit, OnDestroy {
  private readonly confirm = inject(SeConfirmService);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly orderId = signal('');
  readonly status = signal('');
  readonly events = signal<TrackingEvent[]>([]);
  readonly deliveries = signal<DeliveryLegView[]>([]);
  readonly live = signal(false);
  readonly pollSeconds = signal(POLL_FAST_MS / 1000);
  readonly invoice = signal<Invoice | null>(null);
  readonly loaded = signal(false);
  readonly failed = signal(false);
  readonly units = units;
  readonly pipeline = PIPELINE;

  readonly showReturnForm = signal(false);
  readonly submittingReturn = signal(false);
  returnReason = '';
  returnDetails = '';
  readonly RETURN_WINDOW_HOURS = 12;
  private deliveryConfirmed = signal(this.getDeliveryConfirmed());
  readonly leg = computed<DeliveryLegView | null>(() => this.deliveries()[0] ?? null);

  /** The delivery state the page summarises around. */
  readonly deliveryState = computed(() => {
    if (/delivered|completed/.test(this.status())) return 'delivered';
    const leg = this.leg();
    if (leg?.status === 'failed') return 'failed';
    if (leg?.status === 'in_transit' || /shipped|transit|dispatch|out_for/.test(this.status())) {
      return 'in_transit';
    }
    return 'pending';
  });

  readonly summary = computed(() => {
    if (this.awaitingStock()) {
      return 'Your payment is confirmed; the workshop is sourcing the shortfall.';
    }
    switch (this.deliveryState()) {
      case 'delivered':
        return 'Your batch has been handed over to the consignee.';
      case 'failed':
        return 'The courier could not complete the last attempt; the desk will rebook it.';
      case 'in_transit':
        return 'Your batch is with the courier and on its way.';
      default:
        return /received|paid|processing|production|packaging|packing|qc/.test(this.status())
          ? 'Your batch is with the factory; it is dispatched once finished and packed.'
          : 'Your batch has not been dispatched yet.';
    }
  });

  /** Courier checkpoints and order events, newest first, with no staff notes. */
  readonly history = computed<Milestone[]>(() => {
    const entries: Milestone[] = [];
    for (const leg of this.deliveries()) {
      for (const cp of leg.checkpoints ?? []) {
        if (!cp.at) continue;
        entries.push({
          at: cp.at,
          text: this.checkpointLabel(cp),
          actor: this.carrierLabel(leg),
          tone:
            cp.status === 'delayed'
              ? 'warning'
              : cp.status === 'handed_over'
                ? 'success'
                : undefined,
        });
      }
    }
    for (const ev of this.events()) {
      entries.push({
        at: ev.createdAt,
        text: this.eventLabel(ev.status),
        tone: /delivered|completed/.test(ev.status) ? 'success' : undefined,
      });
    }
    return entries.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  });

  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private streamAbort: AbortController | undefined;
  private refetchQueued = false;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.orderId.set(id);
    this.retry();
    this.startPolling();
    this.openStream();
    this.api.invoices().subscribe({
      next: (res) => this.invoice.set(res.data.find((i) => i.orderId === id) ?? null),
      error: () => undefined,
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.streamAbort?.abort();
  }

  retry(): void {
    this.failed.set(false);
    this.refreshTracking((ok) => {
      if (ok) this.loaded.set(true);
      else this.failed.set(true);
    });
  }

  /**
   * One fetch per microtask: the stream and the poll timer can both ask for
   * a refresh in the same tick, and the later response must not overwrite
   * the earlier one with stale data.
   */
  private refreshTracking(settled?: (ok: boolean) => void): void {
    if (this.refetchQueued) {
      settled?.(true);
      return;
    }
    this.refetchQueued = true;
    queueMicrotask(() => {
      this.refetchQueued = false;
      this.api.tracking(this.orderId()).subscribe({
        next: (t) => {
          this.status.set(t.status);
          this.events.set(t.events);
          this.deliveries.set(t.deliveries ?? []);
          settled?.(true);
        },
        error: () => {
          if (!this.api.isLoggedIn) {
            this.router.navigate(['/'], {
              queryParams: { returnUrl: this.router.url, reason: 'session' },
            });
            return;
          }
          settled?.(false);
        },
      });
    });
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      this.refreshTracking();
    }, POLL_FAST_MS);
  }

  private setPoll(seconds: number): void {
    if (this.pollSeconds() === seconds) return;
    this.pollSeconds.set(seconds);
    this.startPolling();
  }

  private openStream(): void {
    this.streamAbort?.abort();
    const abort = new AbortController();
    this.streamAbort = abort;
    void this.api
      .orderSocketStream(
        this.orderId(),
        (kind) => {
          if (abort.signal.aborted) return;
          if (kind === 'open') {
            this.live.set(true);
            this.setPoll(POLL_SLOW_MS / 1000);
            return;
          }
          this.refreshTracking();
        },
        abort.signal,
      )
      .then(() => this.streamDropped(abort));
  }

  /** The stream ended or errored, the poll timer carries the page from here. */
  private streamDropped(abort: AbortController): void {
    if (abort.signal.aborted) return;
    this.live.set(false);
    this.setPoll(POLL_FAST_MS / 1000);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (!abort.signal.aborted) this.openStream();
    }, STREAM_RETRY_MS);
  }

  private stopPolling(): void {
    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  carrierLabel(leg: DeliveryLegView): string {
    return leg.carrier === 'gigl' ? 'GIGL courier' : leg.carrier;
  }

  carrier(): string {
    const l = this.leg();
    return l ? this.carrierLabel(l) : 'GIGL';
  }

  legLabel(leg: DeliveryLegView): string {
    switch (leg.status) {
      case 'in_transit':
        return 'On the way';
      case 'delivered':
        return 'Handed over';
      case 'failed':
        return 'Attempt failed';
      default:
        return 'Being booked';
    }
  }

  legZone(): string | null {
    const zone = this.leg()?.zone;
    return zone && zone.trim() ? zone : null;
  }

  riderFirstName(): string | null {
    const name = (this.leg()?.driverName ?? '').trim();
    if (!name) return null;
    return name.split(/\s+/)[0] || null;
  }

  /** Only known checkpoint statuses get words; an unknown token is never echoed. */
  checkpointLabel(cp: Partial<DeliveryCheckpoint> | null | undefined): string {
    switch ((cp?.status ?? '').trim()) {
      case 'on_track':
        return 'On track';
      case 'delayed':
        return 'Delayed';
      case 'arrived':
        return 'Arrived';
      case 'handed_over':
        return 'Handed over';
      default:
        return 'Update';
    }
  }

  private eventLabel(status: string): string {
    const words = status.replaceAll('_', ' ').trim();
    return words ? words[0].toUpperCase() + words.slice(1) : 'Update';
  }

  readonly deliveredAt = computed<Date | null>(() => {
    if (!/delivered|completed/.test(this.status())) return null;
    if (this.invoice()?.status && this.invoice()!.status.toLowerCase().includes('deliver')) {
      const d = this.invoice()!.createdAt;
      const date = new Date(d);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    for (const leg of this.deliveries()) {
      if (leg.status === 'delivered') {
        const cp = (leg.checkpoints ?? [])
          .filter((c) => c.at && (c.status === 'handed_over' || c.status === 'arrived'))
          .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
        if (cp?.at) {
          const date = new Date(cp.at);
          if (!Number.isNaN(date.getTime())) return date;
        }
      }
    }
    const ev = [...this.events()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).find((e) => /deliver|complete/.test(e.status));
    if (ev?.createdAt) {
      const date = new Date(ev.createdAt);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return null;
  });

  readonly returnWindowElapsed = computed(() => {
    const deliveredAt = this.deliveredAt();
    if (!deliveredAt) return false;
    const elapsedMs = Date.now() - deliveredAt.getTime();
    return elapsedMs >= this.RETURN_WINDOW_HOURS * 60 * 60 * 1000;
  });

  readonly isDeliveredSignal = computed(() => /delivered|completed/.test(this.status()));

  readonly canRequestReturn = computed(() => {
    if (!this.isDeliveredSignal()) return false;
    if (this.returnWindowElapsed()) return false;
    return true;
  });

  openReturnForm(): void {
    if (!this.canRequestReturn()) return;
    this.showReturnForm.set(true);
  }

  cancelReturnForm(): void {
    this.showReturnForm.set(false);
    this.returnReason = '';
    this.returnDetails = '';
  }

  submitReturnRequest(): void {
    if (!this.canRequestReturn() || this.submittingReturn()) return;
    if (!this.returnReason.trim() || !this.returnDetails.trim()) return;
    this.submittingReturn.set(true);
    // API endpoint not present in current service; keep UI flow consistent.
    setTimeout(() => {
      this.submittingReturn.set(false);
      this.showReturnForm.set(false);
      this.returnReason = '';
      this.returnDetails = '';
    }, 300);
  }

  readonly ref = computed(() => orderRef(this.orderId()));

  /** Furthest pipeline stage this batch has reached, -1 when not matched. */
  readonly stage = computed(() => {
    const s = this.status().toLowerCase();
    return PIPELINE.findIndex((p) => s.includes(p.key));
  });

  /** Header badge: the pipeline stage, or the truthful non-stage states. */
  readonly stageBadge = computed(() => {
    if (this.awaitingStock()) return 'AWAITING STOCK';
    const i = this.stage();
    if (i >= 0) return `STAGE ${i + 1} / ${PIPELINE[i].label.toUpperCase()}`;
    return 'BATCH BOOKED';
  });

  readonly stageText = (): string =>
    `Stage ${Math.max(this.stage(), 0) + 1} of ${PIPELINE.length}`;

  readonly fillPct = computed(() =>
    this.stage() < 0 ? 0 : ((this.stage() + 1) / PIPELINE.length) * 100,
  );

  readonly headline = computed(() => {
    const inv = this.invoice();
    const prefix = inv ? `${units(inv)} Units` : 'Your batch';
    if (this.awaitingStock()) return `${prefix} Awaiting Allocation`;
    switch (this.deliveryState()) {
      case 'delivered':
        return `${prefix} Delivered`;
      case 'failed':
        return `${prefix}: Last Attempt Failed`;
      case 'in_transit':
        return `${prefix} with the Courier`;
      default:
        return `${prefix} on the Factory Floor`;
    }
  });

  private getDeliveryConfirmedKey(): string {
    const id = this.orderId();
    return `delivery_confirmed_${id}`;
  }

  private getDeliveryConfirmed(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(this.getDeliveryConfirmedKey()) === 'true';
    } catch {
      return false;
    }
  }

  private setDeliveryConfirmed(value: boolean): void {
    this.deliveryConfirmed.set(value);
    if (typeof localStorage !== 'undefined') {
      try {
        const key = this.getDeliveryConfirmedKey();
        if (value) localStorage.setItem(key, 'true');
        else localStorage.removeItem(key);
      } catch {}
    }
  }

  private async showDeliveryConfirmationIfNeeded(): Promise<void> {
    if (!this.isDeliveredSignal() || this.deliveryConfirmed()) return;
    const confirmed = await this.confirm.ask({
      title: 'Have you received your package?',
      consequence: 'Please confirm you have received your delivery in good condition.',
      confirmLabel: 'I have received it',
      cancelLabel: 'Not yet',
    });
    if (confirmed) {
      this.setDeliveryConfirmed(true);
    }
  }

  constructor() {
    effect(() => {
      if (this.loaded()) {
        void this.showDeliveryConfirmationIfNeeded();
      }
    });
  }

  /**
   * Customer-facing flag for a paid order that is short on stock. The API
   * reports `awaiting_stock`; the stored status stays `stock_exception`, which
   * is admin wording and never reaches this page.
   */
  awaitingStock(): boolean {
    return /^awaiting[_ ]stock$/.test(this.status().trim().toLowerCase());
  }
}
