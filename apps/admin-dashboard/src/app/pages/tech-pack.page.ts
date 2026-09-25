import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface VariantRow { id: string; sku: string; size: string | null; colour: string | null; priceOverride: number | null; }
interface ProductRow { id: string; name: string; category: string | null; basePrice: number; variants: VariantRow[]; }

/** A7 — Silhouette pattern & tech pack editor. Bound to the TechPacks API:
    per-variant spec with graded measurements, protocols, DXF link and a
    revision journal; approved packs become the shop-floor reference. */
@Component({
  selector: 'app-tech-pack',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Product · Spec & BOM editor</p>
        <h1>Product technical details</h1>
        <p class="ops-sub">Cutting, fabric needs and measurement details for each product.</p>
      </div>
      <div class="ops-actions">
        <select class="table-filter" [(ngModel)]="selectedId" name="prod" (ngModelChange)="select()">
          <option value="">— choose a product —</option>
          @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
        </select>
        <select class="table-filter" [(ngModel)]="variantId" name="variant" (ngModelChange)="loadPack()">
          @for (v of variants(); track v.id) { <option [value]="v.id">{{ v.sku }} @if (v.size || v.colour) { · {{ variantLabel(v) }} }</option> }
        </select>
      </div>
    </div>

    @if (selected(); as p) {
      <div class="ops-actions" style="justify-content:flex-end; margin:0 0 0.9rem;">
        @if (!pack()) {
          <button class="cta small" type="button" (click)="createPack()" [disabled]="!variantId">Create tech pack</button>
        } @else {
          <span class="chip" [class.ok]="pack()?.['status'] === 'approved'" [class.warn]="pack()?.['status'] !== 'approved'">{{ pack()?.['status'] }} · rev {{ pack()?.['revision'] }}</span>
          <button class="cta small" type="button" (click)="saveDraft()">Save revision {{ nextRev() }}</button>
          @if (pack()?.['status'] !== 'approved') {
            <button class="cta small" type="button" (click)="approvePack()">Submit for management approval</button>
          }
        }
      </div>

      <p class="rule-strip">LOCKED SPEC // every save snapshots a new revision; only an approved pack becomes the shop-floor reference.</p>

      <div class="kpi-bar">
        <div class="kpi">
          <span class="kpi-label">Standard unit cost</span>
          @if (unitCost() !== null) {
            <span class="kpi-value">₦{{ unitCost() | number: '1.0-0' }}</span>
            <span class="kpi-sub">from batch #{{ costBatchRef() }} recorded cost</span>
          } @else {
            <span class="kpi-value">—</span>
            <span class="kpi-sub">no production batch costs for this product yet</span>
          }
        </div>
        <div class="kpi"><span class="kpi-label">Retail price</span><span class="kpi-value">₦{{ p.basePrice | number: '1.0-0' }}</span><span class="kpi-sub">current catalogue base price</span></div>
        <div class="kpi">
          <span class="kpi-label">Target yield</span>
          <span class="kpi-value">{{ pack()?.['targetYieldUnits'] ?? '—' }}<small> / {{ pack()?.['cuttingEfficiencyPct'] != null ? pack()?.['cuttingEfficiencyPct'] + '%' : '—' }}</small></span>
          <span class="kpi-sub">units / cutting efficiency</span>
        </div>
        <div class="kpi"><span class="kpi-label">Size run</span><span class="kpi-value">{{ p.variants.length }}</span><span class="kpi-sub">sizes & colours registered</span></div>
      </div>

      <div class="ops-grid">
        <div>
          <section class="panel flat">
            <div class="panel-head"><h2>Graded garment measurement specification</h2><span class="ph-sub">points of measure</span></div>
            @if (graded(); as gm) {
              @if (measurementRows(gm).length > 0) {
                <table class="table">
                  <thead><tr><th>POM</th>@for (s of sizeCols(gm); track $index) { <th>{{ s }}</th> }</tr></thead>
                  <tbody>
                    @for (row of measurementRows(gm); track $index) {
                      <tr><td class="small">{{ row.pom }}</td>@for (cell of row.cells; track $index) { <td class="mono">{{ cell }}</td> }</tr>
                    }
                  </tbody>
                </table>
              } @else {
                <p class="muted small">Measurement object present but empty — open the editor and record points of measure.</p>
              }
            } @else {
              <p class="muted small">No graded measurement set yet.</p>
            }
          </section>

          <section class="panel flat">
            <div class="panel-head"><h2>Seam, thread & laydown protocol</h2></div>
            <p class="muted small">Stitch density, thread matching and thermal-conditioning SOPs.</p>
            <div class="kv">
              <dt>Stitch protocol</dt><dd class="wrap-anywhere" style="white-space:pre-wrap;">{{ pack()?.['stitchProtocol'] || '—' }}</dd>
              <dt>Laydown protocol</dt><dd class="wrap-anywhere" style="white-space:pre-wrap;">{{ pack()?.['laydownProtocol'] || '—' }}</dd>
            </div>
          </section>

          <section class="panel flat">
            <div class="panel-head"><h2>Sizes & colours</h2><span class="ph-sub">live catalogue data</span></div>
            <table class="table">
              <thead><tr><th>SKU</th><th>Size</th><th>Colour</th><th>Price ₦</th></tr></thead>
              <tbody>
                @for (v of variants(); track v.id) {
                  <tr>
                    <td><code>{{ v.sku }}</code></td>
                    <td class="mono">{{ v.size || '—' }}</td>
                    <td>{{ v.colour || '—' }}</td>
                    <td class="mono">₦{{ (v.priceOverride ?? p.basePrice) | number: '1.0-0' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Spec editor</h2><span class="ph-sub">edits a revision</span>
              <span class="ph-end"><button class="cta small ghost" type="button" (click)="editing.set(!editing())">{{ editing() ? 'Close' : 'Edit spec' }}</button></span>
            </div>
            @if (editing()) {
              <form class="form-grid" (ngSubmit)="saveDraft()">
                <label>Silhouette <input [(ngModel)]="edit.silhouette" name="tpSil" placeholder="relaxed tee" /></label>
                <label>Target yield (units) <input type="number" min="0" [(ngModel)]="edit.targetYieldUnits" name="tpYield" /></label>
                <label>Cutting efficiency % <input type="number" min="0" max="100" [(ngModel)]="edit.cuttingEfficiencyPct" name="tpEff" /></label>
                <label>DXF / pattern file <input [(ngModel)]="edit.dxfUrl" name="tpDxf" placeholder="s3://patterns/silktee.dxf" /></label>
                <label class="wide">Graded measurements (JSON, keyed by size)
                  <textarea rows="4" [(ngModel)]="edit.measurementsJson" name="tpMeas" class="code-window" placeholder='{"S":{"chest":52,"body_length":68},"M":{"chest":54,"body_length":70}}'></textarea>
                </label>
                <label class="wide">Stitch protocol
                  <textarea rows="2" [(ngModel)]="edit.stitchProtocol" name="tpStitch" placeholder="NE3.5 12 S.P.I., poly-needle double chain…"></textarea>
                </label>
                <label class="wide">Laydown protocol
                  <textarea rows="2" [(ngModel)]="edit.laydownProtocol" name="tpLay" placeholder="4-way stretch on the cross…"></textarea>
                </label>
                <div class="wide"><button class="cta small" type="submit" [disabled]="!pack()">Save revision</button></div>
              </form>
            }
          </section>
        </div>

        <aside>
          <section class="panel flat">
            <div class="panel-head"><h2>CAD pattern & marker diagram</h2></div>
            @if (pack()?.['dxfUrl']; as url) {
              <p class="mini-note">DXF master on file</p>
              <a class="link wrap-anywhere" [href]="hrefOf(url)" target="_blank" rel="noopener">{{ url }}</a>
            } @else {
              <div style="border:1px dashed var(--hairline-2); padding:1.4rem 1rem; text-align:center;">
                <p class="mini-note">No DXF asset linked</p>
                <p class="muted small" style="margin:0.3rem 0 0;">Add the CAD / Gerber cut-pattern address in the spec editor.</p>
              </div>
            }
          </section>

          <section class="panel flat">
            <div class="panel-head"><h2>Bill of materials (BOM) cost matrix</h2><span class="ph-sub">per unit · line items live on the Catalogue page</span></div>
            @if (unitCost() !== null) {
              <table class="table">
                <tbody>
                  <tr><td>Raw materials</td><td class="mono">₦{{ perUnit('materialCost') | number: '1.0-2' }}</td></tr>
                  <tr><td>Sewing & assembly</td><td class="mono">₦{{ perUnit('sewingCost') | number: '1.0-2' }}</td></tr>
                  <tr><td>Branding & hardware</td><td class="mono">₦{{ perUnit('brandingCost') | number: '1.0-2' }}</td></tr>
                  <tr><td>Packaging</td><td class="mono">₦{{ perUnit('packagingCost') | number: '1.0-2' }}</td></tr>
                  <tr><td><strong>Total standard unit cost</strong></td><td class="mono"><strong class="naira">₦{{ unitCost() | number: '1.0-2' }}</strong></td></tr>
                </tbody>
              </table>
              <p class="mini-note">Based on the latest production batch of this product.</p>
            } @else {
              <p class="muted small">No batch costs yet — record one in Production to fill this in.</p>
            }
            <a class="link" href="/catalogue">Edit per-unit BOM on Catalogue</a>
          </section>

          <section class="panel flat">
            <div class="panel-head"><h2>Revision journal</h2></div>
            @if (revisions().length > 0) {
              <ul class="activity">
                @for (r of revisions(); track r['id']) {
                  <li>
                    <time>rev {{ r['revision'] }}</time>
                    <span class="act-action">{{ snapStatus(r) }} · {{ dt(r['createdAt']) | date: 'MMM d' }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="muted small">Snapshots appear here as revisions are saved.</p>
            }
          </section>
        </aside>
      </div>
    } @else {
      <p class="muted">Choose a product above to see its technical details.</p>
    }

    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class TechPackPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly products = signal<ProductRow[]>([]);
  readonly selected = signal<ProductRow | null>(null);
  readonly pack = signal<Record<string, unknown> | null>(null);
  readonly revisions = signal<Array<Record<string, unknown>>>([]);
  readonly editing = signal(false);
  readonly unitCost = signal<number | null>(null);
  readonly costBatchRef = signal('');
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly variants = computed(() => this.selected()?.variants ?? []);
  selectedId = '';
  variantId = '';
  edit = { silhouette: '', targetYieldUnits: null as number | null, cuttingEfficiencyPct: null as number | null, dxfUrl: '', measurementsJson: '', stitchProtocol: '', laydownProtocol: '' };
  private cost: Record<string, unknown> | null = null;
  private costQty = 0;

  ngOnInit(): void {
    this.api.products().subscribe((res) => {
      this.products.set(res.data as unknown as ProductRow[]);
      if (!this.selectedId && this.products().length) {
        this.selectedId = this.products()[0].id;
        this.select();
      }
    });
  }

  select(): void {
    const p = this.products().find((x) => x.id === this.selectedId) ?? null;
    this.selected.set(p);
    this.pack.set(null);
    this.revisions.set([]);
    this.unitCost.set(null);
    this.cost = null;
    this.costBatchRef.set('');
    this.editing.set(false);
    this.variantId = '';
    if (!p) return;
    const first = p.variants[0];
    if (first) { this.variantId = first.id; this.loadPack(); }
    const skus = new Set(p.variants.map((v) => v.sku));
    this.api.batches().subscribe((res) => {
      const mine = res.data.filter((b) => skus.has(b.variant.sku));
      for (const b of mine) {
        this.api.batchCost(b.id).subscribe({
          next: (c) => {
            if (c && this.unitCost() === null && b.quantity > 0) {
              this.cost = c;
              this.costQty = b.quantity;
              this.unitCost.set(Number(c['totalCost'] ?? 0) / b.quantity);
              this.costBatchRef.set(b.id.slice(0, 8));
            }
          },
          error: () => undefined,
        });
      }
    });
  }

  loadPack(): void {
    const vid = this.variantId;
    if (!vid) { this.pack.set(null); this.revisions.set([]); return; }
    this.pack.set(null);
    this.editing.set(false);
    this.api.techPacks().subscribe({
      next: (rows) => {
        const found = (rows ?? []).find((r) => String((r['variant'] as Record<string, unknown> | null)?.['id'] ?? r['variantId'] ?? '') === vid) ?? null;
        this.pack.set(found);
        this.syncEdit(found);
        if (found) {
          this.api.techPackRevisions(found['id'] as string).subscribe({
            next: (revs) => this.revisions.set(revs),
            error: () => this.revisions.set([]),
          });
        } else {
          this.revisions.set([]);
        }
      },
      error: () => undefined,
    });
  }

  private syncEdit(found: Record<string, unknown> | null): void {
    if (!found) {
      this.edit = { silhouette: '', targetYieldUnits: null, cuttingEfficiencyPct: null, dxfUrl: '', measurementsJson: '', stitchProtocol: '', laydownProtocol: '' };
      return;
    }
    const gm = found['gradedMeasurements'] as Record<string, unknown> | null | undefined;
    this.edit = {
      silhouette: String(found['silhouette'] ?? ''),
      targetYieldUnits: found['targetYieldUnits'] != null ? Number(found['targetYieldUnits']) : null,
      cuttingEfficiencyPct: found['cuttingEfficiencyPct'] != null ? Number(found['cuttingEfficiencyPct']) : null,
      dxfUrl: String(found['dxfUrl'] ?? ''),
      measurementsJson: gm ? JSON.stringify(gm, null, 2) : '',
      stitchProtocol: String(found['stitchProtocol'] ?? ''),
      laydownProtocol: String(found['laydownProtocol'] ?? ''),
    };
  }

  private payload(): Record<string, unknown> {
    const measured = this.edit.measurementsJson.trim();
    let gradedMeasurements: Record<string, unknown> | undefined;
    if (measured) {
      try {
        gradedMeasurements = JSON.parse(measured) as Record<string, unknown>;
      } catch {
        this.error.set('Graded measurements are not valid JSON — fix and retry.');
        return {};
      }
    }
    return {
      silhouette: this.edit.silhouette || undefined,
      targetYieldUnits: this.edit.targetYieldUnits ?? undefined,
      cuttingEfficiencyPct: this.edit.cuttingEfficiencyPct ?? undefined,
      dxfUrl: this.edit.dxfUrl || undefined,
      gradedMeasurements,
      stitchProtocol: this.edit.stitchProtocol || undefined,
      laydownProtocol: this.edit.laydownProtocol || undefined,
    };
  }

  createPack(): void {
    if (!this.variantId) { this.error.set('Pick a variant first.'); return; }
    this.api.createTechPack({ variantId: this.variantId, ...this.payload() }).subscribe({
      next: (pack) => { this.pack.set(pack); this.syncEdit(pack); this.revisions.set([]); this.ok('Tech pack created on draft revision 1.'); },
      error: (e) => this.error.set(e?.error?.message ?? 'Create failed.'),
    });
  }

  saveDraft(): void {
    const pack = this.pack();
    if (!pack) { this.error.set('Create the tech pack first.'); return; }
    const body = this.payload();
    if (!body['gradedMeasurements'] && this.edit.measurementsJson.trim()) return;
    this.api.updateTechPack(pack['id'] as string, body).subscribe({
      next: (updated) => { this.pack.set(updated); this.syncEdit(updated); this.reloadRevisions(pack['id'] as string); this.ok(`Saved — revision ${updated?.['revision'] ?? '?'} snapshotted.`); },
      error: (e) => this.error.set(e?.error?.message ?? 'Save failed.'),
    });
  }

  approvePack(): void {
    const pack = this.pack();
    if (!pack) { this.error.set('Create the tech pack first.'); return; }
    this.api.approveTechPack(pack['id'] as string).subscribe({
      next: (updated) => { this.pack.set(updated); this.ok('Approved — this pack is now the shop-floor reference.'); },
      error: (e) => this.error.set(e?.error?.message ?? 'Approval failed.'),
    });
  }

  private reloadRevisions(id: string): void {
    this.api.techPackRevisions(id).subscribe({
      next: (revs) => this.revisions.set(revs),
      error: () => undefined,
    });
  }

  sizeCols(gm: Record<string, unknown>): string[] {
    return Object.keys(gm);
  }

  measurementRows(gm: Record<string, unknown>): Array<{ pom: string; cells: string[] }> {
    const sizes = this.sizeCols(gm);
    const poms = new Set<string>();
    for (const s of sizes) {
      const mapping = gm[s] as Record<string, unknown> | undefined;
      if (mapping && typeof mapping === 'object') for (const k of Object.keys(mapping)) poms.add(k);
    }
    return [...poms].map((pom) => ({
      pom,
      cells: sizes.map((s) => {
        const mapping = gm[s] as Record<string, unknown> | undefined;
        const v = mapping?.[pom];
        return v === undefined || v === null ? '—' : String(v);
      }),
    }));
  }

  perUnit(key: string): number {
    if (!this.cost || this.costQty <= 0) return 0;
    return Number(this.cost[key] ?? 0) / this.costQty;
  }

  variantLabel(v: VariantRow): string {
    return [v.size, v.colour].filter((x): x is string => Boolean(x)).join(' / ');
  }

  nextRev(): number {
    const p = this.pack();
    return p ? (Number(p['revision']) || 1) + 1 : 1;
  }

  graded(): Record<string, unknown> | null {
    const v = this.pack()?.['gradedMeasurements'];
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
  }

  snapStatus(r: Record<string, unknown>): string {
    const s = r['snapshot'];
    return typeof s === 'object' && s !== null ? String((s as Record<string, unknown>)['status'] ?? 'snapshot') : 'snapshot';
  }

  dt(v: unknown): string | null { return v ? String(v) : null; }
  hrefOf(v: unknown): string { return v ? String(v) : '#'; }

  private ok(msg: string): void { this.message.set(msg); this.error.set(null); }
}