import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SeActivityComponent,
  SeActivityEntry,
  SeBadgeComponent,
  SeButtonDirective,
  SeCardComponent,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDatePipe,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilter,
  SeFilterBarComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMetricCardComponent,
  SeMoneyPipe,
  SePageComponent,
  SeRowAction,
  SeSkeletonComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { urlFilters } from '../url-filters';
import {
  CARRIER_OPTIONS,
  CHECKPOINT_STATUSES,
  DELIVERY_STATUSES,
  carrierLabel,
  checkpointState,
  countOf,
  deliveryState,
  parseContents,
  shortRef,
} from './ops-format';

export interface LegRow {
  id: string;
  carrier: string;
  legNumber: number;
  status: string;
  trackingRef: string | null;
  cost: number | null;
  order: { id: string };
  driverName: string | null;
  driverPhone: string | null;
  contents: Array<{ sku?: string; quantity: number }> | null;
  checkpoints: Array<Record<string, unknown>> | null;
}
export interface ZoneRow {
  id: string;
  zone: string;
  baseFee: number;
  pricePerKg: number;
}

/**
 * Logistics: every delivery leg between the factory, depots and customers,
 * the zone prices that cost them, and a quote. GIGL sits behind the carrier
 * adapter; a manual carrier works without API keys.
 */
