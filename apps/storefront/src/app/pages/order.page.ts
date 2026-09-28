import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, DeliveryLegView, Order } from '../api.service';

const STEPS = [
  { key: 'order_received', name: 'Order received' },
  { key: 'processing', name: 'Processing & packaging' },
  { key: 'shipped', name: 'Shipped' },
  { key: 'delivered', name: 'Delivered' },
];
const RETURN_WINDOW_MS = 12 * 3_600_000;

/** Fallback poll cadence while the SSE stream is down, and the slow cadence
    used while it is up. Visibility-aware, so a backgrounded tab costs nothing. */
const POLL_FAST_MS = 15_000;
const POLL_SLOW_MS = 60_000;
/** Wait before re-dialling a stream that dropped. */
const STREAM_RETRY_MS = 30_000;

/** Order tracking — Stitch "lifecycle" layout: percent-executed header,
    four step cards, checkpoint log, manifest, review + return actions. */
@Component({
  selector: 'app-order',
  imports: [CommonModule, FormsModule],
  template: `
    @if (order(); as o) {
      <p class="page-kicker">Order // {{ o.id.slice(0, 8) }}</p>
      <h1 class="page-title">Order tracking</h1>

      <!-- An unpaid order is a dead end without this: checkout may have failed
           to open a Paystack session (or the customer simply never paid), and
           the order page is where they land to find out why. -->
      @if (needsPayment()) {
        <div class="rule-strip" role="alert">
          <p class="s-name">Payment due — ₦{{ o.totalAmount | number: '1.0-0' }}</p>
          <p class="s-state">■ AWAITING PAYMENT</p>
          @if (paymentError()) {
            <p class="muted small">{{ paymentError() }}</p>
          } @else {
            <p class="muted small">
              This order is reserved. Pay the exact total online, or by bank transfer, cash or POS —
              no part-payments.
            </p>
          }
          <button class="cta small" type="button" (click)="startPayment()" [disabled]="paying()">
            {{ paying() ? 'Opening Paystack…' : 'Pay now' }}
          </button>
        </div>
      }

      <div class="exec-header">
        <p class="section-label plain">
          Progress <span class="count">// {{ percent() }}% complete</span>
        </p>
        <span class="exec-count">{{ stepIndex() + 1 | number: '2.0' }}/04</span>
      </div>
      <div class="step-cards">
        @for (step of steps; track step.key; let i = $index) {
          <div class="step-card" [class.done]="i < stepIndex()" [class.current]="i === stepIndex()">
            <p class="s-idx">STEP {{ i + 1 | number: '2.0' }}</p>
            <p class="s-name">{{ step.name }}</p>
            <p class="s-state">
              {{ i < stepIndex() ? '■ COMPLETE' : i === stepIndex() ? '▶ CURRENT' : '· PENDING' }}
            </p>
          </div>
        }
      </div>

      @if (deliveries().length) {
        <p class="section-label">Delivery progress</p>
        @for (leg of deliveries(); track leg.legNumber) {
          <div class="rule-strip">
            <p class="s-name">
              {{ leg.legNumber > 1 ? 'Leg ' + leg.legNumber + ' — ' : '' }}{{ carrierLabel(leg) }}
            </p>
            <p class="s-state">{{ legLabel(leg) }}</p>
            @if (leg.trackingRef) {
              <p class="muted small">Tracking ref {{ leg.trackingRef }}</p>
            }
            @if (leg.driverName) {
              <p class="muted small">Rider {{ leg.driverName }}</p>
            }
            @if (leg.checkpoints.length) {
              @for (cp of leg.checkpoints; track $index) {
                <div class="audit-row">
                  <p class="a-time">{{ cp.at | date: 'medium' }}</p>
                  <p class="a-status">{{ cp.zone ?? checkpointLabel(cp.status) }}</p>
                  @if (cp.note) {
                    <p class="muted small">{{ cp.note }}</p>
                  }
                </div>
              }
            } @else {
              <p class="muted small">No corridor updates yet.</p>
            }
          </div>
        }
        <p class="muted small">
          @if (live()) {
            Live — updates appear here the moment the factory or courier reports them.
          } @else {
            Checking every {{ pollSeconds() }}s while this tab is open.
          }
        </p>
      }

      @if (o.status === 'returned') {
        <p class="rule-strip">
          This order was returned. The resolution is recorded in the history below.
        </p>
      }

      <div class="checkout-cols">
        <div>
          <p class="section-label">Status history</p>
          @for (event of events(); track $index) {
            <div class="audit-row">
              <p class="a-time">{{ event.createdAt | date: 'medium' }}</p>
              <p class="a-status">{{ event.status.replaceAll('_', ' ') }}</p>
              @if (event.note) {
                <p class="muted small">{{ event.note }}</p>
              }
            </div>
          }

          @if (o.status === 'delivered') {
            <p class="section-label">How was it?</p>
            @for (item of o.items; track item.variant.id) {
              <form class="review-form" (ngSubmit)="review(item.variant.id)">
                <span class="sku-line">{{ item.variant.sku }}</span>
                <select [(ngModel)]="ratings[item.variant.id]" [name]="'r' + item.variant.id">
                  <option [ngValue]="5">★★★★★</option>
                  <option [ngValue]="4">★★★★☆</option>
                  <option [ngValue]="3">★★★☆☆</option>
                  <option [ngValue]="2">★★☆☆☆</option>
                  <option [ngValue]="1">★☆☆☆☆</option>
                </select>
                <input
                  [(ngModel)]="comments[item.variant.id]"
                  [name]="'c' + item.variant.id"
                  placeholder="Say something (optional)"
                />
                <button class="cta small" type="submit">Submit review</button>
              </form>
            }
            @if (reviewMessage()) {
              <p class="success">{{ reviewMessage() }}</p>
            }
          }

          @if (returnEligible()) {
            <p class="section-label">Request a return</p>
            <p class="rule-strip">
              Returns must be requested within 12 hours of delivery — this window closes
              {{ returnDeadline() | date: 'shortTime' }}. The physical return is due within 24 hours
              of the request.
            </p>
            @for (item of o.items; track item.variant.id) {
              <form class="review-form" (ngSubmit)="requestReturn(item.variant.id, item.quantity)">
                <span class="sku-line">{{ item.variant.sku }} × {{ item.quantity }}</span>
                <input
                  [(ngModel)]="returnReasons[item.variant.id]"
                  [name]="'ret' + item.variant.id"
                  placeholder="Reason (required)"
                  required
                />
                <button class="cta small ghost" type="submit">Request return</button>
              </form>
            }
            @if (returnMessage()) {
              <p class="success">{{ returnMessage() }}</p>
            }
            @if (returnError()) {
              <p class="error">{{ returnError() }}</p>
            }
          }
        </div>

        <aside>
          <p class="section-label">
            Manifest <span class="count">[{{ o.items.length | number: '2.0' }}]</span>
          </p>
          @for (item of o.items; track item.variant.id) {
            <div class="manifest-row">
              @if (item.variant.imageUrl) {
                <img
                  class="m-thumb"
                  [src]="item.variant.imageUrl"
                  [alt]="item.variant.sku"
                  loading="lazy"
                />
              } @else {
                <div class="m-thumb m-thumb-monogram" aria-hidden="true">•</div>
              }
              <div class="m-body">
                <p class="sku-line">{{ item.variant.sku }}</p>
                <p class="muted small">× {{ item.quantity }}</p>
              </div>
              <span class="m-price">₦{{ item.unitPrice * item.quantity | number: '1.0-2' }}</span>
            </div>
          }
          <div class="matrix-total">
            <span class="label">Total paid</span>
            <span class="value">₦{{ o.totalAmount | number: '1.0-0' }}</span>
          </div>
          <p class="muted small mono">PAYMENT // {{ o.paymentStatus.toUpperCase() }}</p>
        </aside>
      </div>
    } @else {
      <div class="sk-strip" aria-hidden="true">
        <div class="skeleton sk-line w40"></div>
        <div class="skeleton sk-line w80"></div>
        @for (r of [0, 1, 2]; track r) {
          <div class="sk-row">
            <div class="skeleton sk-av"></div>
            <div class="skeleton sk-line w60"></div>
          </div>
        }
      </div>
    }
  `,
})
export class OrderPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly steps = STEPS;
  readonly order = signal<Order | null>(null);
  readonly deliveredAt = signal<string | null>(null);
  readonly events = signal<Array<{ status: string; note: string | null; createdAt: string }>>([]);
  readonly deliveries = signal<DeliveryLegView[]>([]);
  /** True while the SSE stream is connected; false means we are poll-only. */
  readonly live = signal(false);
  readonly pollSeconds = signal(POLL_FAST_MS / 1000);
  readonly paying = signal(false);
  readonly paymentError = signal<string | null>(null);
  readonly reviewMessage = signal<string | null>(null);
  readonly returnMessage = signal<string | null>(null);
  readonly returnError = signal<string | null>(null);
  ratings: Record<string, number> = {};
  comments: Record<string, string> = {};
  returnReasons: Record<string, string> = {};

  private orderId = '';
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private streamAbort: AbortController | undefined;
  private refetchQueued = false;

  readonly stepIndex = computed(() => {
    const status = this.order()?.status ?? '';
    const i = STEPS.findIndex((s) => s.key === status);
    return i >= 0 ? i : status === 'returned' ? STEPS.length - 1 : 0;
  });
  readonly percent = computed(() => Math.round(((this.stepIndex() + 1) / STEPS.length) * 100));
  readonly returnDeadline = computed(() => {
    const d = this.deliveredAt();
    return d ? new Date(new Date(d).getTime() + RETURN_WINDOW_MS) : null;
  });
  readonly returnEligible = computed(() => {
    const o = this.order();
    const deadline = this.returnDeadline();
    return !!o && o.status === 'delivered' && !!deadline && deadline.getTime() > Date.now();
  });

  /** 'gigl' is the carrier key; anything else is already a human carrier name. */
  carrierLabel(leg: DeliveryLegView): string {
    return leg.carrier === 'gigl' ? 'GIGL courier' : leg.carrier;
  }

  /**
   * True while money is still owed. `paymentStatus` is the authority; status is
   * the fallback so an order that predates the field still offers payment.
   */
  needsPayment(): boolean {
    const o = this.order();
    if (!o) return false;
    if (o.status === 'cancelled' || o.status === 'returned') return false;
    return o.paymentStatus !== 'paid' && o.status === 'awaiting_payment';
  }

  /**
   * Opens a Paystack session for this order. The API mints a fresh reference
   * each call, so retrying after a failure (or after an abandoned checkout) is
   * safe and is the only way out of a stranded order.
   */
  startPayment(): void {
    const o = this.order();
    if (!o || this.paying()) return;
    this.paying.set(true);
    this.paymentError.set(null);
    this.api.payWithPaystack(o.id, o.totalAmount).subscribe({
      next: (res) => {
        this.paying.set(false);
        // Leave the app: Paystack hosts the payment, then redirects back here.
        window.location.href = res.authorizationUrl;
      },
      error: (err) => {
        this.paying.set(false);
        this.paymentError.set(
          err?.error?.message ?? 'The payment link could not be created. Try again shortly.',
        );
      },
    });
  }

  legLabel(leg: DeliveryLegView): string {
    switch (leg.status) {
      case 'in_transit':
        return '▶ ON THE WAY';
      case 'delivered':
        return '■ HANDED OVER';
      case 'failed':
        return '■ ATTEMPT FAILED';
      default:
        return '· BEING BOOKED';
    }
  }

  checkpointLabel(status: string | null): string {
    return (status ?? 'update').replaceAll('_', ' ');
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.orderId = id;
    this.api.order(id).subscribe((o) => {
      this.order.set(o);
      for (const item of o.items) this.ratings[item.variant.id] ??= 5;
    });
    this.refreshTracking();
    this.startPolling();
    this.openStream();
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.streamAbort?.abort();
  }

  /**
   * Re-reads tracking. Coalesces bursts (several checkpoints at once) into one
   * request so a busy delivery leg can't stampede the API.
   */
  private refreshTracking(): void {
    if (this.refetchQueued) return;
    this.refetchQueued = true;
    queueMicrotask(() => {
      this.refetchQueued = false;
      this.api.tracking(this.orderId).subscribe({
        next: (t) => {
          this.events.set(t.events);
          this.deliveredAt.set(t.deliveredAt);
          this.deliveries.set(t.deliveries ?? []);
        },
        error: () => {
          /* transient; the next tick retries */
        },
      });
    });
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      // A hidden tab is not watching; skip the round trip entirely.
      if (typeof document !== 'undefined' && document.hidden) return;
      this.refreshTracking();
    }, POLL_FAST_MS);
  }

  private setPoll(seconds: number): void {
    if (this.pollSeconds() === seconds) return;
    this.pollSeconds.set(seconds);
    this.startPolling();
  }

  /**
   * SSE is the fast path; polling is the floor. If the stream fails for any
   * reason (offline, proxy without streaming, expired token) the page keeps
   * working off the poll timer, and the stream is retried at a slow cadence.
   */
  private openStream(): void {
    this.streamAbort?.abort();
    const abort = new AbortController();
    this.streamAbort = abort;
    void this.api
      .orderStream(
        this.orderId,
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

  /** The stream ended or errored — the poll timer carries the page from here. */
  private streamDropped(abort: AbortController): void {
    if (abort.signal.aborted) return;
    this.live.set(false);
    this.setPoll(POLL_FAST_MS / 1000);
    // Back off before retrying, so a server without SSE support cannot spin us.
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

  review(variantId: string): void {
    const order = this.order();
    if (!order) return;
    this.api
      .submitReview(
        order.id,
        variantId,
        this.ratings[variantId] ?? 5,
        this.comments[variantId] ?? '',
      )
      .subscribe({
        next: () => this.reviewMessage.set('Thanks! Your review is in — it appears once approved.'),
        error: (err) =>
          this.reviewMessage.set(err?.error?.message ?? 'Could not submit the review.'),
      });
  }

  requestReturn(variantId: string, quantity: number): void {
    const order = this.order();
    const reason = this.returnReasons[variantId]?.trim();
    this.returnError.set(null);
    if (!order || !reason) {
      this.returnError.set('A reason is required for returns.');
      return;
    }
    this.api.requestReturn(order.id, variantId, quantity, reason).subscribe({
      next: () =>
        this.returnMessage.set(
          'Return requested — send the item back via a logistics company within 24 hours and keep the tracking number.',
        ),
      error: (err) => this.returnError.set(err?.error?.message ?? 'Return request failed.'),
    });
  }
}
