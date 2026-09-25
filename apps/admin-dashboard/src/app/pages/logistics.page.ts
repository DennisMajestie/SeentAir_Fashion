import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface LegRow { id: string; carrier: string; legNumber: number; status: string; trackingRef: string | null; cost: number | null; order: { id: string }; driverName: string | null; driverPhone: string | null; contents: Array<{ sku?: string; quantity: number }> | null; checkpoints: Array<Record<string, unknown>> | null; }
interface CheckpointRow { zone: string; sealId: string | null; status: string; note: string | null; driverName: string | null; driverPhone: string | null; at: string; }
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
        <p class="eyebrow">Operations · Deliveries</p>
        <h1>Deliveries & shipping</h1>
        <p class="ops-sub">Live tracking of finished goods as they move between the factory, depots and customers.</p>
      </div>
      <div class="ops-actions">
        <span class="live-chip">Tracking live</span>
        <button class="cta small" type="button" (click)="showCreate.set(!showCreate())">{{ showCreate() ? 'Close' : '⚡ New delivery run' }}</button>
      </div>
    </div>

    <div class="kpi-bar">
      <div class="kpi"><span class="kpi-label">Delivery runs</span><span class="kpi-value">{{ legs().length }}</span><span class="kpi-sub">runs on record</span></div>
      <div class="kpi"><span class="kpi-label">Active transit</span><span class="kpi-value">{{ countStatus('in_transit') }}</span><span class="kpi-sub">{{ countStatus('pending') }} not yet dispatched</span></div>
      <div class="kpi"><span class="kpi-label">Delivered & signed</span><span class="kpi-value">{{ countStatus('delivered') }}</span><span class="kpi-sub">{{ countStatus('failed') }} failed run(s)</span></div>
      <div class="kpi"><span class="kpi-label">Freight spend</span><span class="kpi-value">₦{{ totalCost() | number: '1.0-0' }}</span><span class="kpi-sub">recorded costs</span></div>
      <div class="kpi"><span class="kpi-label">Units on consignment</span><span class="kpi-value">{{ totalUnits() | number }}</span><span class="kpi-sub">pcs across all legs</span></div>
    </div>

    @if (showCreate()) {
      <section class="panel">
        <div class="panel-head"><h2>New delivery run</h2><span class="ph-sub">books a delivery</span></div>
        <form class="form-grid" (ngSubmit)="create()">
          <label class="wide">Order id <input [(ngModel)]="nd.orderId" name="doid" required placeholder="paste order reference (order id)" /></label>
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
          <label>Driver name <input [(ngModel)]="nd.driverName" name="ddriver" placeholder="Okafor, driver name" /></label>
          <label>Driver phone <input [(ngModel)]="nd.driverPhone" name="dphone" placeholder="0803…" /></label>
          <label class="wide">Contents (pcs) <span class="mini-note">one line per SKU: SKU×qty, e.g. SFT-TEE-BLK-M×5</span>
            <textarea rows="3" [(ngModel)]="nd.contentsText" name="dcontents" placeholder="SFT-TEE-BLK-M×5&#10;SFT-HOOD-NAV-L×3"></textarea>
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
          <thead><tr><th>Shipment / run</th><th>Carrier</th><th>Step</th><th>Tracking</th><th>Cost</th><th>Status</th><th></th></tr></thead>
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
            @if (visible().length === 0) { <tr><td colspan="7" class="muted small">No delivery runs in this view.</td></tr> }
          </tbody>
        </table>
      </div>

      <aside class="inspector">
        @if (selected(); as l) {
          <div class="insp-head">
            <h2>Shipment WB-{{ l.id.slice(0, 6) }}</h2>
            <span class="chip" [class.ok]="l.status === 'delivered'" [class.warn]="l.status === 'in_transit'" [class.bad]="l.status === 'failed'">{{ l.status.replaceAll('_', ' ') }}</span>
          </div>
          <dl class="kv">
            <dt>Order reference</dt><dd><code class="wrap-anywhere">{{ l.order.id }}</code></dd>
            <dt>Carrier</dt><dd>{{ l.carrier.replaceAll('_', ' ') }}</dd>
            <dt>Leg number</dt><dd>{{ l.legNumber }}</dd>
            <dt>Freight cost</dt><dd>{{ l.cost !== null ? '₦' + (l.cost | number) : 'not recorded' }}</dd>
            @if (l.driverName) { <dt>Driver</dt><dd>{{ l.driverName }}<span class="mini-note" *ngIf="l.driverPhone"> · {{ l.driverPhone }}</span></dd> }
            @if ((l.contents ?? []).length > 0) {
              <dt>Contents (pcs)</dt>
              <dd class="wrap-anywhere">@for (c of l.contents ?? []; track $index) { {{ c.quantity }}×{{ c.sku ?? '—' }} @if ($index < (l.contents ?? []).length - 1) { · } }</dd>
            }
          </dl>

          <div class="panel-head"><h2>Corridor checkpoints</h2><span class="ph-sub">torque-seal journal</span></div>
          @if (checkpointsOf(l).length > 0) {
            <ul class="activity">
              @for (cp of checkpointsOf(l); track $index) {
                <li>
                  <time>{{ str(cp.at) | date: 'MMM d, HH:mm' }}</time>
                  <span class="act-action">
                    {{ cp.zone }} — <span class="chip" [class.ok]="cp.status === 'delivered'" [class.warn]="cp.status !== 'delivered'">{{ cp.status.replaceAll('_', ' ') }}</span>
                    @if (cp.sealId) { · seal {{ cp.sealId }} }
                    @if (cp.driverName) { · {{ cp.driverName }} }
                    @if (cp.note) { · {{ cp.note }} }
                  </span>
                </li>
              }
            </ul>
          } @else {
            <p class="muted small">No corridor checkpoints logged on this leg yet.</p>
          }

          <form class="form-grid" (ngSubmit)="addCheckpoint(l)">
            <label>Zone / location <input [(ngModel)]="cp.zone" name="cpzone" required placeholder="Ojota park interchange" /></label>
            <label>Seal id <input [(ngModel)]="cp.sealId" name="cpseal" placeholder="SEAL-204" /></label>
            <label>Status
              <select [(ngModel)]="cp.status" name="cpstatus">
                <option value="on_track">on track</option>
                <option value="delayed">delayed</option>
                <option value="seal_intact">seal intact</option>
                <option value="delivered">delivered</option>
              </select>
            </label>
            <label>Driver name <input [(ngModel)]="cp.driverName" name="cpdriver" /></label>
            <label>Driver phone <input [(ngModel)]="cp.driverPhone" name="cphone" placeholder="0803…" /></label>
            <label class="wide">Note <input [(ngModel)]="cp.note" name="cpnote" placeholder="held at gate 20min…" /></label>
            <div class="wide actions flat"><button class="cta small ghost" type="submit">Log checkpoint</button></div>
          </form>

          <div class="panel-head"><h2>Live tracking</h2><span class="ph-sub">updated as it moves</span></div>
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
          <p class="muted small">Select a delivery run to see its shipment details and live tracking.</p>
        }

        <div class="gap-sep"></div>
        <div class="panel-head"><h2>Zone prices</h2><span class="ph-sub">weight + location</span></div>
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
  nd = { orderId: '', carrier: 'dispatch_rider', legNumber: 1, weightKg: 0, zone: '', driverName: '', driverPhone: '', contentsText: '' };
  cp = { zone: '', sealId: '', status: 'on_track', driverName: '', driverPhone: '', note: '' };
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
  readonly totalUnits = computed(() =>
    this.legs().reduce((sum, l) => sum + (l.contents ?? []).reduce((s, c) => s + (Number(c.quantity) || 0), 0), 0));
  checkpointsOf(l: LegRow): CheckpointRow[] {
    return (l.checkpoints ?? []) as unknown as CheckpointRow[];
  }

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
    const contents = this.nd.contentsText.split('\n').map((line) => line.trim()).filter(Boolean)
      .map((line) => {
        const m = line.match(/^(.*?)×(\d+)$/i) ?? line.match(/^(.*?)\s+x?\s*(\d+)$/i);
        return m ? { sku: m[1].trim(), quantity: Number(m[2]) } : { sku: line, quantity: 1 };
      });
    this.api.createDelivery({
      orderId: this.nd.orderId, carrier: this.nd.carrier, legNumber: Number(this.nd.legNumber),
      weightKg: this.nd.weightKg ? Number(this.nd.weightKg) : undefined, zone: this.nd.zone || undefined,
      driverName: this.nd.driverName || undefined, driverPhone: this.nd.driverPhone || undefined,
      contents: contents.length ? contents : undefined,
    }).subscribe({ next: () => { this.showCreate.set(false); this.ok('Delivery leg created.'); }, error: (e) => this.fail(e, 'Create failed — GIGL needs API keys; use a manual carrier meanwhile.') });
  }

  addCheckpoint(l: LegRow): void {
    this.api.addDeliveryCheckpoint(l.id, {
      zone: this.cp.zone,
      sealId: this.cp.sealId || undefined,
      status: this.cp.status || undefined,
      driverName: this.cp.driverName || undefined,
      driverPhone: this.cp.driverPhone || undefined,
      note: this.cp.note || undefined,
    }).subscribe({
      next: () => { this.cp = { zone: '', sealId: '', status: 'on_track', driverName: '', driverPhone: '', note: '' }; this.ok('Checkpoint logged.'); },
      error: (e) => this.fail(e, 'Checkpoint failed.'),
    });
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
