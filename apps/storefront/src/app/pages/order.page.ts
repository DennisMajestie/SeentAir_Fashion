import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { ApiService, DeliveryLegView, Order } from '../api.service';

/** One customer-visible stage. `blurb` is always rendered, including for stages
 *  that have not happened yet, so the timeline is never an empty list. */
interface Stage {
  key: string;
  name: string;
  blurb: string;
}

/** The four stages a customer is walked through, in order. */
const STAGES: Stage[] = [
  {
    key: 'order_received',
    name: 'Order received',
    blurb: 'We have your order and your payment is confirmed.',
  },
  {
    key: 'processing',
    name: 'Processing & packaging',
    blurb: 'Your pieces are cut, sewn, quality-checked and packed at the workshop.',
  },
  {
    key: 'shipped',
    name: 'Shipped',
    blurb: 'Your parcel leaves the factory and goes out with the courier.',
  },
  {
    key: 'delivered',
    name: 'Delivered',
    blurb: 'The rider hands your parcel over at your address.',
  },
];

/**
 * The single status-to-copy mapping. Every status the backend can emit
 * (OrderStatus, services/api/src/modules/orders/entities/order.entity.ts:38-49)
 * appears here exactly once, so adding a status cannot leave the page silent.
 *
 *  stage   - index into STAGES; omitted means "not one of the four walked
 *            stages", which renders an alternate banner instead of a timeline.
 *  label   - the badge text.
 *  headline/next - the hero copy.
 *  tone    - badge modifier: '' (accent), 'ok', or 'danger'.
 *  internal- true when the status is an internal one the customer must never
 *            see named. Wording is written for the customer regardless.
 */
interface StatusCopy {
  stage?: number;
  label: string;
  headline: string;
  next: string;
  tone: '' | 'ok' | 'danger';
  internal?: boolean;
}

const STATUS_COPY: Record<string, StatusCopy> = {
  awaiting_payment: {
    label: 'Awaiting payment',
    headline: 'Waiting on your payment',
    next: 'Pay the exact total to start production. No part-payments.',
    tone: '',
  },
  order_received: {
    stage: 0,
    label: 'Order received',
    headline: "We've got your order",
    next: 'Next: we start cutting and sewing your pieces in the workshop.',
    tone: '',
  },
  processing: {
    stage: 1,
    label: 'Processing & packaging',
    headline: 'Making your pieces',
    next: 'Next: quality check, then your parcel is packed and labelled for dispatch.',
    tone: '',
  },
  shipped: {
    stage: 2,
    label: 'Shipped',
    headline: 'On the way to you',
    next: 'Next: the courier hands your parcel over and we mark it delivered.',
    tone: '',
  },
  delivered: {
    stage: 3,
    label: 'Delivered',
    headline: 'Delivered',
    next: 'Enjoy it. Returns can be requested within 12 hours of delivery.',
    tone: 'ok',
  },
  returned: {
    label: 'Returned',
    headline: 'This order was returned',
    next: 'The resolution is recorded in the progress history below.',
    tone: 'danger',
  },
  // Reachable through GET /orders/:id, which does not map internal statuses the
  // way GET /orders/:id/tracking does. Never named to the customer.
  stock_exception: {
    label: 'Being confirmed',
    headline: 'We are confirming your order',
    next: 'We are checking availability and will confirm shortly. Nothing more is needed from you.',
    tone: '',
    internal: true,
  },
  cancelled: {
    label: 'Cancelled',
    headline: 'This order was cancelled',
    next: 'Any payment made is refunded to the original method.',
    tone: 'danger',
  },
};

/** Carrier keys are storage values, not words to show a customer. */
const CARRIER_NAMES: Record<string, string> = {
  gigl: 'GIGL courier',
  gig: 'GIG courier',
  manual: 'Seentair fleet',
  fleet: 'Seentair fleet',
};

const RETURN_WINDOW_MS = 12 * 3_600_000;

/** Fallback poll cadence while the SSE stream is down, and the slow cadence
    used while it is up. Visibility-aware, so a backgrounded tab costs nothing. */
