import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface LegRow { id: string; carrier: string; legNumber: number; status: string; trackingRef: string | null; cost: number | null; order: { id: string }; }
interface ZoneRow { id: string; zone: string; baseFee: number; pricePerKg: number; }

const LEG_STATUSES = ['pending', 'in_transit', 'delivered', 'failed'];

/** A12 — Inter-facility haulage & delivery logistics. Approved Stitch layout:
    transit KPIs, status-filtered haulage runs, a master-waybill inspector per
    leg (carrier tracking read), plus the zone-pricing engine and quote
    calculator. GIGL sits behind the pluggable carrier adapter. */
@Component({
  selector: 'app-logistics-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Operations · Deliveries & haulage</p>
        <h1>Inter-facility haulage & delivery logistics</h1>
        <p class="ops-sub">Real-time tracking of finished goods legs between factory, depots and customers.</p>
      </div>
      <div class="ops-actions">
        <span class="live-chip">Tracking live</span>
        <button class="cta small" type="button" (click)="showCreate.set(!showCreate())">{{ showCreate() ? 'Close' : '⚡ Schedule haulage dispatch' }}</button>
      </div>
    </div>

    <div class="kpi-bar">
      <div class="kpi"><span class="kpi-label">Haulage runs</span><span class="kpi-value">{{ legs().length }}</span><span class="kpi-sub">delivery legs on record</span></div>
      <div class="kpi"><span class="kpi-label">Active transit</span><span class="kpi-value">{{ countStatus('in_transit') }}</span><span class="kpi-sub">{{ countStatus('pending') }} awaiting gate pass</span></div>
      <div class="kpi"><span class="kpi-label">Delivered & signed</span><span class="kpi-value">{{ countStatus('delivered') }}</span><span class="kpi-sub">{{ countStatus('failed') }} failed leg(s)</span></div>
      <div class="kpi"><span class="kpi-label">Freight spend</span><span class="kpi-value">₦{{ totalCost() | number: '1.0-0' }}</span><span class="kpi-sub">recorded leg costs</span></div>
      <!-- GAP: unit volumes per run (pcs) need consignment contents the delivery leg doesn't store. -->
    </div>

    @if (showCreate()) {
      <section class="panel">
        <div class="panel-head"><h2>Schedule haulage dispatch</h2><span class="ph-sub">creates a delivery leg</span></div>
        <form class="form-grid" (ngSubmit)="create()">
          <label class="wide">Order id <input [(ngModel)]="nd.orderId" name="doid" required placeholder="paste manifest ref (order uuid)" /></label>
          <label>Carrier
            <select [(ngModel)]="nd.carrier" name="dcar">
              <option value="gigl">GIGL (API)</option>
              <option value="dispatch_rider">Dispatch rider</option>
              <option value="transport_co">Transport company</option>
            </select>
          </label>
          <label>Leg # <input type="number" min="1" [(ngModel)]="nd.legNumber" name="dleg" /></label>
          <label>Weight kg <input type="number" min="0" step="0.1" [(ngModel)]="nd.weightKg" name="dw" /></label>
          <label>Zone
            <select [(ngModel)]="nd.zone" name="dz">
              <option value="">—</option>
              @for (z of zones(); track z.id) { <option [value]="z.zone">{{ z.zone }}</option> }
            </select>
          </label>
          <div class="wide"><button class="cta small" type="submit">Create leg</button></div>
        </form>
      </section>
    }

    <div class="ops-toolbar">
      <div class="seg" role="group" aria-label="Leg status">
        <button type="button" [class.on]="statusFilter() === ''" (click)="statusFilter.set('')">All runs <span class="seg-n">{{ legs().length }}</span></button>
        @for (s of legStatuses; track s) {
          <button type="button" [class.on]="statusFilter() === s" (click)="statusFilter.set(s)">
            {{ s.replaceAll('_', ' ') }} <span class="seg-n">{{ countStatus(s) }}</span>
          </button>
        }
      </div>
    </div>

    <div class="side-split">
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Waybill / run</th><th>Carrier</th><th>Leg</th><th>Tracking</th><th>Cost</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (l of visible(); track l.id) {
              <tr class="clickable" [class.sel]="selected()?.id === l.id" (click)="select(l)">
                <td><code>WB-{{ l.id.slice(0, 6) }}</code><br /><span class="mini-note">order {{ l.order.id.slice(0, 8) }}</span></td>
                <td><span class="chip" [class.acid]="l.carrier === 'gigl'">{{ l.carrier.replaceAll('_', ' ') }}</span></td>
                <td class="mono">{{ l.legNumber }}</td>
                <td class="mono small">{{ l.trackingRef || '—' }}</td>
                <td class="mono">{{ l.cost !== null ? '₦' + (l.cost | number) : '—' }}</td>
                <td><span class="chip" [class.ok]="l.status === 'delivered'" [class.warn]="l.status === 'in_transit'" [class.bad]="l.status === 'failed'">{{ l.status.replaceAll('_', ' ') }}</span></td>
                <td>
                  <div class="actions flat">
                    <select [(ngModel)]="statusChoice[l.id]" [name]="'s' + l.id" (click)="$event.stopPropagation()">
                      @for (s of legStatuses; track s) { <option [value]="s">{{ s.replaceAll('_', ' ') }}</option> }
                    </select>
                    <button class="cta small ghost" (click)="setStatus(l); $event.stopPropagation()">Set</button>
                  </div>
                </td>
              </tr>
            }
            @if (visible().length === 0) { <tr><td colspan="7" class="muted small">No haulage runs in this view.</td></tr> }
          </tbody>
        </table>
      </div>

      <aside class="inspector">
        @if (selected(); as l) {
          <div class="insp-head">
            <h2>Master waybill WB-{{ l.id.slice(0, 6) }}</h2>
            <span class="chip" [class.ok]="l.status === 'delivered'" [class.warn]="l.status === 'in_transit'" [class.bad]="l.status === 'failed'">{{ l.status.replaceAll('_', ' ') }}</span>
          </div>
          <dl class="kv">
            <dt>Order manifest</dt><dd><code class="wrap-anywhere">{{ l.order.id }}</code></dd>
            <dt>Carrier</dt><dd>{{ l.carrier.replaceAll('_', ' ') }}</dd>
            <dt>Leg number</dt><dd>{{ l.legNumber }}</dd>
            <dt>Freight cost</dt><dd>{{ l.cost !== null ? '₦' + (l.cost | number) : 'not recorded' }}</dd>
          </dl>

          <div class="panel-head"><h2>Carrier telemetry</h2><span class="ph-sub">live tracking read</span></div>
          @if (tracking(); as t) {
            <dl class="kv">
              <dt>Tracking ref</dt><dd class="wrap-anywhere">{{ t['trackingRef'] || '—' }}</dd>
              <dt>Carrier status</dt><dd>{{ t['status'] }}</dd>
              @if (t['dispatchedAt']) { <dt>Dispatched</dt><dd>{{ str(t['dispatchedAt']) | date: 'medium' }}</dd> }
              @if (t['deliveredAt']) { <dt>Delivered</dt><dd>{{ str(t['deliveredAt']) | date: 'medium' }}</dd> }
            </dl>
          } @else {
            <p class="muted small">Fetching tracking…</p>
          }
          <!-- GAP: the reference's live corridor map, torque-seal checkpoints and driver
               PIN handshake need GPS/telematics feeds no carrier integration provides yet
               (GIGL adapter awaits production keys). -->
        } @else {
          <p class="muted small">Select a haulage run to open its master waybill and carrier telemetry.</p>
        }

        <div class="gap-sep"></div>
        <div class="panel-head"><h2>Zone pricing engine</h2><span class="ph-sub">weight + location</span></div>
        <table class="table">
          <thead><tr><th>Zone</th><th>Base ₦</th><th>Per kg ₦</th></tr></thead>
          <tbody>
            @for (z of zones(); track z.id) {
              <tr><td><strong>{{ z.zone }}</strong></td><td class="mono">{{ z.baseFee | number }}</td><td class="mono">{{ z.pricePerKg | number }}</td></tr>
            }
          </tbody>
        </table>
        <form class="form-grid" (ngSubmit)="upsertZone()">
          <label>Zone <input [(ngModel)]="nz.zone" name="zz" required placeholder="interstate" /></label>
          <label>Base fee ₦ <input type="number" min="0" [(ngModel)]="nz.baseFee" name="zb" required /></label>
          <label>Per kg ₦ <input type="number" min="0" [(ngModel)]="nz.pricePerKg" name="zp" required /></label>
          <div class="wide"><button class="cta small ghost" type="submit">Save zone</button></div>
        </form>

        <div class="panel-head"><h2>Quote calculator</h2></div>
        <form class="form-grid" (ngSubmit)="getQuote()">
          <label>Weight kg <input type="number" min="0" step="0.1" [(ngModel)]="qc.weightKg" name="qw" required /></label>
          <label>Zone
            <select [(ngModel)]="qc.zone" name="qz" required>
              @for (z of zones(); track z.id) { <option [value]="z.zone">{{ z.zone }}</option> }
            </select>
          </label>
          <div class="wide actions flat">
            <button class="cta small ghost" type="submit">Quote</button>
            @if (quoteResult() !== null) { <span class="naira stat-md">₦{{ quoteResult() | number: '1.0-2' }}</span> }
          </div>
        </form>
      </aside>
    </div>

    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class LogisticsAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly legs = signal<LegRow[]>([]);
  readonly zones = signal<ZoneRow[]>([]);
  readonly selected = signal<LegRow | null>(null);
  readonly tracking = signal<Record<string, unknown> | null>(null);
  readonly quoteResult = signal<number | null>(null);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly showCreate = signal(false);
  readonly statusFilter = signal('');
  readonly legStatuses = LEG_STATUSES;
  statusChoice: Record<string, string> = {};
  nd = { orderId: '', carrier: 'dispatch_rider', legNumber: 1, weightKg: 0, zone: '' };
  nz = { zone: '', baseFee: 0, pricePerKg: 0 };
  qc = { weightKg: 0, zone: '' };

  ngOnInit(): void { this.load(); }
  private load(): void {
    this.api.deliveries().subscribe((res) => {
      const rows = res.data as unknown as LegRow[];
      this.legs.set(rows);
      for (const l of rows) this.statusChoice[l.id] ??= l.status;
      const sel = this.selected();
      if (sel) this.selected.set(rows.find((l) => l.id === sel.id) ?? null);
    });
    this.api.deliveryPricing().subscribe((res) => this.zones.set(res as unknown as ZoneRow[]));
  }

  countStatus(s: string): number { return this.legs().filter((l) => l.status === s).length; }
  readonly totalCost = computed(() => this.legs().reduce((sum, l) => sum + (Number(l.cost) || 0), 0));

  visible(): LegRow[] {
    const s = this.statusFilter();
    return s ? this.legs().filter((l) => l.status === s) : this.legs();
  }

  str(v: unknown): string { return v == null ? '' : String(v); }

  /** Waybill inspector: carrier-side tracking for one leg. */
  select(l: LegRow): void {
    if (this.selected()?.id === l.id) { this.selected.set(null); this.tracking.set(null); return; }
    this.selected.set(l);
    this.tracking.set(null);
    this.api.deliveryTracking(l.id).subscribe({
      next: (t) => this.tracking.set(t),
      error: (e) => { this.tracking.set(null); this.fail(e, 'Tracking unavailable for that leg.'); },
    });
  }

  private ok(m: string): void { this.message.set(m); this.error.set(null); this.load(); }
  private fail(e: { error?: { message?: string } }, fb: string): void { this.error.set(e?.error?.message ?? fb); this.message.set(null); }

  create(): void {
    this.api.createDelivery({
      orderId: this.nd.orderId, carrier: this.nd.carrier, legNumber: Number(this.nd.legNumber),
      weightKg: this.nd.weightKg ? Number(this.nd.weightKg) : undefined, zone: this.nd.zone || undefined,
    }).subscribe({ next: () => { this.showCreate.set(false); this.ok('Delivery leg created.'); }, error: (e) => this.fail(e, 'Create failed — GIGL needs API keys; use a manual carrier meanwhile.') });
  }

  upsertZone(): void {
    this.api.upsertPricing({ zone: this.nz.zone, baseFee: Number(this.nz.baseFee), pricePerKg: Number(this.nz.pricePerKg) })
      .subscribe({ next: () => this.ok('Zone saved.'), error: (e) => this.fail(e, 'Zone save failed.') });
  }

  getQuote(): void {
    this.api.quote(Number(this.qc.weightKg), this.qc.zone).subscribe({
      next: (r) => this.quoteResult.set(r.cost),
      error: (e) => this.fail(e, 'No pricing for that zone.'),
    });
  }

  setStatus(l: LegRow): void {
    this.api.updateDeliveryStatus(l.id, this.statusChoice[l.id]).subscribe({
      next: () => this.ok('Status updated.'),
      error: (e) => this.fail(e, 'Update failed.'),
    });
  }
}
