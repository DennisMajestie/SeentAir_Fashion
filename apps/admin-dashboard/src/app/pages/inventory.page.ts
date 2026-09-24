import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface SummaryRow { itemType: string; itemId: string; currentQuantity: number; byMovementType: Record<string, number>; }
interface MovementRow { id: string; movementType: string; quantityDelta: number; timestamp: string; referenceId: string | null; actorId?: string | null; }
interface VariantInfo { sku: string; product: string; price: number; size: string | null; colour: string | null; }

/** A8 — Inventory valuation & stock depository with the immutable movement
    ledger. Stock is NEVER edited directly: every figure derives from
    InventoryMovement rows; removals stay approval-gated. */
@Component({
  selector: 'app-inventory-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Operations · Inventory</p>
        <h1>Inventory & stock levels</h1>
        <p class="ops-sub">Live stock levels with a full history of every change in and out. Stock is never edited directly.</p>
      </div>
      <div class="ops-actions">
        <span class="live-chip">Live</span>
      </div>
    </div>

    <p class="rule-strip">EVERY CHANGE IS RECORDED // stock moves only through logged entries — removing stock needs approval.</p>

    <div class="kpi-bar">
      <div class="kpi">
        <span class="kpi-label">Finished goods</span>
        <span class="kpi-value">{{ finishedUnits() | number }} <small>units</small></span>
        <span class="kpi-sub">est. ₦{{ finishedValue() | number: '1.0-0' }} at current retail prices</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Raw materials</span>
        <span class="kpi-value">{{ materialSkus() }}</span>
        <span class="kpi-sub">materials tracked</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Work in progress</span>
        <span class="kpi-value">{{ wipUnits() | number }} <small>units</small></span>
        <span class="kpi-sub">in active production stages</span>
      </div>
      <div class="kpi" [class.kpi-action]="returnsAwaiting() > 0">
        <span class="kpi-label">Customer returns</span>
        <span class="kpi-value">{{ returnsAwaiting() }}</span>
        <span class="kpi-sub">waiting to be checked</span>
      </div>
    </div>

    <div class="ops-toolbar">
      <span class="search"><input placeholder="Search SKU or material…" [(ngModel)]="query" name="q" aria-label="Search inventory" /></span>
      <div class="seg" role="group" aria-label="Item type">
        <button type="button" [class.on]="view() === 'all'" (click)="view.set('all')">All items <span class="seg-n">{{ summary().length }}</span></button>
        <button type="button" [class.on]="view() === 'variant'" (click)="view.set('variant')">Finished goods <span class="seg-n">{{ countType('variant') }}</span></button>
        <button type="button" [class.on]="view() === 'material'" (click)="view.set('material')">Raw materials <span class="seg-n">{{ countType('material') }}</span></button>
      </div>
    </div>

    <div class="side-split">
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Item</th><th>Type</th><th>Current</th><th>In / out by movement</th><th>Est. value</th></tr></thead>
          <tbody>
            @for (s of visible(); track s.itemType + s.itemId) {
              <tr class="clickable" [class.sel]="isSelected(s)" (click)="select(s)">
                <td><strong>{{ labelFor(s.itemType, s.itemId) }}</strong></td>
                <td><span class="chip" [class.acid]="s.itemType === 'variant'">{{ s.itemType === 'variant' ? 'finished' : 'material' }}</span></td>
                <td class="mono">{{ s.currentQuantity | number }}</td>
                <td class="small muted mono">
                  @for (kv of entries(s.byMovementType); track kv[0]) {
                    <span class="chip gap-end" [class.warn]="kv[1] < 0">{{ kv[0] }} {{ kv[1] > 0 ? '+' : '' }}{{ kv[1] }}</span>
                  }
                </td>
                <td class="mono">
                  @if (valueOf(s) !== null) { ₦{{ valueOf(s) | number: '1.0-0' }} } @else { <span class="muted">—</span> }
                </td>
              </tr>
            }
            @if (visible().length === 0) { <tr><td colspan="5" class="muted small">No stock rows match.</td></tr> }
          </tbody>
        </table>
      </div>

      <aside class="inspector">
        @if (selected(); as s) {
          <div class="insp-head">
            <h2>{{ labelFor(s.itemType, s.itemId) }}</h2>
            <span class="chip" [class.acid]="s.itemType === 'variant'">{{ s.itemType === 'variant' ? 'finished goods' : 'raw material' }}</span>
          </div>
          @if (variantInfo(s); as vi) {
            <p class="ops-sub" style="margin:0 0 0.5rem;">{{ vi.product }} · {{ vi.colour || '—' }} · size {{ vi.size || '—' }}</p>
          }
          <div class="kpi-bar" style="margin-bottom:0.8rem;">
            <div class="kpi">
              <span class="kpi-label">Current stock</span>
              <span class="kpi-value">{{ currentQty() ?? s.currentQuantity | number }}</span>
              <span class="kpi-sub">from {{ ledgerTotal() }} total movements</span>
            </div>
            @if (valueOf(s) !== null) {
              <div class="kpi">
                <span class="kpi-label">Calculated value</span>
                <span class="kpi-value">₦{{ valueOf(s) | number: '1.0-0' }}</span>
                <span class="kpi-sub">qty × current retail price</span>
              </div>
            }
          </div>

          <div class="panel-head"><h2>Stock movement history</h2><span class="ph-sub">latest first</span></div>
          <table class="table">
            <thead><tr><th>When</th><th>Type</th><th>Δ</th><th>Reference</th></tr></thead>
            <tbody>
              @for (m of movementRows(); track m.id) {
                <tr>
                  <td class="mono small">{{ m.timestamp | date: 'MMM d, HH:mm' }}</td>
                  <td><span class="chip" [class.acid]="m.quantityDelta > 0" [class.warn]="m.quantityDelta < 0">{{ m.movementType }}</span></td>
                  <td class="mono delta" [class.plus]="m.quantityDelta > 0" [class.minus]="m.quantityDelta < 0">{{ m.quantityDelta > 0 ? '+' : '' }}{{ m.quantityDelta }}</td>
                  <td class="mono small muted">{{ m.referenceId?.slice(0, 12) || '—' }}</td>
                </tr>
              }
              @if (movementRows().length === 0) { <tr><td colspan="4" class="muted small">No movements yet.</td></tr> }
            </tbody>
          </table>
          <!-- GAP: the reference's cryptographic ledger-hash badge and bay/rack storage map
               need hash-chaining and warehouse-location data the API doesn't model. -->

          <div class="gap-sep"></div>
          <div class="panel-head"><h2>Request stock adjustment</h2><span class="ph-sub">needs approval</span></div>
          <p class="muted small">Add stock = correction in. Remove stock = taking it out — removal needs approval.</p>
          <form (ngSubmit)="adjust()">
            <label>Change (±) <input type="number" [(ngModel)]="adj.delta" name="adelta" required /></label>
            <label>Reference note <input [(ngModel)]="adj.reference" name="aref" placeholder="stocktake correction…" /></label>
            <div class="actions">
              @if (adj.delta < 0 && !adj.approvalRequestId) {
                <button class="cta small ghost" type="button" (click)="requestDisposalApproval()">Request removal approval</button>
              } @else {
                @if (adj.approvalRequestId) { <span class="chip acid">req {{ adj.approvalRequestId.slice(0, 8) }}</span> }
                <button class="cta small" type="submit">Record movement</button>
              }
            </div>
          </form>
        } @else {
          <p class="muted small">Select a stock row to see its movement history and make changes.</p>
        }
      </aside>
    </div>

    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class InventoryAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly summary = signal<SummaryRow[]>([]);
  readonly selected = signal<SummaryRow | null>(null);
  readonly movementRows = signal<MovementRow[]>([]);
  readonly currentQty = signal<number | null>(null);
  readonly ledgerTotal = signal(0);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly view = signal<'all' | 'variant' | 'material'>('all');
  readonly wipUnits = signal(0);
  readonly returnsAwaiting = signal(0);
  query = '';
  adj = { delta: 0, reference: '', approvalRequestId: '' };
  private readonly labels = signal<Map<string, string>>(new Map());
  private readonly variants = signal<Map<string, VariantInfo>>(new Map());

  ngOnInit(): void {
    this.api.products().subscribe((res) => {
      const labels = new Map(this.labels());
      const variants = new Map(this.variants());
      for (const p of res.data as unknown as Array<{ name: string; basePrice: number; variants: Array<{ id: string; sku: string; size: string | null; colour: string | null; priceOverride: number | null }> }>) {
        for (const v of p.variants ?? []) {
          labels.set(`variant:${v.id}`, v.sku);
          variants.set(v.id, {
            sku: v.sku, product: p.name, size: v.size, colour: v.colour,
            price: v.priceOverride ?? p.basePrice,
          });
        }
      }
      this.labels.set(labels);
      this.variants.set(variants);
    });
    this.api.materials().subscribe((mats) => {
      const labels = new Map(this.labels());
      for (const m of mats as unknown as Array<{ id: string; name: string }>) {
        labels.set(`material:${m.id}`, m.name);
      }
      this.labels.set(labels);
    });
    this.api.inventorySummary().subscribe((s) => this.summary.set(s));
    this.api.batches().subscribe((res) => {
      const last = res.stages[res.stages.length - 1];
      this.wipUnits.set(res.data.filter((b) => b.stage !== last).reduce((sum, b) => sum + b.quantity, 0));
    });
    this.api.returns().subscribe((res) => this.returnsAwaiting.set(res.data.filter((r) => r.status === 'requested').length));
  }

  labelFor(type: string, id: string): string {
    return this.labels().get(`${type}:${id}`) ?? id.slice(0, 8);
  }
  entries(record: Record<string, number>): Array<[string, number]> { return Object.entries(record); }
  countType(t: string): number { return this.summary().filter((s) => s.itemType === t).length; }

  visible(): SummaryRow[] {
    const q = this.query.trim().toLowerCase();
    return this.summary().filter((s) => {
      if (this.view() !== 'all' && s.itemType !== this.view()) return false;
      return !q || this.labelFor(s.itemType, s.itemId).toLowerCase().includes(q);
    });
  }

  readonly finishedUnits = computed(() =>
    this.summary().filter((s) => s.itemType === 'variant').reduce((sum, s) => sum + s.currentQuantity, 0));
  readonly materialSkus = computed(() => this.summary().filter((s) => s.itemType === 'material').length);
  readonly finishedValue = computed(() => {
    const variants = this.variants();
    return this.summary().filter((s) => s.itemType === 'variant')
      .reduce((sum, s) => sum + s.currentQuantity * (variants.get(s.itemId)?.price ?? 0), 0);
  });

  valueOf(s: SummaryRow): number | null {
    if (s.itemType !== 'variant') return null; // materials carry no stored unit price
    const v = this.variants().get(s.itemId);
    return v ? s.currentQuantity * v.price : null;
  }
  variantInfo(s: SummaryRow): VariantInfo | null {
    return s.itemType === 'variant' ? (this.variants().get(s.itemId) ?? null) : null;
  }

  isSelected(s: SummaryRow): boolean {
    const sel = this.selected();
    return !!sel && sel.itemType === s.itemType && sel.itemId === s.itemId;
  }

  select(s: SummaryRow): void {
    if (this.isSelected(s)) { this.selected.set(null); this.movementRows.set([]); this.currentQty.set(null); return; }
    this.selected.set(s);
    this.adj = { delta: 0, reference: '', approvalRequestId: '' };
    this.loadMovements();
  }

  loadMovements(): void {
    const sel = this.selected();
    if (!sel) return;
    this.api.movements(sel.itemId, sel.itemType as 'variant' | 'material').subscribe((res) => {
      this.movementRows.set(res.data as unknown as MovementRow[]);
      this.currentQty.set(res.currentQuantity);
      this.ledgerTotal.set(res.total);
    });
  }

  requestDisposalApproval(): void {
    const sel = this.selected();
    if (!sel) return;
    this.api.createApproval('stock_disposal', { item: this.labelFor(sel.itemType, sel.itemId), delta: this.adj.delta, note: this.adj.reference })
      .subscribe({
        next: (r) => { this.adj.approvalRequestId = r.id; this.message.set('Removal approval requested — Management decides in the queue.'); this.error.set(null); },
        error: (e) => this.error.set(e?.error?.message ?? 'Request failed.'),
      });
  }

  adjust(): void {
    const sel = this.selected();
    if (!sel) return;
    this.api.recordMovement(sel.itemId, sel.itemType as 'variant' | 'material', {
      movementType: 'adjustment', quantityDelta: Number(this.adj.delta),
      referenceId: this.adj.reference || undefined,
      approvalRequestId: this.adj.approvalRequestId || undefined,
    }).subscribe({
      next: () => {
        this.adj = { delta: 0, reference: '', approvalRequestId: '' };
        this.message.set('Movement recorded.'); this.error.set(null);
        this.loadMovements();
        this.api.inventorySummary().subscribe((s) => this.summary.set(s));
      },
      error: (e) => this.error.set(e?.error?.message ?? 'Refused — removals need an approved request.'),
    });
  }
}
