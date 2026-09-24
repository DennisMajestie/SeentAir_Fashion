import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface MaterialRow { id: string; name: string; unit: string; currentQuantity: number; reorderThreshold: number; lowStock: boolean; }
interface MovementRow { id: string; movementType: string; quantityDelta: number; timestamp: string; referenceId: string | null; }

/** A5 — Raw materials inventory & thresholds. Approved Stitch layout: critical
    reorder banner, warehouse stock depository table with health meters, and a
    per-material inspector with its live purchase/usage ledger (inventory
    movements) plus the approval-gated purchase flow. */
@Component({
  selector: 'app-materials-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Operations · Raw materials</p>
        <h1>Materials & raw stock</h1>
        <p class="ops-sub">{{ materials().length }} materials tracked — amounts update automatically as stock moves.</p>
      </div>
      <div class="ops-actions">
        <button class="cta small" type="button" (click)="showAdd.set(!showAdd())">{{ showAdd() ? 'Close' : '+ Add material' }}</button>
      </div>
    </div>

    @if (lowStock().length > 0) {
      <div class="att-item crit" style="margin-bottom:0.9rem;">
        <span class="att-tag">Critical reorder level reached <span>{{ lowStock().length }} item(s) alert</span></span>
        <p class="att-body">{{ lowStockNames() }}</p>
        <span class="att-act">
          <button class="link" type="button" (click)="draftPo()">Create a purchase order (needs approval)</button>
        </span>
      </div>
    }

    @if (showAdd()) {
      <section class="panel">
        <div class="panel-head"><h2>Add material</h2></div>
        <form class="form-grid" (ngSubmit)="create()">
          <label>Name <input [(ngModel)]="nm.name" name="mname" required placeholder="Cotton fabric" /></label>
          <label>Unit <input [(ngModel)]="nm.unit" name="munit" required placeholder="yards" /></label>
          <label>Reorder threshold <input type="number" min="0" [(ngModel)]="nm.reorderThreshold" name="mthr" /></label>
          <div class="wide"><button class="cta small" type="submit">Create</button></div>
        </form>
      </section>
    }

    <div class="ops-toolbar">
      <span class="search"><input placeholder="Search raw materials, yarn lots, trims…" [(ngModel)]="query" name="q" aria-label="Search materials" /></span>
      <div class="seg" role="group" aria-label="Stock filter">
        <button type="button" [class.on]="view() === 'all'" (click)="view.set('all')">All materials <span class="seg-n">{{ materials().length }}</span></button>
        <button type="button" [class.on]="view() === 'low'" (click)="view.set('low')">Critical <span class="seg-n">{{ lowStock().length }}</span></button>
        <button type="button" [class.on]="view() === 'ok'" (click)="view.set('ok')">Healthy <span class="seg-n">{{ materials().length - lowStock().length }}</span></button>
      </div>
      <!-- GAP: the reference's category tabs (Fabrics / Trims & Hardware / Thread / Packaging)
           need a material-type field the API doesn't have. -->
    </div>

    <div class="side-split">
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Material</th><th>Available</th><th>Min. stock level</th><th>Stock health</th><th>Unit</th><th>Status</th></tr></thead>
          <tbody>
            @for (m of visible(); track m.id) {
              <tr class="clickable" [class.sel]="selected()?.id === m.id" (click)="inspect(m.id)">
                <td><strong>{{ m.name }}</strong></td>
                <td class="mono" [class.error]="m.lowStock">{{ m.currentQuantity | number }} {{ m.unit }}</td>
                <td class="mono">{{ m.reorderThreshold | number }}</td>
                <td style="min-width:110px;">
                  <span class="meter" [class.danger]="m.lowStock" [class.ok]="!m.lowStock"><i [style.width]="health(m)"></i></span>
                </td>
                <td class="mono">{{ m.unit }}</td>
                <td><span class="chip" [class.bad]="m.lowStock" [class.ok]="!m.lowStock">{{ m.lowStock ? 'CRITICAL' : 'HEALTHY' }}</span></td>
              </tr>
            }
            @if (visible().length === 0) { <tr><td colspan="6" class="muted small">No materials match.</td></tr> }
          </tbody>
        </table>
      </div>

      <aside class="inspector">
        @if (selected(); as d) {
          <div class="insp-head">
            <h2>{{ d.name }}</h2>
            <span class="chip" [class.bad]="d.lowStock" [class.ok]="!d.lowStock">{{ d.lowStock ? 'CRITICAL LOW' : 'HEALTHY' }}</span>
          </div>
          <div class="kpi-bar" style="margin-bottom:0.8rem;">
            <div class="kpi"><span class="kpi-label">Current stock</span>
              <span class="kpi-value">{{ d.currentQuantity | number }} <small>{{ d.unit }}</small></span>
              <span class="kpi-sub">reorder at {{ d.reorderThreshold | number }}</span></div>
          </div>
          <!-- GAP: unit-price and est.-runway tiles need purchase pricing per unit and a
               consumption-rate series the API doesn't expose; not fabricated. -->

          <div class="panel-head"><h2>Purchase history</h2><span class="ph-sub">latest first</span></div>
          @if (ledger().length > 0) {
            <table class="table">
              <thead><tr><th>Date</th><th>Type</th><th>Qty</th></tr></thead>
              <tbody>
                @for (mv of ledger(); track mv.id) {
                  <tr>
                    <td class="mono small">{{ mv.timestamp | date: 'MMM d, y' }}</td>
                    <td><span class="chip" [class.acid]="mv.quantityDelta > 0" [class.warn]="mv.quantityDelta < 0">{{ mv.movementType }}</span></td>
                    <td class="mono delta" [class.plus]="mv.quantityDelta > 0" [class.minus]="mv.quantityDelta < 0">
                      {{ mv.quantityDelta > 0 ? '+' : '' }}{{ mv.quantityDelta | number }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="muted small">No movements recorded yet for this material.</p>
          }

          <div class="gap-sep"></div>
          <div class="panel-head"><h2>Record purchase / inward batch</h2><span class="ph-sub">approval-gated</span></div>
          <form class="form-grid" (ngSubmit)="purchase()">
            <label>Quantity <input type="number" min="1" [(ngModel)]="pu.quantity" name="puqty" required /></label>
            <label>Cost ₦ <input type="number" min="0" [(ngModel)]="pu.cost" name="pucost" required /></label>
            <label class="wide">Note (supplier — free text) <input [(ngModel)]="pu.note" name="punote" /></label>
            <div class="wide actions flat">
              @if (!pu.approvalRequestId) {
                <button class="cta small ghost" type="button" (click)="requestPurchaseApproval()">Request approval</button>
              } @else {
                <span class="chip acid">req {{ pu.approvalRequestId.slice(0, 8) }}</span>
                <button class="cta small" type="submit">Record purchase</button>
              }
            </div>
          </form>

          <div class="panel-head"><h2>Record usage</h2></div>
          <form class="form-grid" (ngSubmit)="usage()">
            <label>Quantity used <input type="number" min="1" [(ngModel)]="us.quantityUsed" name="usqty" required /></label>
            <label class="wide">Production batch id (optional) <input [(ngModel)]="us.batchId" name="usbatch" /></label>
            <div class="wide"><button class="cta small ghost" type="submit">Record usage</button></div>
          </form>
        } @else {
          <p class="muted small">Select a material to see its stock history and record a purchase or a use.</p>
        }
      </aside>
    </div>

    <div class="stat-strip">
      <div class="stat-cell"><span class="sc-label">SKUs tracked</span><p class="sc-value">{{ materials().length }}</p><span class="sc-sub">materials on file</span></div>
      <div class="stat-cell"><span class="sc-label">Stockout risk</span><p class="sc-value" [class.error]="lowStock().length > 0">{{ lowStock().length }} SKUs</p><span class="sc-sub">at or below reorder threshold</span></div>
      <div class="stat-cell"><span class="sc-label">Healthy reserve</span><p class="sc-value">{{ materials().length - lowStock().length }} SKUs</p><span class="sc-sub">above threshold</span></div>
      <!-- GAP: total valuation (₦) needs a per-unit cost figure the materials API doesn't store. -->
    </div>

    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class MaterialsAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly materials = signal<MaterialRow[]>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly showAdd = signal(false);
  readonly view = signal<'all' | 'low' | 'ok'>('all');
  /** Server-authoritative reorder list (GET /materials/low-stock). */
  readonly lowStock = signal<MaterialRow[]>([]);
  readonly lowStockNames = computed(() =>
    this.lowStock().map((m) => `${m.name} (${m.currentQuantity} ${m.unit} left · min ${m.reorderThreshold})`).join(' · '),
  );
  /** Inspector: fresh read of one material + its movement ledger. */
  readonly selected = signal<MaterialRow | null>(null);
  readonly ledger = signal<MovementRow[]>([]);
  query = '';

  nm = { name: '', unit: '', reorderThreshold: 0 };
  pu = { quantity: 0, cost: 0, note: '', approvalRequestId: '' };
  us = { quantityUsed: 0, batchId: '' };

  ngOnInit(): void { this.load(); }
  private load(): void {
    this.api.materials().subscribe((res) => this.materials.set(res as unknown as MaterialRow[]));
    this.api.lowStockMaterials().subscribe((res) => this.lowStock.set(res as unknown as MaterialRow[]));
  }

  visible(): MaterialRow[] {
    const q = this.query.trim().toLowerCase();
    return this.materials().filter((m) => {
      if (this.view() === 'low' && !m.lowStock) return false;
      if (this.view() === 'ok' && m.lowStock) return false;
      return !q || m.name.toLowerCase().includes(q);
    });
  }

  health(m: MaterialRow): string {
    if (m.reorderThreshold <= 0) return m.currentQuantity > 0 ? '100%' : '0%';
    // Health = stock vs 2× threshold, clamped — a full bar means comfortably above reorder level.
    return `${Math.max(3, Math.min(100, Math.round((m.currentQuantity / (m.reorderThreshold * 2)) * 100)))}%`;
  }

  /** Re-read one material + its live ledger so the card shows current state. */
  inspect(id: string): void {
    if (this.selected()?.id === id) { this.selected.set(null); this.ledger.set([]); return; }
    this.api.material(id).subscribe({
      next: (m) => this.selected.set(m as unknown as MaterialRow),
      error: (e) => this.fail(e, 'Could not load that material.'),
    });
    this.api.movements(id, 'material').subscribe({
      next: (res) => this.ledger.set((res.data as unknown as MovementRow[]).slice(0, 8)),
      error: () => this.ledger.set([]),
    });
  }

  /** Banner CTA: raises one purchasing approval covering the critical list. */
  draftPo(): void {
    const items = this.lowStock().map((m) => ({ material: m.name, currentQuantity: m.currentQuantity, reorderThreshold: m.reorderThreshold }));
    if (items.length === 0) return;
    this.api.createApproval('purchasing', { draft: 'reorder critical materials', items })
      .subscribe({
        next: () => this.ok('Purchase-order draft raised as a purchasing approval — Management decides in the queue.'),
        error: (e) => this.fail(e, 'Could not raise the PO draft.'),
      });
  }

  private ok(msg: string): void { this.message.set(msg); this.error.set(null); this.load(); }
  private fail(err: { error?: { message?: string } }, fb: string): void { this.error.set(err?.error?.message ?? fb); this.message.set(null); }

  create(): void {
    this.api.createMaterial({ name: this.nm.name, unit: this.nm.unit, reorderThreshold: Number(this.nm.reorderThreshold) })
      .subscribe({ next: () => { this.showAdd.set(false); this.ok('Material created.'); }, error: (e) => this.fail(e, 'Create failed.') });
  }

  requestPurchaseApproval(): void {
    const sel = this.selected();
    if (!sel || !this.pu.quantity) { this.error.set('Pick a material and quantity first.'); return; }
    this.api.createApproval('purchasing', { material: sel.name, quantity: this.pu.quantity, cost: this.pu.cost })
      .subscribe({
        next: (res) => { this.pu.approvalRequestId = res.id; this.ok('Purchase approval requested — Management must approve before recording.'); },
        error: (e) => this.fail(e, 'Approval request failed.'),
      });
  }

  purchase(): void {
    const sel = this.selected();
    if (!sel) return;
    this.api.recordPurchase(sel.id, {
      quantity: Number(this.pu.quantity), cost: Number(this.pu.cost),
      note: this.pu.note || undefined, approvalRequestId: this.pu.approvalRequestId,
    }).subscribe({
      next: () => { this.pu = { quantity: 0, cost: 0, note: '', approvalRequestId: '' }; this.ok('Purchase recorded — stock updated.'); this.inspectRefresh(sel.id); },
      error: (e) => this.fail(e, 'Not approved yet — check the Approvals queue.'),
    });
  }

  usage(): void {
    const sel = this.selected();
    if (!sel) return;
    this.api.recordUsage(sel.id, {
      quantityUsed: Number(this.us.quantityUsed), batchId: this.us.batchId || undefined,
    }).subscribe({ next: () => { this.ok('Usage recorded.'); this.inspectRefresh(sel.id); }, error: (e) => this.fail(e, 'Usage failed.') });
  }

  private inspectRefresh(id: string): void {
    this.api.material(id).subscribe({ next: (m) => this.selected.set(m as unknown as MaterialRow), error: () => undefined });
    this.api.movements(id, 'material').subscribe({ next: (res) => this.ledger.set((res.data as unknown as MovementRow[]).slice(0, 8)), error: () => undefined });
  }
}