const POLL_FAST_MS = 15_000;
const POLL_SLOW_MS = 60_000;
/** Wait before re-dialling a stream that dropped. */
const STREAM_RETRY_MS = 30_000;

/**
 * Order tracking. Layout: hero status, segmented progress, vertical timeline,
 * manifest, and a sticky help dock. Every stage renders its description whether
 * or not it has happened, so the customer always knows what is still to come.
 */
@Component({
  selector: 'app-order',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="ot">
      <header class="ot-head">
        <p class="ot-eyebrow">Order // {{ shortId() }}</p>
        <h1 class="ot-title">Order tracking</h1>
      </header>

      @if (loadError()) {
        <!-- A failed fetch must not leave the skeleton up forever: that reads as
             "still loading" and strands the customer with no way forward. -->
        <section class="ot-card ot-card-alert" role="alert">
          <p class="ot-badge ot-badge-danger">
            <span class="ot-dot" aria-hidden="true"></span>
            Could not load this order
          </p>
          <p class="ot-headline">We could not load your order right now</p>
          <p class="ot-next">{{ loadError() }}</p>
          <p class="ot-ref">Order // {{ shortId() }}</p>
          <div class="ot-actions">
            <button class="cta" type="button" (click)="reload()" [disabled]="loading()">
              {{ loading() ? 'Retrying…' : 'Retry' }}
            </button>
            <a class="cta ghost" routerLink="/account">All my orders</a>
          </div>
        </section>
      } @else if (!order()) {
        <!-- Skeleton mirrors the real layout (hero, timeline, manifest) so the
             page does not reflow once data lands. Hidden from AT: it carries
             no information. -->
        <section class="ot-card" aria-hidden="true">
          <div class="skeleton ot-sk-pill"></div>
          <div class="skeleton sk-line w60"></div>
          <div class="skeleton sk-line w80"></div>
          <div class="ot-sk-seg-row">
            <div class="skeleton ot-sk-seg"></div>
            <div class="skeleton ot-sk-seg"></div>
            <div class="skeleton ot-sk-seg"></div>
            <div class="skeleton ot-sk-seg"></div>
          </div>
        </section>
        <section class="ot-card" aria-hidden="true">
          <div class="skeleton sk-line w40"></div>
          @for (r of [0, 1, 2, 3]; track r) {
            <div class="sk-row">
              <div class="skeleton sk-av"></div>
              <div class="skeleton sk-line w60"></div>
            </div>
          }
        </section>
        <section class="ot-card" aria-hidden="true">
          <div class="skeleton sk-line w40"></div>
          @for (r of [0, 1]; track r) {
            <div class="sk-row">
              <div class="skeleton ot-sk-thumb"></div>
              <div class="skeleton sk-line w60"></div>
            </div>
          }
        </section>
      } @else {
        <!-- ===================== HERO ===================== -->
        <section class="ot-card ot-hero">
          @if (needsPayment()) {
            <div class="ot-alert ot-alert-warn" role="status">
              <span class="ot-alert-title"
                >Payment due — ₦{{ order()!.totalAmount | number: '1.0-0' }}</span
              >
              <p>
                This order is reserved. Pay the exact total online, or by bank transfer, cash or
                POS. No part-payments.
              </p>
              @if (paymentError()) {
                <p class="ot-alert-reason">{{ paymentError() }}</p>
              }
              <button
                class="cta small"
                type="button"
                (click)="startPayment()"
                [disabled]="paying()"
              >
                {{ paying() ? 'Opening Paystack…' : 'Pay now' }}
              </button>
            </div>
          }

          <p class="ot-badge" [class]="badgeClass()">
            <span class="ot-dot" aria-hidden="true"></span>
            {{ statusLabel() }}
          </p>
          <h2 class="ot-headline">{{ heroHeadline() }}</h2>
          <p class="ot-next">{{ heroNext() }}</p>

          <div
            class="ot-progress"
            role="progressbar"
            [attr.aria-label]="progressLabel()"
            aria-valuemin="1"
            aria-valuemax="4"
            [attr.aria-valuenow]="displayStep()"
          >
            @for (s of stages; track s.key; let i = $index) {
              <span
                class="ot-seg"
                [class.on]="i <= stepIndex()"
                [class.current]="i === stepIndex()"
              ></span>
            }
          </div>
          <div class="ot-progress-meta">
            <span>{{ progressLabel() }}</span>
            <span>Next: {{ nextStageName() }}</span>
          </div>

          <div class="ot-eta">
            <span class="ot-row-label">Estimated delivery</span>
            <span class="ot-row-value">{{ etaText() }}</span>
          </div>
        </section>

        <!-- Alternate banners for statuses outside the four walked stages. -->
        @if (alternateBanner(); as b) {
          <section class="ot-card ot-card-alert" role="status">
            <p class="ot-badge" [class]="b.badgeClass">
              <span class="ot-dot" aria-hidden="true"></span>
              {{ b.label }}
            </p>
            <p class="ot-headline">{{ b.headline }}</p>
            <p class="ot-next">{{ b.next }}</p>
          </section>
        }

        <!-- ===================== TIMELINE ===================== -->
        <section class="ot-card">
          <h2 class="ot-card-title">Progress</h2>
          <ol class="ot-timeline">
            @for (s of stages; track s.key; let i = $index) {
              <li
                class="ot-node"
                [class.done]="i < stepIndex()"
                [class.current]="i === stepIndex()"
                [attr.aria-current]="i === stepIndex() ? 'step' : null"
              >
                <span class="ot-node-dot" aria-hidden="true">{{ i + 1 }}</span>
                <div class="ot-node-body">
                  <p class="ot-node-name">{{ s.name }}</p>
                  <p class="ot-node-blurb">{{ s.blurb }}</p>
                  @if (reachedAt(s.key); as at) {
                    <p class="ot-node-time">{{ at | date: 'medium' }}</p>
                  }
                </div>
              </li>
            }
          </ol>
        </section>

        <!-- ===================== TRACKING, one block per leg ===================== -->
        @for (leg of deliveries(); track leg.legNumber) {
          <section class="ot-card">
            <h2 class="ot-card-title">
              {{ leg.legNumber > 1 ? 'Delivery leg ' + leg.legNumber : 'Delivery' }}
            </h2>
            <div class="ot-row">
              <span class="ot-row-label">Courier</span>
              <span class="ot-row-value">{{ carrierName(leg) }}</span>
            </div>
            <div class="ot-row">
              <span class="ot-row-label">Tracking no.</span>
              <span class="ot-row-value">
                @if (leg.trackingRef) {
                  <span class="ot-mono">{{ leg.trackingRef }}</span>
                  <button
                    class="ot-copy"
                    type="button"
                    (click)="copy(leg.legNumber, leg.trackingRef)"
                    [attr.aria-label]="'Copy tracking number ' + leg.trackingRef"
                  >
                    {{ copiedLeg() === leg.legNumber ? 'Copied' : 'Copy' }}
                  </button>
                } @else {
                  <span class="muted">Pending</span>
                  <button class="ot-copy" type="button" disabled>Copy</button>
                }
              </span>
            </div>
            @if (riderName(leg); as rider) {
              <div class="ot-row">
                <span class="ot-row-label">Rider</span>
                <span class="ot-row-value">{{ rider }}</span>
              </div>
            }
            @if (leg.checkpoints.length) {
              <p class="ot-sublabel">Delivery updates</p>
              <ul class="ot-checkpoints">
                @for (cp of leg.checkpoints; track $index) {
                  <li>
                    <span class="ot-cp-time">{{ cp.at | date: 'medium' }}</span>
                    <span class="ot-cp-text">{{ checkpointStatus(cp.status) }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="muted small ot-empty">No courier updates recorded yet.</p>
            }
          </section>
        }

        <!-- ===================== MANIFEST ===================== -->
        <section class="ot-card">
          <h2 class="ot-card-title">What you ordered</h2>
          @for (item of order()!.items; track item.variant.id) {
            <div class="ot-item">
              @if (item.variant.imageUrl) {
                <img
                  class="ot-thumb"
                  [src]="item.variant.imageUrl"
                  [alt]="itemLabel(item.variant)"
                  loading="lazy"
                />
              } @else {
                <div class="ot-thumb ot-thumb-empty" aria-hidden="true">•</div>
              }
              <div class="ot-item-body">
                <p class="ot-item-name">{{ itemLabel(item.variant) }}</p>
                <p class="ot-item-variant">
                  {{ variantLine(item.variant) }} · ×{{ item.quantity }}
                </p>
                <p class="ot-item-sku">{{ item.variant.sku }}</p>
              </div>
              <span class="ot-item-price"
                >₦{{ item.unitPrice * item.quantity | number: '1.0-0' }}</span
              >
            </div>
          }

          <div class="ot-row ot-row-total">
            <span class="ot-row-label">Total</span>
            <span class="ot-row-value">₦{{ order()!.totalAmount | number: '1.0-0' }}</span>
          </div>
          <div class="ot-row">
            <span class="ot-row-label">Payment</span>
            <span class="ot-row-value" [class.ot-paid]="order()!.paymentStatus === 'paid'">
              {{ paymentLabel() }}
            </span>
          </div>
          <div class="ot-row">
            <span class="ot-row-label">Delivery</span>
            <span class="ot-row-value">{{ deliveryLabel() }}</span>
          </div>
        </section>

        <!-- ===================== POST-DELIVERY ACTIONS ===================== -->
        @if (order()!.status === 'delivered') {
          <section class="ot-card">
            <h2 class="ot-card-title">How was it?</h2>
            @for (item of order()!.items; track item.variant.id) {
              <form class="ot-review" (ngSubmit)="review(item.variant.id)">
                <span class="ot-item-sku">{{ itemLabel(item.variant) }}</span>
                <select
                  [(ngModel)]="ratings[item.variant.id]"
                  [name]="'r' + item.variant.id"
                  aria-label="Rating"
                >
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
              <p class="ot-ok">{{ reviewMessage() }}</p>
            }
          </section>
        }

        @if (returnEligible()) {
          <section class="ot-card">
            <h2 class="ot-card-title">Request a return</h2>
            <p class="muted small">
              Returns must be requested within 12 hours of delivery — this window closes
              {{ returnDeadline() | date: 'shortTime' }}. The physical return is due within 24 hours
              of the request.
            </p>
            @for (item of order()!.items; track item.variant.id) {
              <form class="ot-review" (ngSubmit)="requestReturn(item.variant.id, item.quantity)">
                <span class="ot-item-sku">{{ itemLabel(item.variant) }} × {{ item.quantity }}</span>
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
              <p class="ot-ok">{{ returnMessage() }}</p>
            }
            @if (returnError()) {
              <p class="ot-bad">{{ returnError() }}</p>
            }
          </section>
        }

        <p class="ot-live muted small">
          @if (live()) {
            Live — this page updates itself while it stays open.
          } @else {
            Checking every {{ pollSeconds() }}s while this tab is open.
          }
        </p>
      }

      <!-- ===================== STICKY HELP DOCK ===================== -->
      <div class="ot-dock">
        @if (supportWhatsapp()) {
          <a class="cta ot-dock-btn" [href]="supportWhatsapp()" rel="noopener" target="_blank">
            Need help with this order?
          </a>
        } @else {
          <!-- No WhatsApp number configured: offer a plain link rather than a
               button that would open a dead wa.me chat. -->
          <a class="cta ghost ot-dock-btn" routerLink="/policies">Contact support</a>
        }
        @if (supportHours()) {
          <p class="ot-dock-hours">{{ supportHours() }}</p>
        }
      </div>
    </div>
  `,
})
export class OrderPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly stages = STAGES;
  readonly order = signal<Order | null>(null);
  readonly deliveredAt = signal<string | null>(null);
  /** `note` is optional: the customer tracking projection omits staff-authored
   *  free text, so a received event may not carry one. */
  readonly events = signal<Array<{ status: string; note?: string | null; createdAt: string }>>([]);
  readonly deliveries = signal<DeliveryLegView[]>([]);
  readonly live = signal(false);
  readonly pollSeconds = signal(POLL_FAST_MS / 1000);
  readonly paying = signal(false);
  readonly paymentError = signal<string | null>(null);
  /** Set on a failed fetch so the skeleton is replaced by a retryable message. */
  readonly loadError = signal<string | null>(null);
  readonly loading = signal(false);
  readonly copiedLeg = signal<number | null>(null);
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
  private copyResetTimer: ReturnType<typeof setTimeout> | undefined;

  readonly shortId = computed(() => this.orderId.slice(0, 8).toUpperCase());

  readonly supportWhatsapp = computed(() => this.waLink());
  readonly supportHours = computed(() => environment.supportHours?.trim() ?? '');

  private waLink(): string {
    const raw = (environment.supportWhatsapp ?? '').trim();
    if (!raw) return '';
    const digits = raw.replace(/[^\d]/g, '');
    return digits ? `https://wa.me/${digits}` : '';
  }

  /** The copy entry for the current status. Public: the template reads it. */
  statusCopy = computed<StatusCopy>(() => {
    const status = this.order()?.status ?? '';
    return (
      STATUS_COPY[status] ?? {
        label: 'Order update',
        headline: 'We are updating your order',
        next: 'We will update this page as your order moves along.',
        tone: '',
      }
    );
  });

  /** Index into the four stages. -1 when the status is not one of them. */
  readonly stepIndex = computed(() => this.statusCopy().stage ?? -1);

  /**
   * Progress readout clamped to a real stage. For awaiting_payment, cancelled,
   * returned and stock_exception there is no meaningful step, so the bar and its
   * aria-valuenow both read as "not started" rather than leaking a step 0 or a
   * negative value outside aria-valuemin.
   */
  readonly displayStep = computed(() => Math.max(0, this.stepIndex()) + 1);

  readonly progressLabel = computed(() =>
    this.stepIndex() < 0 ? 'Not started' : `Step ${this.stepIndex() + 1} of 4`,
  );

  readonly statusLabel = computed(() => this.statusCopy().label.toUpperCase());

  readonly heroHeadline = computed(() => this.statusCopy().headline);

  readonly heroNext = computed(() => this.statusCopy().next);

  readonly nextStageName = computed(() => {
    const next = STAGES[this.stepIndex() + 1];
    return next ? next.name : 'Complete';
  });

  readonly badgeClass = computed(() => {
    const tone = this.statusCopy().tone;
    return tone === 'ok'
      ? 'ot-badge ot-badge-ok'
      : tone === 'danger'
        ? 'ot-badge ot-badge-danger'
        : 'ot-badge';
  });

  /**
   * No ETA exists in the API, so this never invents a date. An
   * estimatedDeliveryAt field would slot in here.
   */
  readonly etaText = computed(() => "We'll confirm your delivery date soon");

  /** Banner for statuses that are not one of the four walked stages. */
  readonly alternateBanner = computed(() => {
    const copy = STATUS_COPY[this.order()?.status ?? ''];
    if (!copy || copy.stage !== undefined) return null;
    return {
      label: copy.label,
      headline: copy.headline,
      next: copy.next,
      badgeClass:
        copy.tone === 'ok'
          ? 'ot-badge ot-badge-ok'
          : copy.tone === 'danger'
            ? 'ot-badge ot-badge-danger'
            : 'ot-badge',
    };
  });

  /** Timestamp for a stage, from the status-event history. */
  reachedAt(key: string): string | null {
    const hit = this.events().find((e) => e.status === key);
    return hit?.createdAt ?? null;
  }

  paymentLabel(): string {
    const p = this.order()?.paymentStatus;
    if (p === 'paid') return 'Paid in full';
    if (p === 'refunded') return 'Refunded';
    return 'Payment due';
  }

  deliveryLabel(): string {
    const o = this.order();
    if (!o) return '—';
    if (o.deliveryNote) return o.deliveryNote;
    if (o.status === 'shipped' || o.status === 'delivered') return 'Handed to courier';
    return 'Quoted at dispatch';
  }

  /**
   * Checkpoint status, and nothing else. `zone` and `note` are deliberately not
   * rendered: zone is an internal corridor label, and `note` is free text typed
   * by staff, which is not guaranteed to be customer-safe.
   *
   * The four values are the only ones AddCheckpointDto accepts
   * (services/api/src/modules/logistics/dto/add-checkpoint.dto.ts:16), and
   * addCheckpoint is the only writer. The column is jsonb though, so this maps
   * by whitelist and refuses to echo anything it does not recognise rather than
   * dumping a raw token into customer-facing copy.
   */
  checkpointStatus(status: string | null): string {
    switch ((status ?? '').trim()) {
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

  carrierName(leg: DeliveryLegView): string {
    return CARRIER_NAMES[leg.carrier] ?? leg.carrier;
  }

  /**
   * Rider, first name only. The API hands over whatever staff typed, which can
   * be a full name and phone-adjacent detail; the customer only needs enough to
   * greet the person at the door. Returns null when nothing was entered.
   */
  riderName(leg: DeliveryLegView): string | null {
    const raw = (leg.driverName ?? '').trim();
    if (!raw) return null;
    return raw.split(/\s+/)[0] || null;
  }

  /**
   * Product name once the API sends it; SKU until then. Never fabricates a name
   * from the SKU.
   */
  itemLabel(v: { product?: { name: string } | null; sku: string }): string {
    return v.product?.name?.trim() || v.sku;
  }

  variantLine(v: { size: string | null; colour: string | null }): string {
    return [v.size, v.colour].filter(Boolean).join(' · ') || 'One size';
  }

  needsPayment(): boolean {
    const o = this.order();
    if (!o) return false;
    if (o.status === 'cancelled' || o.status === 'returned') return false;
    return o.paymentStatus !== 'paid' && o.status === 'awaiting_payment';
  }

  readonly returnDeadline = computed(() => {
    const d = this.deliveredAt();
    return d ? new Date(new Date(d).getTime() + RETURN_WINDOW_MS) : null;
  });

  readonly returnEligible = computed(() => {
    const o = this.order();
    const deadline = this.returnDeadline();
    return !!o && o.status === 'delivered' && !!deadline && deadline.getTime() > Date.now();
  });

  ngOnInit(): void {
    this.orderId = this.route.snapshot.paramMap.get('id') ?? '';
    this.reload();
    this.startPolling();
    this.openStream();
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.streamAbort?.abort();
    clearTimeout(this.copyResetTimer);
  }

  /** Full reload of order + tracking, used on mount and by the Retry button. */
  reload(): void {
    if (!this.orderId || this.loading()) return;
    this.loading.set(true);
    this.loadError.set(null);
    this.api.order(this.orderId).subscribe({
      next: (o) => {
        this.order.set(o);
        for (const item of o.items) this.ratings[item.variant.id] ??= 5;
        this.loading.set(false);
        this.refreshTracking();
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(
          err?.status === 403 || err?.status === 404
            ? 'This order does not exist, or it is not on this account.'
            : (err?.error?.message ?? 'Something went wrong loading your order.'),
        );
      },
    });
  }

  /**
   * Re-reads tracking. Coalesces bursts (several checkpoints at once) into one
   * request so a busy delivery leg cannot stampede the API.
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
          this.loadError.set(null);
        },
        error: () => {
          /* the order itself loaded; leave the tracking panels to the next tick */
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
   * reason the page keeps working off the poll timer, and the stream is retried.
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

  /**
   * Opens a Paystack session. The API mints a fresh reference per call, so this
   * doubles as the retry for an order stranded by a failed checkout session.
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

  /**
   * Clipboard write with a fallback, because the async API is unavailable on
   * insecure origins and inside some in-app browsers.
   */
  copy(legNumber: number, value: string): void {
    const confirm = () => {
      this.copiedLeg.set(legNumber);
      clearTimeout(this.copyResetTimer);
      this.copyResetTimer = setTimeout(() => this.copiedLeg.set(null), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(confirm, () => {
        if (this.legacyCopy(value)) confirm();
      });
      return;
    }
    if (this.legacyCopy(value)) confirm();
  }

  private legacyCopy(value: string): boolean {
    try {
      const el = document.createElement('textarea');
      el.value = value;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
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
