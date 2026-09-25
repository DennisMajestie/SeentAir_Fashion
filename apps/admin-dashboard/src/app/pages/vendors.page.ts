import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface MaterialRow { id: string; name: string; unit: string; currentQuantity: number; reorderThreshold: number; lowStock: boolean; }
interface SummaryRow { itemType: string; itemId: string; currentQuantity: number; byMovementType: Record<string, number>; }
interface MovementRow { id: string; movementType: string; quantityDelta: number; timestamp: string; referenceId: string | null; }
interface SupplierRow { id: string; name: string; category: string | null; location: string | null; certified: boolean; slaScore: number | null; quotaUnits: number | null; complianceNotes: string | null; }

/** A13 — Certified-mill supplier directory + procurement records. Suppliers are
    first-class now (Phase 9): name, category, location, certification, SLA
    score, quota contract and compliance notes, with add/edit. Per-material
    purchase history still derives from the inventory ledger. */
@Component({
  selector: 'app-vendors-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Management · Purchases</p>
        <h1>Supplier directory & purchases</h1>
        <p class="ops-sub">Certified mills on file, their SLA scores and quota contracts — plus what you've bought, straight from Inventory's records.</p>
      </div>
      <div class="ops-actions">
        <a class="cta small" href="/materials">Draft new purchase order</a>
        <button class="cta small ghost" type="button" (click)="showAdd.set(!showAdd())">{{ showAdd() ? 'Close' : '+ Add supplier' }}</button>
      </div>
    </div>

    @if (showAdd()) {
      <section class="panel">
        <div class="panel-head"><h2>Add supplier</h2></div>
        <form class="form-grid" (ngSubmit)="addSupplier()">
          <label>Name <input [(ngModel)]="ns.name" name="sname" required placeholder="Chinchin Textile Mills" /></label>
          <label>Category <select [(ngModel)]="ns.category" name="scat">
              <option value="">no category</option>
              <option value="fabrics">Fabrics</option>
              <option value="trims_hardware">Trims & hardware</option>
              <option value="thread">Thread</option>
              <option value="packaging">Packaging</option>
              <option value="printing">Printing</option>
              <option value="labels">Labels</option>
              <option value="other">Other</option>
            </select></label>
          <label>Location <input [(ngModel)]="ns.location" name="sloc" placeholder="Kano / Aba gate…" /></label>
          <label>SLA score (0–100) <input type="number" min="0" max="100" [(ngModel)]="ns.slaScore" name="ssla" /></label>
          <label>Quota units <input type="number" min="0" [(ngModel)]="ns.quotaUnits" name="ssquota" /></label>
          <label>Certified? <input type="checkbox" [(ngModel)]="ns.certified" name="scert" /></label>
          <label class="wide">Compliance notes <textarea [(ngModel)]="ns.complianceNotes" name="snotes" rows="2"></textarea></label>
          <div class="wide"><button class="cta small" type="submit">Add supplier</button></div>
        </form>
      </section>
    }

    <p class="rule-strip">PURCHASING STAYS APPROVAL-GATED // supplier records are a directory — every purchase still needs a management approval.</p>

    <div class="kpi-bar">
      <div class="kpi"><span class="kpi-label">Suppliers on file</span><span class="kpi-value">{{ suppliers().length }}</span><span class="kpi-sub">{{ certifiedCount() }} certified</span></div>
      <div class="kpi"><span class="kpi-label">Materials supplied</span><span class="kpi-value">{{ materials().length }}</span><span class="kpi-sub">in the raw-materials registry</span></div>
      <div class="kpi"><span class="kpi-label">Inward volume</span><span class="kpi-value">{{ purchasedTotal() | number }}</span><span class="kpi-sub">units purchased in (all materials, mixed units)</span></div>
      <div class="kpi" [class.kpi-action]="criticalCount() > 0">
        <span class="kpi-label">Re-supply needed</span>
        <span class="kpi-value">{{ criticalCount() }}</span>
        <span class="kpi-sub">materials at or below reorder threshold</span>
      </div>
    </div>

    <div class="ops-toolbar">
      <span class="search"><input placeholder="Search suppliers / materials…" [(ngModel)]="query" name="q" aria-label="Search" (ngModelChange)="queryChanged()" /></span>
      <div class="seg" role="group" aria-label="Directory view">
        <button type="button" [class.on]="tab() === 'suppliers'" (click)="setTab('suppliers')">Suppliers <span class="seg-n">{{ suppliers().length }}</span></button>
        <button type="button" [class.on]="tab() === 'materials'" (click)="setTab('materials')">Materials <span class="seg-n">{{ materials().length }}</span></button>
      </div>
    </div>

    @if (tab() === 'suppliers') {
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Supplier</th><th>Category</th><th>Location</th><th>Certified</th><th>SLA</th><th>Quota units</th></tr></thead>
          <tbody>
            @for (s of suppliersVisible(); track s.id) {
              <tr class="clickable" [class.sel]="supplierSel()?.id === s.id" (click)="selectSupplier(s)">
                <td><strong>{{ s.name }}</strong></td>
                <td class="small">{{ (s.category ?? '—').replace('_', ' ') }}</td>
                <td class="small">{{ s.location ?? '—' }}</td>
                <td><span class="chip" [class.ok]="s.certified" [class.warn]="!s.certified">{{ s.certified ? 'CERTIFIED' : 'PROSPECT' }}</span></td>
                <td class="mono">{{ s.slaScore != null ? s.slaScore + '/100' : '—' }}</td>
                <td class="mono">{{ s.quotaUnits != null ? (s.quotaUnits | number) : '—' }}</td>
              </tr>
            }
            @if (suppliersVisible().length === 0) { <tr><td colspan="6" class="muted small">No suppliers on file yet — add one above.</td></tr> }
          </tbody>
        </table>
      </div>

      @if (supplierSel(); as s) {
        <aside class="inspector" style="margin-top:0.8rem;">
          <div class="insp-head">
            <h2>{{ s.name }}</h2>
            <span class="chip" [class.ok]="s.certified" [class.warn]="!s.certified">{{ s.certified ? 'certified' : 'prospect' }}</span>
          </div>
          <dl class="kv">
            <dt>Category</dt><dd>{{ (s.category ?? '—').replace('_', ' ') }}</dd>
            <dt>Location</dt><dd>{{ s.location ?? '—' }}</dd>
            <dt>SLA score</dt><dd>{{ s.slaScore != null ? s.slaScore + ' / 100' : '—' }} <span class="mini-note">lead-time & quality record</span></dd>
            <dt>Quota contract</dt><dd>{{ s.quotaUnits != null ? (s.quotaUnits | number) + ' units' : '—' }}</dd>
            <dt>Compliance notes</dt><dd>{{ s.complianceNotes ?? '—' }}</dd>
          </dl>
          <div class="panel-head"><h2>Edit supplier</h2></div>
          <form class="form-grid" (ngSubmit)="saveSupplier(s)">
            <label>SLA score <input type="number" min="0" max="100" [(ngModel)]="edit[s.id].slaScore" name="e-sla-{{ s.id }}" /></label>
            <label>Quota units <input type="number" min="0" [(ngModel)]="edit[s.id].quotaUnits" name="e-quota-{{ s.id }}" /></label>
            <label>Certified? <input type="checkbox" [(ngModel)]="edit[s.id].certified" name="e-cert-{{ s.id }}" /></label>
            <label class="wide">Compliance notes <textarea [(ngModel)]="edit[s.id].complianceNotes" name="e-notes-{{ s.id }}" rows="2"></textarea></label>
            <div class="wide actions flat">
              <button class="cta small" type="submit">Save</button>
              <button class="link" type="button" (click)="deleteSupplier(s)">Delete supplier</button>
            </div>
          </form>
        </aside>
      }
    }

    @if (tab() === 'materials') {
      <div class="side-split">
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>Material / supply record</th><th>Purchased in</th><th>Consumed</th><th>On hand</th><th>Status</th></tr></thead>
            <tbody>
              @for (m of materialsVisible(); track m.id) {
                <tr class="clickable" [class.sel]="selected()?.id === m.id" (click)="selectMaterial(m)">
                  <td><strong>{{ m.name }}</strong><br /><span class="mini-note">unit: {{ m.unit }}</span></td>
                  <td class="mono delta plus">+{{ purchasedOf(m.id) | number }}</td>
                  <td class="mono delta minus">−{{ usedOf(m.id) | number }}</td>
                  <td class="mono">{{ m.currentQuantity | number }} {{ m.unit }}</td>
                  <td><span class="chip" [class.bad]="m.lowStock" [class.ok]="!m.lowStock">{{ m.lowStock ? 'RE-SUPPLY' : 'COVERED' }}</span></td>
                </tr>
              }
              @if (materialsVisible().length === 0) { <tr><td colspan="5" class="muted small">No supply records match.</td></tr> }
            </tbody>
          </table>
        </div>

        <aside class="inspector">
          @if (selected(); as m) {
            <div class="insp-head">
              <h2>{{ m.name }}</h2>
              <span class="chip" [class.bad]="m.lowStock" [class.ok]="!m.lowStock">{{ m.lowStock ? 'RE-SUPPLY DUE' : 'COVERED' }}</span>
            </div>
            <dl class="kv">
              <dt>On hand</dt><dd>{{ m.currentQuantity | number }} {{ m.unit }}</dd>
              <dt>Reorder at</dt><dd>{{ m.reorderThreshold | number }} {{ m.unit }}</dd>
              <dt>Purchased in</dt><dd>+{{ purchasedOf(m.id) | number }} {{ m.unit }} (total bought)</dd>
              <dt>Last unit cost</dt><dd>{{ lastCostOf(m.id) != null ? ('₦' + (lastCostOf(m.id) | number: '1.0-2')) : '—' }}</dd>
            </dl>

            <div class="panel-head"><h2>Purchase history</h2><span class="ph-sub">latest first</span></div>
            @if (ledger().length > 0) {
              <table class="table">
                <thead><tr><th>Date</th><th>Qty</th><th>Reference</th></tr></thead>
                <tbody>
                  @for (mv of ledger(); track mv.id) {
                    <tr>
                      <td class="mono small">{{ mv.timestamp | date: 'MMM d, y' }}</td>
                      <td class="mono delta plus">+{{ mv.quantityDelta | number }}</td>
                      <td class="mono small muted">{{ mv.referenceId?.slice(0, 12) || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="muted small">No purchase movements recorded for this material yet.</p>
            }
            <div class="actions" style="margin-top:0.6rem;">
              <a class="cta small ghost" href="/materials">Record purchase (needs approval)</a>
            </div>
          } @else {
            <p class="muted small">Select a material to see its purchase history.</p>
          }
        </aside>
      </div>
    }

    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class VendorsAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly materials = signal<MaterialRow[]>([]);
  readonly summary = signal<SummaryRow[]>([]);
  readonly selected = signal<MaterialRow | null>(null);
  readonly ledger = signal<MovementRow[]>([]);
  readonly suppliers = signal<SupplierRow[]>([]);
  readonly supplierSel = signal<SupplierRow | null>(null);
  readonly valuations = signal<Array<{ id: string; lastUnitCost: number | null }>>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly showAdd = signal(false);
  readonly tab = signal<'suppliers' | 'materials'>('suppliers');
  query = '';
  ns = { name: '', category: '', location: '', slaScore: null as number | null, quotaUnits: null as number | null, certified: false, complianceNotes: '' };
  edit: Record<string, { slaScore: number | null; quotaUnits: number | null; certified: boolean; complianceNotes: string }> = {};

  ngOnInit(): void {
    this.api.materials().subscribe((res) => this.materials.set(res as unknown as MaterialRow[]));
    this.api.inventorySummary().subscribe((s) => this.summary.set(s));
    this.api.suppliers().subscribe((res) => {
      this.suppliers.set(res as unknown as SupplierRow[]);
      this.edit = {};
      for (const s of res as unknown as SupplierRow[]) {
        this.edit[s.id] = { slaScore: s.slaScore, quotaUnits: s.quotaUnits, certified: s.certified, complianceNotes: s.complianceNotes ?? '' };
      }
    });
    this.api.materialsValuation().subscribe((res) =>
      this.valuations.set((res as unknown as Array<{ id: string; lastUnitCost: number | null }>)));
  }

  private materialSummary(id: string): SummaryRow | undefined {
    return this.summary().find((s) => s.itemType === 'material' && s.itemId === id);
  }
  purchasedOf(id: string): number {
    return this.materialSummary(id)?.byMovementType['purchase'] ?? 0;
  }
  usedOf(id: string): number {
    const s = this.materialSummary(id);
    if (!s) return 0;
    let used = 0;
    for (const [type, qty] of Object.entries(s.byMovementType)) {
      if (qty < 0 && type !== 'adjustment') used += -qty;
    }
    return used;
  }
  lastCostOf(id: string): number | null {
    return this.valuations().find((v) => v.id === id)?.lastUnitCost ?? null;
  }

  readonly purchasedTotal = computed(() =>
    this.summary().filter((s) => s.itemType === 'material').reduce((sum, s) => sum + (s.byMovementType['purchase'] ?? 0), 0));
  readonly criticalCount = computed(() => this.materials().filter((m) => m.lowStock).length);
  readonly certifiedCount = computed(() => this.suppliers().filter((s) => s.certified).length);

  suppliersVisible(): SupplierRow[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.suppliers().filter((s) => s.name.toLowerCase().includes(q) || (s.location ?? '').toLowerCase().includes(q)) : this.suppliers();
  }
  materialsVisible(): MaterialRow[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.materials().filter((m) => m.name.toLowerCase().includes(q)) : this.materials();
  }

  setTab(t: 'suppliers' | 'materials'): void { this.tab.set(t); this.selected.set(null); this.supplierSel.set(null); }
  queryChanged(): void { /* no-op pagination reset hook */ }

  selectMaterial(m: MaterialRow): void {
    if (this.selected()?.id === m.id) { this.selected.set(null); this.ledger.set([]); return; }
    this.selected.set(m);
    this.ledger.set([]);
    this.api.movements(m.id, 'material').subscribe({
      next: (res) => this.ledger.set((res.data as unknown as MovementRow[]).filter((mv) => mv.movementType === 'purchase').slice(0, 10)),
      error: () => this.ledger.set([]),
    });
  }

  selectSupplier(s: SupplierRow): void {
    this.supplierSel.set(this.supplierSel()?.id === s.id ? null : s);
  }

  addSupplier(): void {
    this.api.createSupplier({
      name: this.ns.name,
      category: this.ns.category || undefined,
      location: this.ns.location || undefined,
      certified: !!this.ns.certified,
      slaScore: this.ns.slaScore ?? undefined,
      quotaUnits: this.ns.quotaUnits ?? undefined,
      complianceNotes: this.ns.complianceNotes || undefined,
    }).subscribe({
      next: () => {
        this.ns = { name: '', category: '', location: '', slaScore: null, quotaUnits: null, certified: false, complianceNotes: '' };
        this.showAdd.set(false);
        this.ok('Supplier added.');
      },
      error: (e) => this.error.set(e?.error?.message ?? 'Add failed.'),
    });
  }

  saveSupplier(s: SupplierRow): void {
    const e = this.edit[s.id];
    this.api.updateSupplier(s.id, {
      slaScore: e.slaScore ?? undefined,
      quotaUnits: e.quotaUnits ?? undefined,
      certified: !!e.certified,
      complianceNotes: e.complianceNotes || undefined,
    }).subscribe({
      next: () => this.ok(`Saved ${s.name}.`),
      error: (err) => this.error.set(err?.error?.message ?? 'Save failed.'),
    });
  }

  deleteSupplier(s: SupplierRow): void {
    if (!confirm(`Delete supplier "${s.name}"?`)) return;
    this.api.deleteSupplier(s.id).subscribe({
      next: () => { this.supplierSel.set(null); this.ok('Supplier deleted.'); },
      error: (e) => this.error.set(e?.error?.message ?? 'Delete failed.'),
    });
  }

  private ok(msg: string): void {
    this.message.set(msg);
    this.error.set(null);
    this.api.suppliers().subscribe((res) => this.suppliers.set(res as unknown as SupplierRow[]));
  }
}