@Component({
  selector: 'app-logistics-admin',
  imports: [
    FormsModule, SeActivityComponent, SeBadgeComponent, SeButtonDirective, SeCardComponent,
    SeCellDirective, SeDatePipe, SeDrawerComponent, SeFieldComponent, SeFilterBarComponent,
    SeInputDirective, SeKvDirective, SeKvItemComponent, SeMetricCardComponent, SeMoneyPipe,
    SePageComponent, SeSkeletonComponent, SeTableComponent,
  ],
  template: `
    <se-page title="Logistics">
      <ng-container sePageActions>
        <button seButton type="button" (click)="quoting.set(true)">Get quote</button>
        @if (canWrite) {
          <button seButton type="button" (click)="editingZone.set(true)">Edit zone price</button>
          <button seButton variant="primary" type="button" (click)="creating.set(true)">Create delivery</button>
        }
      </ng-container>

      <div class="se-metric-grid">
        <se-metric-card label="In transit" [value]="countStatus('in_transit')" [hint]="countStatus('pending') + ' not yet dispatched'" />
        <se-metric-card label="Delivered" [value]="countStatus('delivered')" [hint]="countOf(countStatus('failed'), 'failed run')" />
        <se-metric-card label="Freight spend" [value]="totalCost() | seMoney" hint="Recorded costs on all legs" />
        <se-metric-card label="Units on the road" [value]="totalUnits()" hint="Across all legs" />
      </div>

      <se-table caption="Deliveries" [columns]="columns" [rows]="rows()" [loading]="loading()" [error]="error()"
        (retry)="load()" [pageSize]="25" [actions]="actions" activatable (rowActivate)="open($event)"
        [emptyHeading]="filtering() ? 'No deliveries match these filters' : 'No deliveries yet'"
        [emptyText]="filtering() ? 'Remove a filter, or clear them all.' : 'A delivery appears here when a leg is created for an order.'"
        [emptyActionLabel]="filtering() ? 'Clear all filters' : ''" (emptyAction)="clearFilters()">
        <se-filter-bar seTableToolbar searchLabel="Search deliveries" searchPlaceholder="Waybill, order or tracking ref"
          [(query)]="query" [filters]="filters" [(value)]="filterValue" [summary]="summary()" />
        <ng-template seCell="status" let-row>
          <se-badge [tone]="state(row.status).tone">{{ state(row.status).label }}</se-badge>
        </ng-template>
      </se-table>

      <se-card title="Zone prices" flush>
        <se-table caption="Zone prices" [columns]="zoneColumns" [rows]="zones()" [loading]="zonesLoading()"
          [error]="zonesError()" (retry)="loadZones()" hideDensity emptyHeading="No zone prices yet"
          emptyText="Add a zone to quote deliveries by weight and location." />
      </se-card>

      <se-drawer [title]="drawerTitle()" [open]="!!selected()" (openChange)="$event || close()">
        @if (selected(); as l) {
          <dl seKv>
            <div seKvItem label="Status"><se-badge [tone]="state(l.status).tone">{{ state(l.status).label }}</se-badge></div>
            <div seKvItem label="Order">#{{ l.order.id.slice(0, 8).toUpperCase() }}</div>
            <div seKvItem label="Carrier">{{ carrier(l.carrier) }}</div>
            <div seKvItem label="Leg" numeric>{{ l.legNumber }}</div>
            <div seKvItem label="Freight cost" numeric>{{ l.cost !== null ? (l.cost | seMoney) : 'Not recorded' }}</div>
            @if (l.driverName) {
              <div seKvItem label="Driver">{{ l.driverName }}@if (l.driverPhone) {, {{ l.driverPhone }}}</div>
            }
            @if (l.contents?.length) {
              <div seKvItem label="Contents">
                @for (c of l.contents; track $index) {<span>{{ c.quantity }} × {{ c.sku ?? 'unknown SKU' }}</span>@if (!$last) {, }}
              </div>
            }
            @if (tracking(); as t) {
              <div seKvItem label="Tracking ref">{{ t['trackingRef'] || 'None' }}</div>
              <div seKvItem label="Carrier status">{{ t['status'] }}</div>
              @if (t['dispatchedAt']) { <div seKvItem label="Dispatched">{{ str(t['dispatchedAt']) | seDate: 'datetime' }}</div> }
              @if (t['deliveredAt']) { <div seKvItem label="Delivered">{{ str(t['deliveredAt']) | seDate: 'datetime' }}</div> }
            } @else if (trackingError()) {
              <div seKvItem label="Tracking">{{ trackingError() }}</div>
            } @else {
              <div seKvItem label="Tracking"><se-skeleton shape="text" /></div>
            }
          </dl>
          <se-activity [entries]="checkpointsOf(l)" emptyText="No checkpoints logged on this leg yet." />
          @if (canWrite) {
            <form class="se-form" (ngSubmit)="addCheckpoint(l)">
              <se-field label="Location" hint="Where the driver reported from" [error]="cpError()">
                <input seInput name="cpzone" [(ngModel)]="cp.zone" />
              </se-field>
              <se-field label="Checkpoint status">
                <select seInput name="cpstatus" [(ngModel)]="cp.status">
                  @for (s of checkpointStatuses; track s) { <option [value]="s">{{ checkpoint(s).label }}</option> }
                </select>
              </se-field>
              <se-field label="Seal id" optional><input seInput name="cpseal" [(ngModel)]="cp.sealId" /></se-field>
              <div class="se-form__row">
                <se-field label="Driver name" optional><input seInput name="cpdriver" [(ngModel)]="cp.driverName" /></se-field>
                <se-field label="Driver phone" optional><input seInput name="cpphone" [(ngModel)]="cp.driverPhone" /></se-field>
              </div>
              <se-field label="Note" optional><input seInput name="cpnote" [(ngModel)]="cp.note" /></se-field>
            </form>
          }
        }
        <ng-container seDrawerFooter>
          <button seButton type="button" (click)="close()">{{ canWrite ? 'Cancel' : 'Close' }}</button>
          @if (canWrite && selected(); as l) {
            <button seButton variant="primary" type="button" [loading]="saving()" (click)="addCheckpoint(l)">Log checkpoint</button>
          }
        </ng-container>
      </se-drawer>

      <se-drawer title="Create delivery" [(open)]="creating">
        <form class="se-form" (ngSubmit)="create()">
          <se-field label="Order id" hint="The full order id" [error]="createError()">
            <input seInput name="doid" [(ngModel)]="nd.orderId" />
          </se-field>
          <se-field label="Carrier">
            <select seInput name="dcar" [(ngModel)]="nd.carrier">
              @for (c of carriers; track c.value) { <option [value]="c.value">{{ c.label }}</option> }
            </select>
          </se-field>
          <div class="se-form__row">
            <se-field label="Leg number"><input seInput type="number" min="1" name="dleg" [(ngModel)]="nd.legNumber" /></se-field>
            <se-field label="Weight (kg)" optional><input seInput type="number" min="0" step="0.1" name="dw" [(ngModel)]="nd.weightKg" /></se-field>
          </div>
          <se-field label="Zone" optional>
            <select seInput name="dz" [(ngModel)]="nd.zone">
              <option value="">No zone</option>
              @for (z of zones(); track z.id) { <option [value]="z.zone">{{ z.zone }}</option> }
            </select>
          </se-field>
          <div class="se-form__row">
            <se-field label="Driver name" optional><input seInput name="ddriver" [(ngModel)]="nd.driverName" /></se-field>
            <se-field label="Driver phone" optional><input seInput name="dphone" [(ngModel)]="nd.driverPhone" /></se-field>
          </div>
          <se-field label="Contents" hint="One line per SKU, as SKU×quantity" optional>
            <textarea seInput rows="3" name="dcontents" [(ngModel)]="nd.contentsText"></textarea>
          </se-field>
        </form>
        <ng-container seDrawerFooter>
          <button seButton type="button" (click)="creating.set(false)">Cancel</button>
          <button seButton variant="primary" type="button" [loading]="saving()" (click)="create()">Create delivery</button>
        </ng-container>
      </se-drawer>

      <se-drawer title="Edit zone price" [(open)]="editingZone">
        <form class="se-form" (ngSubmit)="upsertZone()">
          <se-field label="Zone" hint="An existing zone is updated; a new name adds one" [error]="zoneError()">
            <input seInput name="zz" [(ngModel)]="nz.zone" />
          </se-field>
          <div class="se-form__row">
            <se-field label="Base fee"><input seInput type="number" min="0" name="zb" [(ngModel)]="nz.baseFee" /></se-field>
            <se-field label="Price per kg"><input seInput type="number" min="0" name="zp" [(ngModel)]="nz.pricePerKg" /></se-field>
          </div>
        </form>
        <ng-container seDrawerFooter>
          <button seButton type="button" (click)="editingZone.set(false)">Cancel</button>
          <button seButton variant="primary" type="button" [loading]="saving()" (click)="upsertZone()">Save zone price</button>
        </ng-container>
      </se-drawer>

      <se-drawer title="Get quote" [(open)]="quoting">
        <form class="se-form" (ngSubmit)="getQuote()">
          <se-field label="Weight (kg)"><input seInput type="number" min="0" step="0.1" name="qw" [(ngModel)]="qc.weightKg" /></se-field>
          <se-field label="Zone" [error]="quoteError()">
            <select seInput name="qz" [(ngModel)]="qc.zone">
              <option value="">Choose a zone</option>
              @for (z of zones(); track z.id) { <option [value]="z.zone">{{ z.zone }}</option> }
            </select>
          </se-field>
          @if (quoteResult() !== null) {
            <dl seKv><div seKvItem label="Delivery cost" numeric>{{ quoteResult() | seMoney: 2 }}</div></dl>
          }
        </form>
        <ng-container seDrawerFooter>
          <button seButton type="button" (click)="quoting.set(false)">Close</button>
          <button seButton variant="primary" type="button" (click)="getQuote()">Get quote</button>
        </ng-container>
      </se-drawer>
    </se-page>
  `,
})
export class LogisticsAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);

  /** Creating legs, changing status, logging checkpoints and pricing all need full access. */
  readonly canWrite = this.access.can('logistics', 'full');

  readonly legs = signal<LegRow[]>([]);
  readonly zones = signal<ZoneRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly zonesLoading = signal(true);
  readonly zonesError = signal('');
  readonly selected = signal<LegRow | null>(null);
  readonly tracking = signal<Record<string, unknown> | null>(null);
  readonly trackingError = signal('');
  readonly creating = signal(false);
  readonly editingZone = signal(false);
  readonly quoting = signal(false);
  readonly saving = signal(false);
  readonly quoteResult = signal<number | null>(null);
  readonly cpError = signal('');
  readonly createError = signal('');
  readonly zoneError = signal('');
  readonly quoteError = signal('');

  readonly carriers = CARRIER_OPTIONS;
  readonly checkpointStatuses = CHECKPOINT_STATUSES;
  readonly state = deliveryState;
  readonly checkpoint = checkpointState;
  readonly carrier = carrierLabel;
  readonly countOf = countOf;

  nd = { orderId: '', carrier: 'dispatch_rider', legNumber: 1, weightKg: 0, zone: '', driverName: '', driverPhone: '', contentsText: '' };
  cp = { zone: '', sealId: '', status: 'on_track', driverName: '', driverPhone: '', note: '' };
  nz = { zone: '', baseFee: 0, pricePerKg: 0 };
  qc = { weightKg: 0, zone: '' };

  private readonly urlState = urlFilters(['status', 'carrier']);
  readonly query = this.urlState.query;
  readonly filterValue = this.urlState.value;
  readonly filters: SeFilter[] = [
    { key: 'status', label: 'Status', options: DELIVERY_STATUSES.map((v) => ({ value: v, label: deliveryState(v).label })) },
    { key: 'carrier', label: 'Carrier', options: CARRIER_OPTIONS },
  ];
  readonly filtering = computed(() => !!this.query().trim() || Object.keys(this.filterValue()).length > 0);
  readonly rows = computed(() => {
    const f = this.filterValue();
    const q = this.query().trim().toLowerCase();
    return this.legs().filter((l) => {
      if (f['status'] && l.status !== f['status']) return false;
      if (f['carrier'] && l.carrier !== f['carrier']) return false;
      if (!q) return true;
      return [l.id, shortRef('WB', l.id), l.order.id, l.trackingRef ?? ''].some((v) => v.toLowerCase().includes(q));
    });
  });
  readonly summary = computed(() => countOf(this.rows().length, 'delivery').replace('deliverys', 'deliveries'));
  readonly drawerTitle = computed(() => {
    const l = this.selected();
    return l ? `Delivery ${shortRef('WB', l.id)}` : 'Delivery';
  });

  readonly columns: SeColumn<LegRow>[] = [
    { key: 'ref', header: 'Waybill', value: (l) => shortRef('WB', l.id) },
    { key: 'order', header: 'Order', value: (l) => '#' + l.order.id.slice(0, 8).toUpperCase() },
    { key: 'carrier', header: 'Carrier', sortable: true, value: (l) => carrierLabel(l.carrier) },
    { key: 'leg', header: 'Leg', numeric: true, value: (l) => l.legNumber },
    { key: 'tracking', header: 'Tracking ref', value: (l) => l.trackingRef ?? '' },
    { key: 'cost', header: 'Cost', numeric: true, sortable: true, value: (l) => Number(l.cost) || 0,
      format: (v, l) => (l.cost === null ? '' : this.currency.format(v as number)) },
    { key: 'status', header: 'Status', sortable: true, value: (l) => l.status },
  ];
  readonly zoneColumns: SeColumn<ZoneRow>[] = [
    { key: 'zone', header: 'Zone', value: (z) => z.zone },
    { key: 'baseFee', header: 'Base fee', numeric: true, value: (z) => Number(z.baseFee), format: (v) => this.currency.format(v as number) },
    { key: 'pricePerKg', header: 'Price per kg', numeric: true, value: (z) => Number(z.pricePerKg), format: (v) => this.currency.format(v as number) },
  ];
  /** Status changes: forward only on screen (dispatch, deliver) plus failed; the API has the final say. */
  readonly actions: SeRowAction<LegRow>[] = [
    { label: 'Mark as in transit', hidden: (l) => !this.canWrite || l.status !== 'pending', run: (l) => void this.setStatus(l, 'in_transit') },
    { label: 'Mark as delivered', hidden: (l) => !this.canWrite || l.status !== 'in_transit', run: (l) => void this.setStatus(l, 'delivered') },
    { label: 'Mark as failed', danger: true, hidden: (l) => !this.canWrite || l.status !== 'in_transit', run: (l) => void this.setStatus(l, 'failed') },
  ];

  ngOnInit(): void {
    this.load();
    this.loadZones();
  }
  load(): void {
    this.api.deliveries().subscribe({
      next: (res) => {
        const rows = res.data as unknown as LegRow[];
        this.legs.set(rows);
        this.loading.set(false);
        this.error.set('');
        const open = this.selected();
        if (open) this.selected.set(rows.find((l) => l.id === open.id) ?? null);
      },
      error: (err) => {
        this.loading.set(false);
        if (this.legs().length === 0) this.error.set(err?.error?.message ?? 'The server did not respond. Nothing has been changed.');
      },
    });
  }
  loadZones(): void {
    this.api.deliveryPricing().subscribe({
      next: (res) => { this.zones.set(res as unknown as ZoneRow[]); this.zonesLoading.set(false); this.zonesError.set(''); },
      error: (err) => { this.zonesLoading.set(false); if (this.zones().length === 0) this.zonesError.set(err?.error?.message ?? 'Zone prices could not be loaded.'); },
    });
  }

  countStatus(s: string): number { return this.legs().filter((l) => l.status === s).length; }
  readonly totalCost = computed(() => this.legs().reduce((sum, l) => sum + (Number(l.cost) || 0), 0));
  readonly totalUnits = computed(() =>
    this.legs().reduce((sum, l) => sum + (l.contents ?? []).reduce((s, c) => s + (Number(c.quantity) || 0), 0), 0));
  str(v: unknown): string { return v == null ? '' : String(v); }
  checkpointsOf(l: LegRow): SeActivityEntry[] {
    return [...(l.checkpoints ?? [])].reverse().map((c) => ({
      at: this.str(c['at']),
      text: [this.str(c['zone']), checkpointState(this.str(c['status'])).label, c['sealId'] ? `seal ${this.str(c['sealId'])}` : '', this.str(c['note'])].filter(Boolean).join(', '),
      actor: c['driverName'] ? this.str(c['driverName']) : undefined,
      tone: checkpointState(this.str(c['status'])).tone,
    })) as SeActivityEntry[];
  }

  open(l: LegRow): void {
    this.selected.set(l);
    this.tracking.set(null);
    this.trackingError.set('');
    this.cpError.set('');
    this.api.deliveryTracking(l.id).subscribe({
      next: (t) => this.tracking.set(t),
      error: (e) => this.trackingError.set(e?.error?.message ?? 'The carrier has no tracking for this leg yet.'),
    });
  }
  close(): void { this.selected.set(null); }
  clearFilters(): void { this.query.set(''); this.filterValue.set({}); }

  private fail(message: string, retry: () => void): void {
    this.saving.set(false);
    this.toast.show(message, { tone: 'danger', action: { label: 'Try again', run: retry } });
  }

  create(): void {
    if (!this.canWrite) return;
    if (!this.nd.orderId.trim()) { this.createError.set('Enter the id of the order this delivery is for.'); return; }
    this.createError.set('');
    const contents = parseContents(this.nd.contentsText);
    this.saving.set(true);
    this.api.createDelivery({
      orderId: this.nd.orderId, carrier: this.nd.carrier, legNumber: Number(this.nd.legNumber),
      weightKg: this.nd.weightKg ? Number(this.nd.weightKg) : undefined, zone: this.nd.zone || undefined,
      driverName: this.nd.driverName || undefined, driverPhone: this.nd.driverPhone || undefined,
      contents: contents.length ? contents : undefined,
    }).subscribe({
      next: () => { this.saving.set(false); this.creating.set(false); this.toast.show('Delivery created'); this.load(); },
      error: (e) => this.fail(e?.error?.message ?? 'The delivery could not be created. GIGL needs API keys; a manual carrier works meanwhile.', () => this.create()),
    });
  }

  addCheckpoint(l: LegRow): void {
    if (!this.canWrite) return;
    if (!this.cp.zone.trim()) { this.cpError.set('Enter where the driver reported from.'); return; }
    this.cpError.set('');
    this.saving.set(true);
    this.api.addDeliveryCheckpoint(l.id, {
      zone: this.cp.zone, sealId: this.cp.sealId || undefined, status: this.cp.status || undefined,
      driverName: this.cp.driverName || undefined, driverPhone: this.cp.driverPhone || undefined, note: this.cp.note || undefined,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.cp = { zone: '', sealId: '', status: 'on_track', driverName: '', driverPhone: '', note: '' };
        this.toast.show('Checkpoint logged');
        this.load();
      },
      error: (e) => this.fail(e?.error?.message ?? 'The checkpoint could not be logged', () => this.addCheckpoint(l)),
    });
  }

  async upsertZone(): Promise<void> {
    if (!this.canWrite) return;
    if (!this.nz.zone.trim()) { this.zoneError.set('Enter the zone name.'); return; }
    this.zoneError.set('');
    const ok = await this.confirm.ask({
      title: `Save the price for zone ${this.nz.zone}?`,
      consequence: `Every new quote and delivery to ${this.nz.zone} is costed at ${this.currency.format(Number(this.nz.baseFee))} plus ${this.currency.format(Number(this.nz.pricePerKg))} per kg. Deliveries already created keep their cost.`,
      confirmLabel: 'Save zone price',
    });
    if (!ok) return;
    this.saving.set(true);
    this.api.upsertPricing({ zone: this.nz.zone, baseFee: Number(this.nz.baseFee), pricePerKg: Number(this.nz.pricePerKg) }).subscribe({
      next: () => { this.saving.set(false); this.editingZone.set(false); this.toast.show(`Zone ${this.nz.zone} saved`); this.loadZones(); },
      error: (e) => this.fail(e?.error?.message ?? 'The zone price could not be saved', () => void this.upsertZone()),
    });
  }

  getQuote(): void {
    if (!this.qc.zone) { this.quoteError.set('Choose a zone.'); return; }
    this.quoteError.set('');
    this.api.quote(Number(this.qc.weightKg), this.qc.zone).subscribe({
      next: (r) => this.quoteResult.set(r.cost),
      error: (e) => { this.quoteResult.set(null); this.quoteError.set(e?.error?.message ?? 'There is no price for that zone.'); },
    });
  }

  async setStatus(l: LegRow, status: string): Promise<void> {
    if (!this.canWrite) return;
    const ref = shortRef('WB', l.id);
    const ok = await this.confirm.ask({
      title: `Mark delivery ${ref} as ${deliveryState(status).label.toLowerCase()}?`,
      consequence: status === 'failed'
        ? 'The run is recorded as failed and the order stays undelivered. A new leg is needed to try again.'
        : status === 'delivered'
          ? "The order is recorded as received, which starts the customer's return window."
          : 'The goods are recorded as on their way. A delivery cannot be moved back to an earlier status.',
      confirmLabel: `Mark as ${deliveryState(status).label.toLowerCase()}`,
      danger: status === 'failed',
    });
    if (!ok) return;
    this.api.updateDeliveryStatus(l.id, status).subscribe({
      next: () => { this.toast.show(`Delivery ${ref} marked as ${deliveryState(status).label.toLowerCase()}`); this.load(); },
      error: (e) => this.fail(e?.error?.message ?? `Delivery ${ref} could not be updated`, () => void this.setStatus(l, status)),
    });
  }
}
