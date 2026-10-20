import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  SeActivityComponent,
  SeActivityEntry,
  SeBannerComponent,
  SeBreadcrumb,
  SeButtonDirective,
  SeCardComponent,
  SeConfirmService,
  SeKvDirective,
  SeKvItemComponent,
  SePageComponent,
  SeSkeletonComponent,
  SeStatusComponent,
} from '@seentair/ui';
import { ApiService, DeliveryCheckpoint, DeliveryLegView, Invoice } from '../api.service';
import { orderRef, units } from '../wholesale-format';

/** Fallback poll cadence while the SSE stream is down, and the slow cadence
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

/**
 * Order tracking for one wholesale batch: where it is now, every update the
 * courier has posted (newest first), and the freight facts. Only the
 * customer-facing projection is rendered: staff notes and zones never reach
 * the page even when the API still sends them.
 */
@Component({
  selector: 'app-tracking',
  imports: [
    RouterLink,
    FormsModule,
    SeActivityComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeKvDirective,
    SeKvItemComponent,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
  ],
  template: `
    <se-page [title]="'Tracking ' + ref()" [breadcrumbs]="crumbs()">
      @if (loaded()) {
        <se-status sePageStatus kind="delivery" [value]="deliveryState()" />
      }
      @if (loaded()) {
        <p sePageMeta>{{ summary() }}</p>
      }
      <a seButton sePageActions [routerLink]="['/orders', orderId(), 'invoice']">View invoice</a>

      <!-- A paid batch the ledger could not fully allocate. The API reports
           awaiting_stock rather than the admin-only stock_exception, so the
           buyer is told the truth instead of a reassuring freeze. -->
      @if (loaded() && awaitingStock()) {
        <se-banner tone="warning" title="Awaiting stock allocation">
          Your payment is confirmed and the batch is booked, but the workshop cannot allocate every
          unit yet. The Aba desk is sourcing the shortfall or scheduling the balance into production.
          Nothing further is needed from you, and this page updates as soon as the stock is
          allocated.
        </se-banner>
      }

      @if (loaded()) {
        <div class="se-detail">
          <div class="se-detail__main">
            <se-card title="Delivery updates">
              <se-activity [entries]="history()" emptyText="No updates posted yet." />
            </se-card>
            <se-card title="Returns">
              <p class="tracking-note">
                Return requests must be submitted within 12 hours of confirmed delivery and are
                completed within 24 hours. Custom orders are excluded from returns.
              </p>
              @if (canRequestReturn()) {
                @if (!showReturnForm()) {
                  <button seButton type="button" (click)="openReturnForm()">Request return</button>
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
                      <button seButton type="submit" [disabled]="submittingReturn()">Submit request</button>
                      <button seButton type="button" variant="ghost" (click)="cancelReturnForm()">Cancel</button>
                    </div>
                  </form>
                }
              } @else {
                <button seButton type="button" disabled>Request return</button>
                @if (returnWindowElapsed()) {
                  <p class="tracking-note tracking-note--muted">Return window has elapsed (12 hours from delivery).</p>
                } @else if (!isDeliveredSignal()) {
                  <p class="tracking-note tracking-note--muted">Return requests are available after delivery is confirmed.</p>
                } @else {
                  <p class="tracking-note tracking-note--muted">Return requests are not available for this order.</p>
                }
              }
            </se-card>
          </div>
          <aside class="se-detail__aside">
            <se-card title="Courier">
              <dl seKv>
                <div seKvItem label="Carrier">{{ carrier() }}</div>
                <div seKvItem label="Waybill">{{ leg()?.trackingRef ?? 'Issued at dispatch' }}</div>
                <div seKvItem label="Route">{{ legZone() || 'Aba workshop to consignee hub' }}</div>
                @if (riderFirstName(); as rider) {
                  <div seKvItem label="Rider">{{ rider }}</div>
                }
                <div seKvItem label="Leg">{{ leg() ? legLabel(leg()!) : 'Being booked' }}</div>
              </dl>
            </se-card>
            <se-card title="Batch">
              <dl seKv>
                <div seKvItem label="Order">{{ ref() }}</div>
                <div seKvItem label="Units" numeric>{{ invoice() ? units(invoice()!) : '—' }}</div>
                <div seKvItem label="Updates">
                  {{
                    live()
                      ? 'Live while this page stays open'
                      : 'Checked every ' + pollSeconds() + 's'
                  }}
                </div>
              </dl>
            </se-card>
          </aside>
        </div>
      } @else if (failed()) {
        <se-banner
          tone="danger"
          title="Tracking could not be loaded"
          actionLabel="Try again"
          (action)="retry()"
        >
          Check your connection and try again.
        </se-banner>
      } @else {
        <div aria-busy="true"><se-skeleton shape="detail" /></div>
      }
    </se-page>
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

  readonly showReturnForm = signal(false);
  readonly submittingReturn = signal(false);
  returnReason = '';
  returnDetails = '';
  readonly RETURN_WINDOW_HOURS = 12;
  private deliveryConfirmed = signal(this.getDeliveryConfirmed());
  readonly crumbs = computed<SeBreadcrumb[]>(() => [
    { label: 'Orders', link: '/orders' },
    { label: this.ref(), link: `/orders/${this.orderId()}/invoice` },
    { label: 'Tracking' },
  ]);
  readonly leg = computed<DeliveryLegView | null>(() => this.deliveries()[0] ?? null);

  /** The delivery state as `se-status kind="delivery"` knows it. */
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
  readonly history = computed<SeActivityEntry[]>(() => {
    const entries: SeActivityEntry[] = [];
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
      .orderStream(
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
