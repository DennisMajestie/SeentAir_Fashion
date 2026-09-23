import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface MaterialRow { id: string; name: string; unit: string; currentQuantity: number; reorderThreshold: number; lowStock: boolean; }
interface SummaryRow { itemType: string; itemId: string; currentQuantity: number; byMovementType: Record<string, number>; }
interface MovementRow { id: string; movementType: string; quantityDelta: number; timestamp: string; referenceId: string | null; }

/** A13 — Mill vendor directory & procurement contracts. LAYOUT SHELL:
    supplier-relationship management is DESCOPED from the platform (client
    decision), so this page renders the approved layout over the real data
    that approximates it — per-material supply records built from purchase
    movements on the inventory ledger. Vendor identities, SLAs and quota
    contracts are labeled as gaps, not invented. */
@Component({
  selector: 'app-vendors-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Management · Procurement</p>
        <h1>Supply records & procurement</h1>
        <p class="ops-sub">Inward supply history per material, from the inventory ledger's purchase movements.</p>
      </div>
      <div class="ops-actions">
        <a class="cta small" href="/materials">Draft new purchase order</a>
      </div>
    </div>

    <p class="rule-strip">SUPPLIER MANAGEMENT IS DESCOPED // the client requirements exclude vendor-relationship management —
      purchases record a free-text supplier note only, and purchasing stays approval-gated.</p>
    <!-- GAP: the reference's certified-mill directory, SLA scores, quota contracts, compliance
         audits and haulage-corridor surcharges all need a vendor entity that is descoped. -->

    <div class="kpi-bar">
      <div class="kpi"><span class="kpi-label">Materials supplied</span><span class="kpi-value">{{ materials().length }}</span><span class="kpi-sub">in the raw-materials registry</span></div>
      <div class="kpi"><span class="kpi-label">Inward volume</span><span class="kpi-value">{{ purchasedTotal() | number }}</span><span class="kpi-sub">units purchased in (all materials, mixed units)</span></div>
      <div class="kpi"><span class="kpi-label">Consumed</span><span class="kpi-value">{{ usedTotal() | number }}</span><span class="kpi-sub">units issued to production</span></div>
      <div class="kpi" [class.kpi-action]="criticalCount() > 0">
        <span class="kpi-label">Re-supply needed</span>
        <span class="kpi-value">{{ criticalCount() }}</span>
        <span class="kpi-sub">materials at or below reorder threshold</span>
      </div>
    </div>

    <div class="ops-toolbar">
      <span class="search"><input placeholder="Search materials / supply records…" [(ngModel)]="query" name="q" aria-label="Search supply records" /></span>
    </div>

    <div class="side-split">
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Material / supply record</th><th>Purchased in</th><th>Consumed</th><th>On hand</th><th>Status</th></tr></thead>
          <tbody>
            @for (m of visible(); track m.id) {
              <tr class="clickable" [class.sel]="selected()?.id === m.id" (click)="select(m)">
                <td><strong>{{ m.name }}</strong><br /><span class="mini-note">unit: {{ m.unit }}</span></td>
                <td class="mono delta plus">+{{ purchasedOf(m.id) | number }}</td>
                <td class="mono delta minus">−{{ usedOf(m.id) | number }}</td>
                <td class="mono">{{ m.currentQuantity | number }} {{ m.unit }}</td>
                <td><span class="chip" [class.bad]="m.lowStock" [class.ok]="!m.lowStock">{{ m.lowStock ? 'RE-SUPPLY' : 'COVERED' }}</span></td>
              </tr>
            }
            @if (visible().length === 0) { <tr><td colspan="5" class="muted small">No supply records match.</td></tr> }
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
            <dt>Purchased in</dt><dd>+{{ purchasedOf(m.id) | number }} {{ m.unit }} (ledger total)</dd>
            <dt>Vendor</dt><dd class="muted">free-text on each purchase note — no vendor registry (descoped)</dd>
          </dl>

          <div class="panel-head"><h2>Inward purchase ledger</h2><span class="ph-sub">live movements</span></div>
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
          <!-- GAP: per-purchase supplier name, lead time and ₦ cost history — purchases store a
               note and cost server-side but the movements read model exposes qty/reference only. -->
          <div class="actions" style="margin-top:0.6rem;">
            <a class="cta small ghost" href="/materials">Record purchase (approval-gated)</a>
          </div>
        } @else {
          <p class="muted small">Select a supply record to view its inward purchase ledger.</p>
        }
      </aside>
    </div>
  `,
})
export class VendorsAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly materials = signal<MaterialRow[]>([]);
  readonly summary = signal<SummaryRow[]>([]);
  readonly selected = signal<MaterialRow | null>(null);
  readonly ledger = signal<MovementRow[]>([]);
  query = '';

  ngOnInit(): void {
    this.api.materials().subscribe((res) => this.materials.set(res as unknown as MaterialRow[]));
    this.api.inventorySummary().subscribe((s) => this.summary.set(s));
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

  readonly purchasedTotal = computed(() =>
    this.summary().filter((s) => s.itemType === 'material').reduce((sum, s) => sum + (s.byMovementType['purchase'] ?? 0), 0));
  readonly usedTotal = computed(() =>
    this.materials().reduce((sum, m) => sum + this.usedOf(m.id), 0));
  readonly criticalCount = computed(() => this.materials().filter((m) => m.lowStock).length);

  visible(): MaterialRow[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.materials().filter((m) => m.name.toLowerCase().includes(q)) : this.materials();
  }

  select(m: MaterialRow): void {
    if (this.selected()?.id === m.id) { this.selected.set(null); this.ledger.set([]); return; }
    this.selected.set(m);
    this.ledger.set([]);
    this.api.movements(m.id, 'material').subscribe({
      next: (res) => this.ledger.set((res.data as unknown as MovementRow[]).filter((mv) => mv.movementType === 'purchase').slice(0, 10)),
      error: () => this.ledger.set([]),
    });
  }
}
