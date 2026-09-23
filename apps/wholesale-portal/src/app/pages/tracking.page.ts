import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, Invoice } from '../api.service';
import { pill } from '../status-pill';

interface TrackingEvent {
  status: string;
  note: string | null;
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
    <div style="display:flex; justify-content:space-between; align-items:center; gap: var(--space-sm); flex-wrap:wrap">
      <a class="link backlink" routerLink="/orders">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span> Back to orders
      </a>
      <span class="chip">GIGL logistics</span>
    </div>

    @if (loaded()) {
      <section class="panel">
        <div class="tagbar">
          <span>Wholesale freight tracking</span>
          <span class="status" [class]="'status ' + pill(status())">{{ status().replaceAll('_', ' ') }}</span>
        </div>
        <h1 style="font-size: var(--type-heading-md)">Order #SNT-{{ orderId().slice(0, 8).toUpperCase() }}</h1>
        <div class="meta-grid" style="margin-bottom:0">
          <div class="mg"><span class="m-l">Current status</span>
            <span class="m-v">{{ status().replaceAll('_', ' ') }}</span></div>
          <div class="mg"><span class="m-l">Last event</span>
            <span class="m-v">{{ lastEventAt() ? (lastEventAt() | date: 'dd MMM, HH:mm') : '—' }}</span></div>
          <div class="mg"><span class="m-l">Batch volume</span>
            <span class="m-v">{{ invoice() ? units(invoice()!) + ' garment units' : '—' }}</span></div>
          <!-- GAP: consignee destination address awaits the buyer address-book module -->
          <div class="mg"><span class="m-l">Destination</span>
            <span class="m-v">Confirmed with desk</span></div>
        </div>
        <div class="actions">
          <a class="link" [routerLink]="['/orders', orderId(), 'invoice']">Manifest &amp; invoice</a>
        </div>
      </section>

      <!-- GAP: live GPS corridor map awaits GIGL telemetry via the logistics
           adapter — the corridor panel states the real route policy instead. -->
      <section class="panel">
        <div class="tagbar">
          <span><span class="material-symbols-outlined" style="font-size:14px; vertical-align:-2px"
            aria-hidden="true">route</span> Logistics freight corridor</span>
          <span>Lagos → nationwide</span>
        </div>
        <div class="leg-row" style="display:flex; justify-content:space-between; gap: var(--space-md); font-size: var(--type-body-sm); color: var(--muted)">
          <span>Interstate transit vector</span>
          <span class="chip dark">Carrier: GIGL</span>
        </div>
        <p class="muted small" style="margin: var(--space-sm) 0 0">
          Batches dispatch from the Yaba workshop onto the GIGL national freight network.
          Waybill telemetry appears here as the carrier integration comes online.
        </p>
      </section>

      <div class="section-head">
        <h2>Order progress timeline</h2>
        <span class="aside">Local time (WAT)</span>
      </div>
      <div class="timeline">
        @for (stage of stages; track stage.label; let idx = $index) {
          <div class="tl-step" [class.done]="stageState(idx) === 'done'"
            [class.current]="stageState(idx) === 'current'"
            [class.pending]="stageState(idx) === 'pending'">
            <span class="tl-dot">
              <span class="material-symbols-outlined" aria-hidden="true">
                {{ stageState(idx) === 'done' ? 'check' : stageState(idx) === 'current' ? 'sync' : 'schedule' }}
              </span>
            </span>
            <div class="tl-card">
              <div class="tl-head">
                <span>{{ stage.label }}</span>
                <span class="tl-when">
                  {{ stageEvent(idx) ? (stageEvent(idx)!.createdAt | date: 'dd MMM, HH:mm') : 'Pending' }}
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
          <div class="tagbar"><span>Additional ledger events</span><span>{{ extraEvents().length }}</span></div>
          @for (event of extraEvents(); track event.createdAt) {
            <p class="small"><strong>{{ event.status.replaceAll('_', ' ') }}</strong>
              — {{ event.note ?? 'recorded' }}
              <span class="muted">({{ event.createdAt | date: 'medium' }})</span></p>
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
          <span><span class="material-symbols-outlined" style="font-size:14px; vertical-align:-2px"
            aria-hidden="true">local_shipping</span> Factory dispatch via GIGL</span>
          <span class="chip" [class.okc]="delivered()">{{ delivered() ? 'Delivered' : legStatus() }}</span>
        </div>
        <div class="leg-row"><span>Assigned carrier</span><span class="v">GIGL (first-line, pluggable)</span></div>
        <div class="leg-row"><span>Route vector</span><span class="v">Yaba workshop → consignee hub</span></div>
        <div class="leg-ref">
          <span>Tracking waybill</span>
          <span class="v">Issued at dispatch</span>
        </div>
      </div>

      @if (invoice(); as inv) {
        <div class="section-head">
          <h2>Package manifest</h2>
          <span class="aside">{{ units(inv) }} units</span>
        </div>
        <section class="panel">
          @for (item of inv.items; track item.sku) {
            <div class="oc-line" style="margin-top: 0; margin-bottom: var(--space-sm)">
              <span><code>{{ item.sku }}</code></span>
              <span class="num">{{ item.quantity }}×</span>
            </div>
          }
          <!-- GAP: bale counts and gross weights await warehouse packing data -->
          <p class="muted small" style="margin:0">Packed and sealed at the Lagos factory floor.</p>
        </section>
      }

      <div class="section-head"><h2>Dispatch support &amp; policy</h2></div>
      <a class="cta" style="width:100%" href="tel:+23418887400">
        <span class="material-symbols-outlined" aria-hidden="true">support_agent</span>
        Need logistics help? Call the Yaba hub
      </a>
      <div class="policy-strip">
        <span class="material-symbols-outlined" aria-hidden="true">assignment_return</span>
        <div>
          <strong>Return policy notice</strong>
          Return requests must be submitted within 12 hours of confirmed delivery and are
          completed within 24 hours. Custom production batches are non-returnable.
        </div>
      </div>
      <!-- GAP: returns intake endpoint not exposed to the portal yet — the desk
           handles the 12-hour window by phone; button stays locked. -->
      <button class="cta quiet" style="width:100%" disabled
        [title]="delivered() ? 'Returns are handled by the desk — call the hub' : 'Available upon delivery'">
        <span class="material-symbols-outlined" aria-hidden="true">lock</span>
        Request return {{ delivered() ? '(call the hub)' : '(available upon delivery)' }}
      </button>
    } @else if (failed()) {
      <p class="error">Tracking unavailable for this order.
        <a class="link" routerLink="/orders">Back to orders</a></p>
    } @else {
      <p class="muted">Loading freight tracking…</p>
    }
  `,
})
export class TrackingPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly pill = pill;
  readonly orderId = signal('');
  readonly status = signal('');
  readonly events = signal<TrackingEvent[]>([]);
  readonly invoice = signal<Invoice | null>(null);
  readonly loaded = signal(false);
  readonly failed = signal(false);

  /** The four canonical W8 stages; live events map in by status. */
  readonly stages: Stage[] = [
    {
      key: /received|verified|confirmed|paid/,
      label: 'Order received & verified',
      fallbackNote: 'Payment verification pending — the batch is allocated once the desk confirms settlement.',
    },
    {
      key: /processing|production|packaging|packing|qc/,
      label: 'Processing & packaging',
      fallbackNote: 'Cutting, sewing, finishing and QC at the Yaba workshop, then carton bundling.',
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
    this.api.tracking(id).subscribe({
      next: (t) => {
        this.status.set(t.status);
        this.events.set(t.events);
        this.loaded.set(true);
      },
      error: () => this.failed.set(true),
    });
    this.api.invoices().subscribe({
      next: (res) => this.invoice.set(res.data.find((i) => i.orderId === id) ?? null),
      error: () => undefined,
    });
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
