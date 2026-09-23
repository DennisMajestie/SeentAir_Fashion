import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface MaterialRow { id: string; name: string; unit: string; currentQuantity: number; reorderThreshold: number; lowStock: boolean; }

/** Raw materials management — Stitch layout: low-stock strip, materials table
    with derived quantities, purchase (approval-gated) and usage panels. */
@Component({
  selector: 'app-materials-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Raw materials</h1>
    @if (lowStock().length > 0) {
      <p class="rule-strip">LOW STOCK // {{ lowStockNames() }} — reorder before production stalls.</p>
    }

    <div class="cols">
      <section class="panel">
        <p class="section-label">Add material</p>
        <form class="form-grid" (ngSubmit)="create()">
          <label>Name <input [(ngModel)]="nm.name" name="mname" required placeholder="Cotton fabric" /></label>
          <label>Unit <input [(ngModel)]="nm.unit" name="munit" required placeholder="yards" /></label>
          <label>Reorder threshold <input type="number" min="0" [(ngModel)]="nm.reorderThreshold" name="mthr" /></label>
          <div class="wide"><button class="cta small" type="submit">Create</button></div>
        </form>
      </section>

      <section class="panel">
        <p class="section-label">Record purchase</p>
        <p class="muted small">Purchasing is approval-gated. Request → Management approves → record.</p>
        <form class="form-grid" (ngSubmit)="purchase()">
          <label class="wide">Material
            <select [(ngModel)]="pu.materialId" name="pumat" required>
              @for (m of materials(); track m.id) { <option [value]="m.id">{{ m.name }}</option> }
            </select>
          </label>
          <label>Quantity <input type="number" min="1" [(ngModel)]="pu.quantity" name="puqty" required /></label>
          <label>Cost ₦ <input type="number" min="0" [(ngModel)]="pu.cost" name="pucost" required /></label>
          <label class="wide">Note (who from — free text) <input [(ngModel)]="pu.note" name="punote" /></label>
          <div class="wide actions flat">
            @if (!pu.approvalRequestId) {
              <button class="cta small ghost" type="button" (click)="requestPurchaseApproval()">Request approval</button>
            } @else {
              <span class="chip acid">req {{ pu.approvalRequestId.slice(0, 8) }}</span>
              <button class="cta small" type="submit">Record purchase</button>
            }
          </div>
        </form>
      </section>

      <section class="panel">
        <p class="section-label">Record usage</p>
        <form class="form-grid" (ngSubmit)="usage()">
          <label class="wide">Material
            <select [(ngModel)]="us.materialId" name="usmat" required>
              @for (m of materials(); track m.id) { <option [value]="m.id">{{ m.name }}</option> }
            </select>
          </label>
          <label>Quantity used <input type="number" min="1" [(ngModel)]="us.quantityUsed" name="usqty" required /></label>
          <label class="wide">Production batch id (optional) <input [(ngModel)]="us.batchId" name="usbatch" /></label>
          <div class="wide"><button class="cta small" type="submit">Record usage</button></div>
        </form>
      </section>
    </div>

    <p class="section-label">Materials <span class="count">[{{ materials().length | number: '2.0' }}]</span></p>
    <table class="table">
      <thead><tr><th>Material</th><th>Unit</th><th>In stock (ledger)</th><th>Reorder at</th><th>Status</th></tr></thead>
      <tbody>
        @for (m of materials(); track m.id) {
          <tr>
            <td><button class="link" type="button" (click)="inspect(m.id)"><strong>{{ m.name }}</strong></button></td>
            <td class="mono">{{ m.unit }}</td>
            <td class="mono">{{ m.currentQuantity }}</td>
            <td class="mono">{{ m.reorderThreshold }}</td>
            <td><span class="chip" [class.bad]="m.lowStock" [class.ok]="!m.lowStock">{{ m.lowStock ? 'LOW STOCK' : 'OK' }}</span></td>
          </tr>
          @if (detail(); as d) {
            @if (d.id === m.id) {
              <tr>
                <td colspan="5">
                  <span class="chip acid">live ledger</span>
                  {{ d.name }} — {{ d.currentQuantity }} {{ d.unit }} on hand,
                  reorder at {{ d.reorderThreshold }}.
                  {{ d.lowStock ? 'Below threshold: reorder now.' : 'Above threshold.' }}
                  <button class="link" type="button" (click)="detail.set(null)">close</button>
                </td>
              </tr>
            }
          }
        }
      </tbody>
    </table>
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class MaterialsAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly materials = signal<MaterialRow[]>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  /** Server-authoritative reorder list (GET /materials/low-stock). */
  readonly lowStock = signal<MaterialRow[]>([]);
  readonly lowStockNames = computed(() =>
    this.lowStock().map((m) => `${m.name} (${m.currentQuantity} ${m.unit})`).join(' · '),
  );
  /** Row drill-down: a fresh read of one material's derived quantity. */
  readonly detail = signal<MaterialRow | null>(null);

  nm = { name: '', unit: '', reorderThreshold: 0 };
  pu = { materialId: '', quantity: 0, cost: 0, note: '', approvalRequestId: '' };
  us = { materialId: '', quantityUsed: 0, batchId: '' };

  ngOnInit(): void { this.load(); }
  private load(): void {
    this.api.materials().subscribe((res) => this.materials.set(res as unknown as MaterialRow[]));
    this.api.lowStockMaterials().subscribe((res) => this.lowStock.set(res as unknown as MaterialRow[]));
  }

  /** Re-read one material so the row shows the ledger as it stands now. */
  inspect(id: string): void {
    if (this.detail()?.id === id) { this.detail.set(null); return; }
    this.api.material(id).subscribe({
      next: (m) => this.detail.set(m as unknown as MaterialRow),
      error: (e) => this.fail(e, 'Could not load that material.'),
    });
  }
  private ok(msg: string): void { this.message.set(msg); this.error.set(null); this.load(); }
  private fail(err: { error?: { message?: string } }, fb: string): void { this.error.set(err?.error?.message ?? fb); this.message.set(null); }

  create(): void {
    this.api.createMaterial({ name: this.nm.name, unit: this.nm.unit, reorderThreshold: Number(this.nm.reorderThreshold) })
      .subscribe({ next: () => this.ok('Material created.'), error: (e) => this.fail(e, 'Create failed.') });
  }

  requestPurchaseApproval(): void {
    if (!this.pu.materialId || !this.pu.quantity) { this.error.set('Pick a material and quantity first.'); return; }
    const material = this.materials().find((m) => m.id === this.pu.materialId);
    this.api.createApproval('purchasing', { material: material?.name, quantity: this.pu.quantity, cost: this.pu.cost })
      .subscribe({
        next: (res) => { this.pu.approvalRequestId = res.id; this.ok('Purchase approval requested — Management must approve before recording.'); },
        error: (e) => this.fail(e, 'Approval request failed.'),
      });
  }

  purchase(): void {
    this.api.recordPurchase(this.pu.materialId, {
      quantity: Number(this.pu.quantity), cost: Number(this.pu.cost),
      note: this.pu.note || undefined, approvalRequestId: this.pu.approvalRequestId,
    }).subscribe({
      next: () => { this.pu = { materialId: '', quantity: 0, cost: 0, note: '', approvalRequestId: '' }; this.ok('Purchase recorded — stock updated via the ledger.'); },
      error: (e) => this.fail(e, 'Not approved yet — check the Approvals queue.'),
    });
  }

  usage(): void {
    this.api.recordUsage(this.us.materialId, {
      quantityUsed: Number(this.us.quantityUsed), batchId: this.us.batchId || undefined,
    }).subscribe({ next: () => this.ok('Usage recorded.'), error: (e) => this.fail(e, 'Usage failed.') });
  }
}
