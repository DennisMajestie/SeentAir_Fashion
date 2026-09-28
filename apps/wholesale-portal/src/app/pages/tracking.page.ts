import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, DeliveryLegView, Invoice } from '../api.service';
import { pill } from '../status-pill';

/** Fallback poll cadence while the SSE stream is down, and the slow cadence
    used while it is up. Visibility-aware, so a backgrounded tab costs nothing. */
const POLL_FAST_MS = 15_000;
const POLL_SLOW_MS = 60_000;
/** Wait before re-dialling a stream that dropped. */
const STREAM_RETRY_MS = 30_000;

interface TrackingEvent {
  status: string;
  /** Optional: a customer-facing projection omits staff-authored free text. */
  note?: string | null;
  createdAt: string;
}

interface Stage {
  key: RegExp;
  label: string;
  fallbackNote: string;
}

/**
 * W8 — Wholesale order tracking: freight header, GIGL corridor panel,
 * progress timeline mapped onto the four canonical stages (fed by the
 * live tracking events), freight leg, package manifest, support & policy.
 */
@Component({
  selector: 'app-tracking',
  imports: [CommonModule, RouterLink],
  template: `
    <div
      style="display:flex; justify-content:space-between; align-items:center; gap: var(--space-sm); flex-wrap:wrap"
    >
      <a class="link backlink" routerLink="/orders">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span> Back to orders
      </a>
      <span class="chip">GIGL logistics</span>
    </div>

    @if (loaded()) {
      <section class="panel">
        <div class="tagbar">
          <span>Wholesale freight tracking</span>
          <span class="status" [class]="'status ' + pill(status())">{{
            status().replaceAll('_', ' ')
          }}</span>
        </div>
        <h1 style="font-size: var(--type-heading-md)">
          Order #SNT-{{ orderId().slice(0, 8).toUpperCase() }}
        </h1>
        <div class="meta-grid" style="margin-bottom:0">
          <div class="mg">
            <span class="m-l">Current status</span>
            <span class="m-v">{{ status().replaceAll('_', ' ') }}</span>
          </div>
          <div class="mg">
            <span class="m-l">Last event</span>
            <span class="m-v">{{
              lastEventAt() ? (lastEventAt() | date: 'dd MMM, HH:mm') : '—'
            }}</span>
          </div>
          <div class="mg">
            <span class="m-l">Batch volume</span>
            <span class="m-v">{{ invoice() ? units(invoice()!) + ' garment units' : '—' }}</span>
          </div>
          <!-- GAP: consignee destination address awaits the buyer address-book module -->
          <div class="mg">
            <span class="m-l">Destination</span> <span class="m-v">Confirmed with desk</span>
          </div>
        </div>
        <div class="actions">
          <a class="link" [routerLink]="['/orders', orderId(), 'invoice']"
            >Manifest &amp; invoice</a
          >
        </div>
      </section>

      <!-- GAP: live GPS corridor map awaits GIGL telemetry via the logistics
           adapter — the corridor panel states the real route policy instead. -->
      <section class="panel">
        <div class="tagbar">
          <span
            ><span
              class="material-symbols-outlined"
              style="font-size:14px; vertical-align:-2px"
              aria-hidden="true"
              >route</span
            >
            Logistics freight corridor</span
          >
          <span>Aba — nationwide</span>
        </div>
        <div
          class="leg-row"
          style="display:flex; justify-content:space-between; gap: var(--space-md); font-size: var(--type-body-sm); color: var(--muted)"
        >
          <span>Interstate transit vector</span>
          <span class="chip dark">Carrier: GIGL</span>
        </div>
        <p class="muted small" style="margin: var(--space-sm) 0 0">
          Batches dispatch from the Aba workshop onto the GIGL national freight network. Waybill
          telemetry appears here as the carrier integration comes online.
        </p>
      </section>

      <div class="section-head">
        <h2>Order progress timeline</h2>
        <span class="aside">Local time (WAT)</span>
      </div>
      <div class="timeline">
        @for (stage of stages; track stage.label; let idx = $index) {
          <div
            class="tl-step"
            [class.done]="stageState(idx) === 'done'"
            [class.current]="stageState(idx) === 'current'"
            [class.pending]="stageState(idx) === 'pending'"
          >
            <span class="tl-dot">
              <span class="material-symbols-outlined" aria-hidden="true">
                {{
                  stageState(idx) === 'done'
                    ? 'check'
                    : stageState(idx) === 'current'
                      ? 'sync'
                      : 'schedule'
                }}
              </span>
            </span>
            <div class="tl-card">
              <div class="tl-head">
                <span>{{ stage.label }}</span>
                <span class="tl-when">
                  {{
                    stageEvent(idx)
                      ? (stageEvent(idx)!.createdAt | date: 'dd MMM, HH:mm')
                      : 'Pending'
                  }}
                </span>
              </div>
              <p class="tl-note">
                {{ stageEvent(idx)?.note || stage.fallbackNote }}
              </p>
            </div>
          </div>
        }
      </div>
      @if (extraEvents().length > 0) {
        <section class="panel">
          <div class="tagbar">
            <span>Additional ledger events</span><span>{{ extraEvents().length }}</span>
          </div>
          @for (event of extraEvents(); track event.createdAt) {
            <p class="small">
              <strong>{{ event.status.replaceAll('_', ' ') }}</strong> —
              {{ event.note ?? 'recorded' }}
              <span class="muted">({{ event.createdAt | date: 'medium' }})</span>
            </p>
          }
        </section>
      }

      <div class="section-head">
        <h2>Freight breakdown</h2>
        <span class="aside">Single leg · GIGL</span>
      </div>
      <!-- GAP: multi-leg waybill breakdown (carrier, route vectors, waybill refs)
           awaits the GIGL adapter's shipment API — one honest leg is shown. -->
      <div class="leg-card">
        <div class="leg-head">
          <span
            ><span
              class="material-symbols-outlined"
              style="font-size:14px; vertical-align:-2px"
              aria-hidden="true"
              >local_shipping</span
            >
            @if (leg(); as l) {
              Factory dispatch via {{ carrierLabel(l) }}
            } @else {
              Factory dispatch via GIGL
            }
          </span>
          <span class="chip" [class.okc]="delivered()">{{
            delivered() ? 'Delivered' : legStatus()
          }}</span>
        </div>
        <div class="leg-row">
          <span>Assigned carrier</span>
          <span class="v">
            @if (leg(); as l) {
              {{ carrierLabel(l) }}
            } @else {
              GIGL (first-line, pluggable)
            }
          </span>
        </div>
        <div class="leg-row">
          <span>Route vector</span>
          <span class="v">
            @if (legZone()) {
              {{ legZone() }}
            } @else {
              Aba workshop → consignee hub
            }
          </span>
        </div>
        <div class="leg-ref">
          <span>Tracking waybill</span>
          <span class="v">{{ leg()?.trackingRef ?? 'Issued at dispatch' }}</span>
        </div>
        @if (riderFirstName()) {
          <div class="leg-row">
            <span>Rider</span><span class="v">{{ riderFirstName() }}</span>
          </div>
        }

        @if (leg(); as l) {
          <div class="section-head" style="margin-top: var(--space-md)">
            <h2>Delivery updates</h2>
            <span class="aside">{{ l.checkpoints.length }}</span>
          </div>
          @if (l.checkpoints.length) {
            @for (cp of l.checkpoints; track $index) {
              <div class="leg-row">
                <span>{{ cp.at | date: 'medium' }}</span>
                <span class="v">{{ checkpointLabel(cp) }}</span>
              </div>
            }
          } @else {
            <p class="muted small" style="margin: 0">
              No delivery updates recorded yet. They appear here the moment the factory or courier
              reports them.
            </p>
          }
        }

        <p class="muted small" style="margin: var(--space-sm) 0 0">
          @if (live()) {
            Live — this page updates itself while it stays open.
          } @else {
            Checking every {{ pollSeconds() }}s while this tab is open.
          }
        </p>
      </div>

      @if (invoice(); as inv) {
        <div class="section-head">
          <h2>Package manifest</h2>
          <span class="aside">{{ units(inv) }} units</span>
        </div>
        <section class="panel">
          @for (item of inv.items; track item.sku) {
            <div class="oc-line" style="margin-top: 0; margin-bottom: var(--space-sm)">
              <span
                ><code>{{ item.sku }}</code></span
              >
              <span class="num">{{ item.quantity }}×</span>
            </div>
          }
          <!-- GAP: bale counts and gross weights await warehouse packing data -->
          <p class="muted small" style="margin:0">Packed and sealed at the Aba factory floor.</p>
        </section>
      }

      <div class="section-head"><h2>Dispatch support &amp; policy</h2></div>
      <a class="cta" style="width:100%" href="tel:+23418887400">
        <span class="material-symbols-outlined" aria-hidden="true">support_agent</span>
        Need logistics help? Call the Aba hub
      </a>
      <div class="policy-strip">
        <span class="material-symbols-outlined" aria-hidden="true">assignment_return</span>
        <div>
          <strong>Return policy notice</strong>
          Return requests must be submitted within 12 hours of confirmed delivery and are completed
          within 24 hours. Custom production batches are non-returnable.
        </div>
      </div>
      <!-- GAP: returns intake endpoint not exposed to the portal yet — the desk
           handles the 12-hour window by phone; button stays locked. -->
      <button
        class="cta quiet"
        style="width:100%"
        disabled
        [title]="
          delivered() ? 'Returns are handled by the desk — call the hub' : 'Available upon delivery'
        "
      >
        <span class="material-symbols-outlined" aria-hidden="true">lock</span>
        Request return {{ delivered() ? '(call the hub)' : '(available upon delivery)' }}
      </button>
    } @else if (failed()) {
      <p class="error">
        Tracking unavailable for this order. <a class="link" routerLink="/orders">Back to orders</a>
      </p>
    } @else {
      <p class="muted">Loading freight tracking…</p>
    }
  `,
})
export class TrackingPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly pill = pill;
  readonly orderId = signal('');
  readonly status = signal('');
  readonly events = signal<TrackingEvent[]>([]);
  readonly deliveries = signal<DeliveryLegView[]>([]);
  readonly live = signal(false);
  readonly pollSeconds = signal(POLL_FAST_MS / 1000);
  readonly invoice = signal<Invoice | null>(null);
  readonly loaded = signal(false);
  readonly failed = signal(false);

  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private streamAbort: AbortController | undefined;
  private refetchQueued = false;

  /** The four canonical W8 stages; live events map in by status. */
  readonly stages: Stage[] = [
    {
      key: /received|verified|confirmed|paid/,
      label: 'Order received & verified',
      fallbackNote:
        'Payment verification pending — the batch is allocated once the desk confirms settlement.',
    },
    {
      key: /processing|production|packaging|packing|qc/,
      label: 'Processing & packaging',
      fallbackNote: 'Cutting, sewing, finishing and QC at the Aba workshop, then carton bundling.',
    },
    {
      key: /shipped|dispatch|transit|out_for/,
      label: 'Shipped / waybill dispatched',
      fallbackNote: 'Waybill documentation prepared ahead of GIGL haulage loading.',
    },
    {
      key: /delivered|handover|completed/,
      label: 'Delivered / consignee handover',
      fallbackNote: 'Consignee verification on physical freight release at the destination hub.',
    },
  ];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.orderId.set(id);
    this.refreshTracking((ok) => {
      if (ok) this.loaded.set(true);
      else this.failed.set(true);
    });
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

  /**
   * Re-reads tracking. Coalesces bursts into one request so several corridor
   * checkpoints arriving together cannot stampede the API. `settled` fires on
   * the first attempt only, so it can drive the loaded/failed banner without
   * later polls resetting it.
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
        error: () => settled?.(false),
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

  /** 'gigl' is the carrier key; anything else is already a carrier name. */
  carrierLabel(leg: DeliveryLegView): string {
    return leg.carrier === 'gigl' ? 'GIGL courier' : leg.carrier;
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

  /** The first delivery leg, if one has been booked. Public: the template reads it. */
  leg(): DeliveryLegView | null {
    return this.deliveries()[0] ?? null;
  }

  /**
   * Courier zone, when the API still sends one. Optional by design: a
   * customer-facing projection omits it, so this must degrade to null rather
   * than render an empty cell or the string "undefined". Written to be safe to
   * ship before or after that backend change.
   */
  legZone(): string | null {
    const zone = (this.leg() as { zone?: string | null } | null)?.zone;
    return zone && zone.trim() ? zone : null;
  }

  /** Rider, first name only. Returns null when the field is absent or blank. */
  riderFirstName(): string | null {
    const name = (this.leg()?.driverName ?? '').trim();
    if (!name) return null;
    return name.split(/\s+/)[0] || null;
  }

  /**
   * Checkpoint label: status only. `zone` is an internal corridor label and
   * `note` is free text typed by staff, so neither is shown to a wholesale
   * buyer. Read defensively, so this renders correctly against both the
   * current full projection and the reduced customer one.
   */
  checkpointLabel(cp: {
    status?: string | null;
    zone?: string | null;
    note?: string | null;
  }): string {
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

  private stageIndexOf(status: string): number {
    for (let i = this.stages.length - 1; i >= 0; i--) {
      if (this.stages[i].key.test(status)) return i;
    }
    return 0;
  }

  private currentIndex(): number {
    const fromEvents = this.events().map((e) => this.stageIndexOf(e.status));
    const fromStatus = this.status() ? [this.stageIndexOf(this.status())] : [];
    return Math.max(0, ...fromEvents, ...fromStatus);
  }

  stageState(idx: number): 'done' | 'current' | 'pending' {
    const current = this.currentIndex();
    const finished = idx === this.stages.length - 1 && /delivered|completed/.test(this.status());
    if (idx < current || finished) return 'done';
    if (idx === current) return 'current';
    return 'pending';
  }

  stageEvent(idx: number): TrackingEvent | null {
    const matches = this.events().filter((e) => this.stageIndexOf(e.status) === idx);
    return matches.length ? matches[matches.length - 1] : null;
  }

  extraEvents(): TrackingEvent[] {
    // Events whose status maps to stage 0 by fallback but isn't a genuine match anywhere.
    return this.events().filter((e) => !this.stages.some((s) => s.key.test(e.status)));
  }

  lastEventAt(): string | null {
    const ev = this.events();
    return ev.length ? ev[ev.length - 1].createdAt : null;
  }

  delivered(): boolean {
    return /delivered|completed/.test(this.status());
  }

  legStatus(): string {
    return /shipped|transit|dispatch/.test(this.status()) ? 'In transit' : 'Awaiting dispatch';
  }

  units(inv: Invoice): number {
    return inv.items.reduce((n, i) => n + i.quantity, 0);
  }
}
