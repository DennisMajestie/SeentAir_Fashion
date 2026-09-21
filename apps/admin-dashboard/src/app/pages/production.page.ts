import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Batch } from '../api.service';

interface ProductOpt { id: string; name: string; variants: Array<{ id: string; sku: string }>; }

/** Production — Kanban board plus batch creation (approval-gated),
    cost recording, and QC rejection handling (burn vs repair). */
@Component({
  selector: 'app-production',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Production</h1>
    <p class="rule-strip">STARTING PRODUCTION REQUIRES APPROVAL // request → Management approves in the queue → create the batch.</p>

    <div class="cols">
      <section class="panel">
        <p class="section-label" style="margin-top:0">Start a batch</p>
        <form class="form-grid" (ngSubmit)="createBatch()">
          <label class="wide">Variant (SKU)
            <select [(ngModel)]="nb.variantId" name="bvar" required>
              @for (p of products(); track p.id) {
                @for (v of p.variants; track v.id) {
                  <option [value]="v.id">{{ p.name }} — {{ v.sku }}</option>
                }
              }
            </select>
          </label>
          <label>Quantity <input type="number" min="1" [(ngModel)]="nb.quantity" name="bqty" required /></label>
          <label>Planned date <input type="date" [(ngModel)]="nb.plannedDate" name="bdate" /></label>
          <div class="wide actions" style="margin:0">
            @if (!nb.approvalRequestId) {
              <button class="cta small ghost" type="button" (click)="requestBatchApproval()">Request approval</button>
            } @else {
              <span class="chip acid">req {{ nb.approvalRequestId.slice(0, 8) }}</span>
              <button class="cta small" type="submit">Create batch</button>
            }
          </div>
        </form>
      </section>

      <section class="panel">
        <p class="section-label" style="margin-top:0">Record batch cost</p>
        <p class="muted small">Production cost = material + sewing + branding + packaging.</p>
        <form class="form-grid" (ngSubmit)="recordCost()">
          <label class="wide">Batch
            <select [(ngModel)]="nc.batchId" name="cbatch" required>
              @for (b of batches(); track b.id) { <option [value]="b.id">{{ b.variant.sku }} × {{ b.quantity }} ({{ b.stage }})</option> }
            </select>
          </label>
          <label>Material ₦ <input type="number" min="0" [(ngModel)]="nc.materialCost" name="cm" /></label>
          <label>Sewing ₦ <input type="number" min="0" [(ngModel)]="nc.sewingCost" name="cs" /></label>
          <label>Branding ₦ <input type="number" min="0" [(ngModel)]="nc.brandingCost" name="cb" /></label>
          <label>Packaging ₦ <input type="number" min="0" [(ngModel)]="nc.packagingCost" name="cp" /></label>
          <div class="wide"><button class="cta small" type="submit">Save cost</button></div>
        </form>
        @if (lastCostTotal() !== null) { <p class="success">Total cost: <span class="naira">₦{{ lastCostTotal() | number: '1.0-2' }}</span></p> }
      </section>

      <section class="panel">
        <p class="section-label" style="margin-top:0">QC rejection</p>
        <p class="muted small">Reason drives disposition: defective → burned (write-off); factory error → repaired & restocked.</p>
        <form class="form-grid" (ngSubmit)="recordQc()">
          <label class="wide">Batch
            <select [(ngModel)]="nq.batchId" name="qbatch" required>
              @for (b of activeBatches(); track b.id) { <option [value]="b.id">{{ b.variant.sku }} × {{ b.quantity }} ({{ b.stage }})</option> }
            </select>
          </label>
          <label>Quantity <input type="number" min="1" [(ngModel)]="nq.quantity" name="qqty" required /></label>
          <label>Disposition
            <select [(ngModel)]="nq.disposition" name="qdisp">
              <option value="burned">burned (write-off)</option>
              <option value="repaired_restocked">repaired & restocked</option>
            </select>
          </label>
          <label class="wide">Reason (required) <input [(ngModel)]="nq.reason" name="qreason" required placeholder="fabric defect / loose hem…" /></label>
          <div class="wide"><button class="cta small" type="submit">Record rejection</button></div>
        </form>
      </section>
    </div>

    <p class="section-label">Board <span class="count">// completion stocks finished goods via the ledger</span></p>
    <div class="board">
      @for (stage of stages(); track stage) {
        <div class="column">
          <h3>{{ stage }}</h3>
          @for (batch of batchesIn(stage); track batch.id) {
            <div class="card">
              <code>{{ batch.variant.sku }}</code>
              <p>{{ batch.quantity }} units</p>
              @if (costOf(batch.id); as cost) {
                <p class="small">Cost <span class="naira">₦{{ totalCost(batch.id) | number: '1.0-2' }}</span>
                  <span class="muted"> · ₦{{ perUnit(batch) | number: '1.0-2' }}/unit</span></p>
              } @else {
                <p class="small muted">No cost recorded</p>
              }
              @if (rejectsOf(batch.id); as rejects) {
                @if (rejects.length) {
                  <p class="small">
                    <span class="chip bad">{{ rejectedUnits(batch.id) }} rejected</span>
                    @for (r of rejects; track $index) {
                      <span class="muted"> {{ r['quantity'] }}× {{ r['disposition'] }} — {{ r['reason'] }}</span>
                    }
                  </p>
                }
              }
              @if (nextStage(stage); as next) {
                <button class="cta small" (click)="move(batch.id, next)">→ {{ next }}</button>
              }
              <button class="link" type="button" (click)="inspect(batch.id)">
                {{ detail()?.['id'] === batch.id ? 'hide' : 'details' }}
              </button>
              @if (detail(); as d) {
                @if (d['id'] === batch.id) {
                  <p class="small muted">
                    Stage {{ d['stage'] }} · planned {{ d['plannedDate'] || '—' }} ·
                    started {{ d['startedAt'] || '—' }} · completed {{ d['completedAt'] || '—' }}
                  </p>
                }
              }
            </div>
          }
        </div>
      }
    </div>
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class ProductionPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly stages = signal<string[]>([]);
  readonly batches = signal<Batch[]>([]);
  readonly products = signal<ProductOpt[]>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly lastCostTotal = signal<number | null>(null);
  /** Read-back caches keyed by batch id (cost + QC rejections). */
  readonly costs = signal<Map<string, Record<string, unknown>>>(new Map());
  readonly rejections = signal<Map<string, Array<Record<string, unknown>>>>(new Map());
  nb = { variantId: '', quantity: 0, plannedDate: '', approvalRequestId: '' };
  nc = { batchId: '', materialCost: 0, sewingCost: 0, brandingCost: 0, packagingCost: 0 };
  nq = { batchId: '', quantity: 1, disposition: 'burned', reason: '' };

  ngOnInit(): void {
    this.load();
    this.api.products().subscribe((res) => this.products.set(res.data as unknown as ProductOpt[]));
  }

  private load(): void {
    this.api.batches().subscribe((res) => {
      this.stages.set(res.stages);
      this.batches.set(res.data);
      this.loadCostsAndRejections(res.data);
    });
  }

  /** Read back what was written: recorded cost and QC history per batch. */
  private loadCostsAndRejections(batches: Batch[]): void {
    const costs = new Map<string, Record<string, unknown>>();
    const rejects = new Map<string, Array<Record<string, unknown>>>();
    for (const b of batches) {
      this.api.batchCost(b.id).subscribe({
        next: (c) => { if (c) { costs.set(b.id, c); this.costs.set(new Map(costs)); } },
        error: () => undefined, // no cost recorded yet
      });
      this.api.qcRejections(b.id).subscribe({
        next: (r) => { if (r?.length) { rejects.set(b.id, r); this.rejections.set(new Map(rejects)); } },
        error: () => undefined,
      });
    }
  }

  /** Full record for one batch (dates the board summary omits). */
  readonly detail = signal<Record<string, unknown> | null>(null);
  inspect(batchId: string): void {
    if (this.detail()?.['id'] === batchId) { this.detail.set(null); return; }
    this.api.batch(batchId).subscribe({
      next: (b) => this.detail.set(b),
      error: (e) => this.fail(e, 'Could not load that batch.'),
    });
  }

  costOf(batchId: string): Record<string, unknown> | null {
    return this.costs().get(batchId) ?? null;
  }
  rejectsOf(batchId: string): Array<Record<string, unknown>> | null {
    return this.rejections().get(batchId) ?? null;
  }
  rejectedUnits(batchId: string): number {
    return (this.rejections().get(batchId) ?? []).reduce((sum, r) => sum + Number(r['quantity'] ?? 0), 0);
  }
  totalCost(batchId: string): number {
    return Number(this.costs().get(batchId)?.['totalCost'] ?? 0);
  }
  perUnit(batch: Batch): number {
    const total = this.totalCost(batch.id);
    return batch.quantity > 0 ? total / batch.quantity : 0;
  }
  private ok(m: string): void { this.message.set(m); this.error.set(null); this.load(); }
  private fail(e: { error?: { message?: string } }, fb: string): void { this.error.set(e?.error?.message ?? fb); this.message.set(null); }

  activeBatches(): Batch[] {
    const last = this.stages()[this.stages().length - 1];
    return this.batches().filter((b) => b.stage !== last);
  }
  batchesIn(stage: string): Batch[] { return this.batches().filter((b) => b.stage === stage); }
  nextStage(stage: string): string | null {
    const s = this.stages();
    const i = s.indexOf(stage);
    return i >= 0 && i < s.length - 1 ? s[i + 1] : null;
  }

  requestBatchApproval(): void {
    if (!this.nb.variantId || !this.nb.quantity) { this.error.set('Pick a variant and quantity first.'); return; }
    this.api.createApproval('production_start', { variantId: this.nb.variantId, quantity: this.nb.quantity })
      .subscribe({
        next: (r) => { this.nb.approvalRequestId = r.id; this.ok('Production approval requested — Management decides in the queue.'); },
        error: (e) => this.fail(e, 'Request failed.'),
      });
  }

  createBatch(): void {
    this.api.createBatch({
      variantId: this.nb.variantId, quantity: Number(this.nb.quantity),
      plannedDate: this.nb.plannedDate || undefined, approvalRequestId: this.nb.approvalRequestId,
    }).subscribe({
      next: () => { this.nb = { variantId: '', quantity: 0, plannedDate: '', approvalRequestId: '' }; this.ok('Batch created in the first stage.'); },
      error: (e) => this.fail(e, 'Not approved yet — check the Approvals queue.'),
    });
  }

  recordCost(): void {
    const { batchId, ...costs } = this.nc;
    this.api.recordBatchCost(batchId, {
      materialCost: Number(costs.materialCost), sewingCost: Number(costs.sewingCost),
      brandingCost: Number(costs.brandingCost), packagingCost: Number(costs.packagingCost),
    }).subscribe({
      next: (res) => { this.lastCostTotal.set(Number((res as Record<string, unknown>)['totalCost'] ?? 0)); this.ok('Cost saved.'); },
      error: (e) => this.fail(e, 'Cost save failed.'),
    });
  }

  recordQc(): void {
    const { batchId, ...rest } = this.nq;
    this.api.recordQcRejection(batchId, {
      quantity: Number(rest.quantity), reason: rest.reason, disposition: rest.disposition,
    }).subscribe({
      next: () => { this.nq = { batchId: '', quantity: 1, disposition: 'burned', reason: '' }; this.ok('Rejection recorded — burned units are excluded from completion stock-in.'); },
      error: (e) => this.fail(e, 'Rejection failed.'),
    });
  }

  move(id: string, stage: string): void {
    this.error.set(null);
    this.api.moveBatch(id, stage).subscribe({ next: () => this.load(), error: (e) => this.fail(e, 'Stage move failed.') });
  }
}
