import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Batch } from '../api.service';

interface ProductOpt { id: string; name: string; variants: Array<{ id: string; sku: string }>; }

/** A2/A3/A4 — Production Kanban Board, Batch Detail dossier and the
    Record-QC-Rejection modal, per the approved Stitch screens. All actions
    keep their approval-gated API flows (batch creation, cost, QC, moves). */
@Component({
  selector: 'app-production',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Operations · Production floor pipeline</p>
        <h1>Production Kanban board</h1>
        <p class="ops-sub">Batches for each product as they move through the factory. Finished batches are added to stock automatically.</p>
      </div>
      <div class="ops-actions">
        <span class="search"><input placeholder="Filter by SKU…" [(ngModel)]="skuFilter" name="skuFilter" aria-label="Filter batches by SKU" /></span>
        <button class="cta small" type="button" (click)="showNewBatch.set(!showNewBatch())">
          {{ showNewBatch() ? 'Close' : '+ New batch' }}
        </button>
      </div>
    </div>

    <div class="kpi-bar">
      <div class="kpi">
        <span class="kpi-label">Active production</span>
        <span class="kpi-value">{{ activeUnits() | number }} <small>units</small></span>
        <span class="kpi-sub">{{ activeBatches().length }} batch(es) in flight</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Completed</span>
        <span class="kpi-value">{{ completedUnits() | number }} <small>units</small></span>
        <span class="kpi-sub">ready to ship (added to stock)</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Rejection rate</span>
        <span class="kpi-value">{{ rejectionRate() }}<small>%</small></span>
        <span class="kpi-sub">{{ totalRejected() }} unit(s) flagged across recorded QC</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Costed batches</span>
        <span class="kpi-value">{{ costs().size }}<small>/{{ batches().length }}</small></span>
        <span class="kpi-sub">material + sewing + branding + packaging</span>
      </div>
    </div>

    <p class="rule-strip">STARTING PRODUCTION REQUIRES APPROVAL // request → Management approves in the queue → create the batch.</p>

    @if (showNewBatch()) {
      <div class="cols">
        <section class="panel">
          <div class="panel-head"><h2>New batch request</h2><span class="ph-sub">approval-gated</span></div>
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
            <div class="wide actions flat">
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
          <div class="panel-head"><h2>Record batch cost</h2></div>
          <p class="muted small">Production cost = raw material + sewing + branding + packaging.</p>
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
      </div>
    }

    <!-- ===================== A3 — Batch detail dossier ===================== -->
    @if (selected(); as b) {
      <section class="panel" style="border-color: var(--hairline-strong);">
        <div class="panel-head">
          <h2>Batch #{{ b.id.slice(0, 8) }} — {{ b.variant.sku }}</h2>
          <span class="ph-sub">{{ b.quantity }} units · planned {{ b.plannedDate || '—' }}</span>
          <span class="ph-end">
            <button class="cta small ghost" type="button" (click)="openQcModal(b)">⚠ Record QC rejection</button>
            @if (nextStage(b.stage); as next) {
              <button class="cta small" (click)="move(b.id, next)">Advance to {{ next }} →</button>
            }
            <button class="link" type="button" (click)="closeDetail()">Close</button>
          </span>
        </div>

        <div class="stepper">
          @for (s of stages(); track s; let i = $index) {
            <div class="step" [class.done]="stageIndex(b.stage) > i" [class.now]="b.stage === s">
              <span class="s-idx">{{ (i + 1) | number: '2.0' }}</span>
              <span class="s-name">{{ s }}</span>
            </div>
          }
        </div>

        <div class="cols">
          <section class="panel flat">
            <div class="panel-head"><h2>Batch costs</h2><span class="ph-sub">how the money splits</span></div>
            @if (costOf(b.id); as cost) {
              <table class="table">
                <tbody>
                  <tr><td>Raw materials intake</td><td class="mono">₦{{ num(cost['materialCost']) | number: '1.0-2' }}</td></tr>
                  <tr><td>Sewing & assembly labour</td><td class="mono">₦{{ num(cost['sewingCost']) | number: '1.0-2' }}</td></tr>
                  <tr><td>Branding & hardware</td><td class="mono">₦{{ num(cost['brandingCost']) | number: '1.0-2' }}</td></tr>
                  <tr><td>Packaging & polybags</td><td class="mono">₦{{ num(cost['packagingCost']) | number: '1.0-2' }}</td></tr>
                  <tr><td><strong>Total batch value</strong></td>
                      <td class="mono"><strong class="naira">₦{{ totalCost(b.id) | number: '1.0-2' }}</strong>
                        <span class="muted small"> · ₦{{ perUnit(b) | number: '1.0-2' }}/unit</span></td></tr>
                </tbody>
              </table>
            } @else {
              <p class="muted small">No cost recorded yet — use "Record batch cost" above.</p>
            }
            <div class="gap-sep"></div>
            <div class="panel-head"><h2>BOM vs actual consumption</h2><span class="ph-sub">planned vs floor usage</span></div>
            @if (bomOf(b.id); as bom) {
              @if (bom.length > 0) {
                <table class="table">
                  <thead><tr><th>Material</th><th>Planned</th><th>Consumed</th><th>Δ</th></tr></thead>
                  <tbody>
                    @for (row of bom; track $index) {
                      <tr>
                        <td class="small">{{ row['materialName'] }}</td>
                        <td class="mono">{{ row['plannedQuantity'] }}</td>
                        <td class="mono">{{ row['consumedQuantity'] }}</td>
                        <td class="mono" [class.delta.plus]="num(row['variance']) === 0" [class.delta.minus]="num(row['variance']) !== 0">{{ row['variance'] }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <p class="muted small">No BOM linked to this batch variant yet.</p>
              }
            } @else {
              <p class="muted small">Loading consumption…</p>
            }
          </section>

          <section class="panel flat">
            <div class="panel-head">
              <h2>Quality control rejections & flaws</h2>
              <button class="cta small ghost ph-end" type="button" (click)="openQcModal(b)">Record QC rejection</button>
            </div>
            @if (rejectsOf(b.id); as rejects) {
              <table class="table">
                <thead><tr><th>When</th><th>Qty</th><th>Root cause</th><th>Disposition</th></tr></thead>
                <tbody>
                  @for (r of rejects; track $index) {
                    <tr>
                      <td class="mono small">{{ str(r['createdAt']) | date: 'MMM d, HH:mm' }}</td>
                      <td class="mono">{{ r['quantity'] }}</td>
                      <td class="small">{{ r['reason'] }}</td>
                      <td><span class="chip" [class.bad]="r['disposition'] === 'burned'" [class.ok]="r['disposition'] !== 'burned'">
                        {{ r['disposition'] === 'burned' ? 'Burned (write-off)' : 'Repaired & restocked' }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="success small">No flaws recorded on this batch.</p>
            }
          </section>
        </div>

        <div class="panel-head"><h2>Batch record</h2></div>
        @if (detail(); as d) {
          <dl class="kv">
            <dt>Stage</dt><dd>{{ d['stage'] }}</dd>
            <dt>Planned date</dt><dd>{{ d['plannedDate'] || '—' }}</dd>
            <dt>Created</dt><dd>{{ str(d['createdAt']) | date: 'medium' }}</dd>
            <dt>Completed</dt><dd>{{ d['completedDate'] ? (str(d['completedDate']) | date: 'medium') : 'not yet' }}</dd>
            <dt>Approval request</dt><dd><code>{{ str(d['approvalRequestId']).slice(0, 8) }}</code> (production_start, approved)</dd>
          </dl>

          <div class="gap-sep"></div>
          <div class="panel-head"><h2>Line telemetry</h2><span class="ph-sub">machine audit feed</span>
            <span class="ph-end"><button class="cta small ghost" type="button" (click)="openTelemetryForm()">Record snapshot</button></span>
          </div>
          @if (telemetry().length > 0) {
            <table class="table">
              <thead><tr><th>When</th><th>Stage</th><th>Machine</th><th>RPM</th><th>Needle cycles</th><th>Thread reserve</th></tr></thead>
              <tbody>
                @for (t of telemetry(); track $index) {
                  <tr>
                    <td class="mono small">{{ str(t['recordedAt']) | date: 'MMM d, HH:mm' }}</td>
                    <td class="small">{{ t['stage'] }}</td>
                    <td class="small">{{ t['machine'] }}</td>
                    <td class="mono">{{ t['rpm'] ?? '—' }}</td>
                    <td class="mono">{{ t['needleCycles'] ?? '—' }}</td>
                    <td class="mono">{{ t['threadReservePct'] != null ? t['threadReservePct'] + '%' : '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="muted small">No machine snapshots recorded on this batch yet.</p>
          }

          @if (showTelemetry()) {
            <form class="form-grid" (ngSubmit)="recordTelemetry(b)">
              <label>Stage <input [(ngModel)]="nt.stage" name="tstage" required placeholder="Sewing" /></label>
              <label>Machine <input [(ngModel)]="nt.machine" name="tmachine" required placeholder="JUKI DDL-8700 (line 02)" /></label>
              <label>RPM <input type="number" min="0" [(ngModel)]="nt.rpm" name="trpm" /></label>
              <label>Needle cycles <input type="number" min="0" [(ngModel)]="nt.needleCycles" name="tcycles" /></label>
              <label>Thread reserve % <input type="number" min="0" max="100" [(ngModel)]="nt.threadReservePct" name="treserve" /></label>
              <div class="wide actions flat">
                <button class="cta small" type="submit">Save snapshot</button>
                <button class="link" type="button" (click)="showTelemetry.set(false)">Close</button>
              </div>
            </form>
          }
        } @else {
          <p class="muted small">Loading batch record…</p>
        }
      </section>
    }

    <!-- ===================== A2 — Kanban board ===================== -->
    <div class="panel-head" style="margin-top:1.2rem;">
      <h2>Board</h2>
      <span class="ph-sub">finished batches are added to stock automatically</span>
    </div>
    <div class="board">
      @for (stage of stages(); track stage; let i = $index) {
        <div class="column">
          <div class="col-head">
            <h3>{{ (i + 1) | number: '2.0' }} · {{ stage }}</h3>
            <span class="col-n">{{ visibleIn(stage).length }}</span>
          </div>
          @for (batch of visibleIn(stage); track batch.id) {
            <div class="card">
              <div class="card-top">
                <code>#{{ batch.id.slice(0, 4) }}</code>
                @if (rejectedUnits(batch.id) > 0) {
                  <span class="chip bad">{{ rejectedUnits(batch.id) }} flagged</span>
                } @else if (costOf(batch.id)) {
                  <span class="chip acid">costed</span>
                } @else {
                  <span class="chip">queue</span>
                }
              </div>
              <p class="card-name">{{ batch.variant.sku }}</p>
              <p>{{ batch.quantity }} units @if (batch.plannedDate) { · planned {{ batch.plannedDate }} }</p>
              @if (costOf(batch.id)) {
                <p class="small">Est. cost <span class="naira">₦{{ totalCost(batch.id) | number: '1.0-0' }}</span>
                  <span class="muted"> · ₦{{ perUnit(batch) | number: '1.0-0' }}/unit</span></p>
              } @else {
                <p class="small muted">No cost recorded</p>
              }
              <div class="actions flat">
                @if (nextStage(stage); as next) {
                  <button class="cta small" (click)="move(batch.id, next)">→ {{ next }}</button>
                }
                <button class="link" type="button" (click)="openDetail(batch)">
                  {{ selected()?.id === batch.id ? 'close' : 'open batch' }}
                </button>
              </div>
            </div>
          }
          @if (visibleIn(stage).length === 0) { <p class="muted small">—</p> }
        </div>
      }
    </div>
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }

    <!-- ===================== A4 — Record QC rejection modal ===================== -->
    @if (qcBatch(); as qb) {
      <div class="modal-scrim" (click)="closeQcModal($event)">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="qc-title" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h2 id="qc-title">⚠ Record quality control rejection</h2>
            <button class="x" type="button" aria-label="Close" (click)="qcBatch.set(null)">✕</button>
          </div>
          <p class="mini-note">Batch #{{ qb.id.slice(0, 8) }} · {{ qb.variant.sku }} · {{ qb.quantity }} units · {{ qb.stage }}</p>
          <form (ngSubmit)="recordQc()">
            <div class="form-grid">
              <label>Qty rejected (max {{ qb.quantity }})
                <input type="number" min="1" [max]="qb.quantity" [(ngModel)]="nq.quantity" name="qqty" required />
              </label>
              <label>Defect classification / root cause
                <select [(ngModel)]="nq.disposition" name="qdisp">
                  <option value="burned">Defective — burn (write-off)</option>
                  <option value="repaired_restocked">Minor factory error — repair & restock</option>
                </select>
              </label>
              <label class="wide">Defect station / anatomic location
                <input [(ngModel)]="nq.station" name="qstation" placeholder="left thigh pocket seam / line 02…" />
              </label>
              <label class="wide">Assigned inspector (QA sign-off)
                <select [(ngModel)]="nq.inspectorId" name="qinsp">
                  <option value="">— unassigned —</option>
                  @for (u of staff(); track u['id']) {
                    <option [value]="u['id']">{{ u['name'] }} ({{ roleLabel(u) }})</option>
                  }
                </select>
              </label>
              <label class="wide">Detailed notes & remediation observations
                <textarea [(ngModel)]="nq.reason" name="qreason" rows="3" required
                  placeholder="Noticeable warp thread break… cannot be washed or reworked."></textarea>
              </label>
            </div>
            <div class="form-actions">
              <button class="cta small" type="submit">Log rejection</button>
              <button class="cta small ghost" type="button" (click)="qcBatch.set(null)">Cancel</button>
              <span class="muted small">Reason drives disposition: defective → burned; factory error → repaired & restocked.</span>
            </div>
          </form>
        </div>
      </div>
    }
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
  readonly showNewBatch = signal(false);
  /** Read-back caches keyed by batch id (cost + QC rejections). */
  readonly costs = signal<Map<string, Record<string, unknown>>>(new Map());
  readonly rejections = signal<Map<string, Array<Record<string, unknown>>>>(new Map());
  /** A3 detail selection + full record; A4 modal target. */
  readonly selected = signal<Batch | null>(null);
  readonly detail = signal<Record<string, unknown> | null>(null);
  readonly qcBatch = signal<Batch | null>(null);
  readonly inspector = signal('signed in staff');
  readonly bomCache = signal<Map<string, Array<Record<string, unknown>>>>(new Map());
  readonly telemetry = signal<Array<Record<string, unknown>>>([]);
  readonly showTelemetry = signal(false);
  readonly staff = signal<Array<Record<string, unknown>>>([]);
  private meEmail: string | null = null;
  skuFilter = '';
  nb = { variantId: '', quantity: 0, plannedDate: '', approvalRequestId: '' };
  nc = { batchId: '', materialCost: 0, sewingCost: 0, brandingCost: 0, packagingCost: 0 };
  nq = { batchId: '', quantity: 1, disposition: 'burned', reason: '', station: '', inspectorId: '' };
  nt = { stage: '', machine: '', rpm: null as number | null, needleCycles: null as number | null, threadReservePct: null as number | null };

  ngOnInit(): void {
    this.load();
    this.api.products().subscribe((res) => this.products.set(res.data as unknown as ProductOpt[]));
    this.api.me().subscribe({
      next: (p) => { this.inspector.set(`${p.name} (${p.role.replaceAll('_', ' ')})`); this.meEmail = p.email; },
      error: () => undefined,
    });
    this.api.users().subscribe((res) => {
      this.staff.set(res.data as unknown as Array<Record<string, unknown>>);
      if (this.meEmail) {
        const me = (res.data as unknown as Array<{ id: string; email: string }>).find((u) => u.email === this.meEmail);
        if (me) this.nq.inspectorId = me.id;
      }
    });
  }

  private load(): void {
    this.api.batches().subscribe((res) => {
      this.stages.set(res.stages);
      this.batches.set(res.data);
      this.loadCostsAndRejections(res.data);
      const sel = this.selected();
      if (sel) {
        const fresh = res.data.find((b) => b.id === sel.id) ?? null;
        this.selected.set(fresh);
        if (fresh) this.api.batch(fresh.id).subscribe((b) => this.detail.set(b));
      }
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

  // --- KPI derivations (all from live batch/QC data) ---
  readonly activeUnits = computed(() => this.activeBatchList().reduce((s, b) => s + b.quantity, 0));
  readonly completedUnits = computed(() => {
    const last = this.stages()[this.stages().length - 1];
    return this.batches().filter((b) => b.stage === last).reduce((s, b) => s + b.quantity, 0);
  });
  readonly totalRejected = computed(() => {
    let n = 0;
    for (const list of this.rejections().values()) n += list.reduce((s, r) => s + Number(r['quantity'] ?? 0), 0);
    return n;
  });
  readonly rejectionRate = computed(() => {
    const total = this.batches().reduce((s, b) => s + b.quantity, 0);
    return total > 0 ? (Math.round((this.totalRejected() / total) * 1000) / 10).toFixed(1) : '0.0';
  });

  private activeBatchList(): Batch[] {
    const last = this.stages()[this.stages().length - 1];
    return this.batches().filter((b) => b.stage !== last);
  }

  openDetail(batch: Batch): void {
    if (this.selected()?.id === batch.id) { this.closeDetail(); return; }
    this.selected.set(batch);
    this.detail.set(null);
    this.telemetry.set([]);
    this.api.batch(batch.id).subscribe({
      next: (b) => this.detail.set(b),
      error: (e) => this.fail(e, 'Could not load that batch.'),
    });
    this.api.plannedVsConsumed(batch.id).subscribe({
      next: (rows) => {
        const cache = new Map(this.bomCache());
        cache.set(batch.id, (rows ?? []) as unknown as Array<Record<string, unknown>>);
        this.bomCache.set(cache);
      },
      error: () => undefined,
    });
    this.api.batchTelemetry(batch.id).subscribe({
      next: (rows) => this.telemetry.set(rows as unknown as Array<Record<string, unknown>>),
      error: () => this.telemetry.set([]),
    });
  }
  closeDetail(): void { this.selected.set(null); this.detail.set(null); this.telemetry.set([]); }

  bomOf(batchId: string): Array<Record<string, unknown>> | null {
    return this.bomCache().get(batchId) ?? null;
  }

  roleLabel(u: Record<string, unknown>): string {
    const r = u['role'];
    return typeof r === 'string' ? r.replaceAll('_', ' ') : '—';
  }

  openTelemetryForm(): void { this.showTelemetry.set(!this.showTelemetry()); }

  recordTelemetry(batch: Batch): void {
    this.api.recordTelemetry(batch.id, {
      stage: this.nt.stage,
      machine: this.nt.machine,
      rpm: this.nt.rpm ?? undefined,
      needleCycles: this.nt.needleCycles ?? undefined,
      threadReservePct: this.nt.threadReservePct ?? undefined,
      operatorId: this.nq.inspectorId || undefined,
    }).subscribe({
      next: () => {
        this.nt = { stage: '', machine: '', rpm: null, needleCycles: null, threadReservePct: null };
        this.showTelemetry.set(false);
        this.ok('Telemetry snapshot recorded.');
        this.api.batchTelemetry(batch.id).subscribe((rows) => this.telemetry.set(rows as unknown as Array<Record<string, unknown>>));
      },
      error: (e) => this.fail(e, 'Telemetry failed.'),
    });
  }

  openQcModal(batch: Batch): void {
    this.qcBatch.set(batch);
    this.nq = { batchId: batch.id, quantity: 1, disposition: 'burned', reason: '', station: '', inspectorId: this.nq.inspectorId };
  }
  closeQcModal(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.qcBatch.set(null);
  }

  stageIndex(stage: string): number { return this.stages().indexOf(stage); }
  num(v: unknown): number { return Number(v ?? 0); }
  str(v: unknown): string { return v == null ? '' : String(v); }

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

  activeBatches(): Batch[] { return this.activeBatchList(); }
  batchesIn(stage: string): Batch[] { return this.batches().filter((b) => b.stage === stage); }
  visibleIn(stage: string): Batch[] {
    const f = this.skuFilter.trim().toLowerCase();
    const rows = this.batchesIn(stage);
    return f ? rows.filter((b) => b.variant.sku.toLowerCase().includes(f)) : rows;
  }
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
      next: () => { this.nb = { variantId: '', quantity: 0, plannedDate: '', approvalRequestId: '' }; this.showNewBatch.set(false); this.ok('Batch created in the first stage.'); },
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
    const { batchId, station, inspectorId, ...rest } = this.nq;
    const reason = station ? `${station} — ${rest.reason}` : rest.reason;
    this.api.recordQcRejection(batchId, {
      quantity: Number(rest.quantity), reason, disposition: rest.disposition,
      inspectorId: inspectorId || undefined,
    }).subscribe({
      next: () => {
        this.nq = { batchId: '', quantity: 1, disposition: 'burned', reason: '', station: '', inspectorId: this.nq.inspectorId };
        this.qcBatch.set(null);
        this.ok('Rejection recorded — burned units are excluded from completion stock-in.');
      },
      error: (e) => this.fail(e, 'Rejection failed.'),
    });
  }

  move(id: string, stage: string): void {
    this.error.set(null);
    this.api.moveBatch(id, stage).subscribe({ next: () => this.load(), error: (e) => this.fail(e, 'Stage move failed.') });
  }
}
