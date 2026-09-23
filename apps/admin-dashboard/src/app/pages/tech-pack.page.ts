import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface VariantRow { id: string; sku: string; size: string | null; colour: string | null; priceOverride: number | null; }
interface ProductRow { id: string; name: string; category: string | null; basePrice: number; variants: VariantRow[]; }

/** A7 — Silhouette pattern & tech pack editor. LAYOUT SHELL: the reference's
    graded measurements, CAD marker diagrams and stitch protocols have no
    backend module, so this page renders the approved layout bound to the real
    data that approximates it (catalogue variants, recorded batch costs,
    materials registry) and labels every missing capability. */
@Component({
  selector: 'app-tech-pack',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Product · Spec & BOM editor</p>
        <h1>Silhouette pattern & technical specification</h1>
        <p class="ops-sub">Anatomic cut geometry, fabric consumption parameters and garment measurement sets per silhouette.</p>
      </div>
      <div class="ops-actions">
        <select class="table-filter" [(ngModel)]="selectedId" name="prod" (ngModelChange)="select()">
          <option value="">— pick a silhouette —</option>
          @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
        </select>
        <button class="cta small" type="button" disabled title="No tech-pack revision workflow exists in the API yet">
          Submit revision for management approval
        </button>
        <!-- GAP: submitting a spec revision for approval needs a tech-pack action type;
             the approvals API only accepts purchasing / production_start / price_change /
             fund_movement / stock_disposal. -->
      </div>
    </div>

    @if (selected(); as p) {
      <p class="rule-strip">LOCKED SPECIFICATION // production-grade values live in the catalogue & batch records; edits to price go through the dual-control flow on the Catalogue page.</p>

      <div class="kpi-bar">
        <div class="kpi">
          <span class="kpi-label">Standard unit cost</span>
          @if (unitCost() !== null) {
            <span class="kpi-value">₦{{ unitCost() | number: '1.0-0' }}</span>
            <span class="kpi-sub">from batch #{{ costBatchRef() }} recorded cost</span>
          } @else {
            <span class="kpi-value">—</span>
            <span class="kpi-sub">no costed production batch for this silhouette yet</span>
          }
        </div>
        <div class="kpi"><span class="kpi-label">Retail price</span><span class="kpi-value">₦{{ p.basePrice | number: '1.0-0' }}</span><span class="kpi-sub">current catalogue base price</span></div>
        <div class="kpi"><span class="kpi-label">Size run</span><span class="kpi-value">{{ p.variants.length }}</span><span class="kpi-sub">registered variants / colourways</span></div>
        <div class="kpi">
          <span class="kpi-label">Fabric consumption</span>
          <span class="kpi-value">—</span>
          <span class="kpi-sub">metres/unit not tracked by the API</span>
          <!-- GAP: target yield & cutting-efficiency figures need a pattern/consumption model. -->
        </div>
      </div>

      <div class="ops-grid">
        <div>
          <section class="panel flat">
            <div class="panel-head"><h2>Graded garment measurement specification</h2><span class="ph-sub">points of measure</span></div>
            <table class="table">
              <thead><tr><th>POM</th><th>Point of measure</th><th>S</th><th>M</th><th>L</th><th>XL</th><th>Tol ±</th></tr></thead>
              <tbody>
                <tr><td colspan="7" class="muted small">
                  No measurement sets on file — the API has no graded-spec model yet.
                  Sizes registered for this silhouette: {{ sizeList(p) }}.
                </td></tr>
              </tbody>
            </table>
            <!-- GAP: graded measurement rows (chest width, body length, shoulder drop, …)
                 need a tech-pack measurements table the backend doesn't have. -->
          </section>

          <section class="panel flat">
            <div class="panel-head"><h2>Seam, thread & laydown protocol</h2></div>
            <p class="muted small">Stitch density, thread matching and thermal-conditioning SOPs are not digitised —
              they remain on the paper spec sheets at the factory.</p>
            <!-- GAP: stitch/thread/laydown protocol content — no backend field to bind. -->
          </section>

          <section class="panel flat">
            <div class="panel-head"><h2>Size matrix & colourways</h2><span class="ph-sub">live catalogue data</span></div>
            <table class="table">
              <thead><tr><th>SKU</th><th>Size</th><th>Colour</th><th>Price ₦</th></tr></thead>
              <tbody>
                @for (v of p.variants; track v.id) {
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
        </div>

        <aside>
          <section class="panel flat">
            <div class="panel-head"><h2>CAD pattern & marker diagram</h2></div>
            <div style="border:1px dashed var(--hairline-2); padding:1.4rem 1rem; text-align:center;">
              <p class="mini-note">No CAD / DXF assets on file</p>
              <p class="muted small" style="margin:0.3rem 0 0;">Pattern plots and marker layouts are managed outside the platform.</p>
            </div>
            <!-- GAP: DXF/Gerber cut-pattern master export — no asset pipeline for CAD files. -->
          </section>

          <section class="panel flat">
            <div class="panel-head"><h2>Bill of materials (BOM) cost matrix</h2><span class="ph-sub">per unit</span></div>
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
              <p class="mini-note">Derived from the latest costed production batch of this silhouette.</p>
            } @else {
              <p class="muted small">No costed batch yet — record a batch cost in Production to populate this matrix.</p>
            }
            <!-- GAP: line-item BOM (fabric m, zips pcs, labels pcs with unit costs) needs a
                 per-garment BOM model; only the four batch cost buckets exist. -->
          </section>

          <section class="panel flat">
            <div class="panel-head"><h2>Materials registry</h2><span class="ph-sub">available for allocation</span></div>
            <ul class="activity">
              @for (m of materials(); track m['id']) {
                <li><span class="act-action">{{ m['name'] }}</span><time>{{ m['unit'] }}</time></li>
              }
            </ul>
            <p class="mini-note">Per-garment allocations aren't tracked — usage is logged per batch on the inventory ledger.</p>
          </section>
        </aside>
      </div>
    } @else {
      <p class="muted">Pick a silhouette above to open its technical specification shell.</p>
    }
  `,
})
export class TechPackPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly products = signal<ProductRow[]>([]);
  readonly selected = signal<ProductRow | null>(null);
  readonly materials = signal<Array<Record<string, unknown>>>([]);
  readonly unitCost = signal<number | null>(null);
  readonly costBatchRef = signal('');
  private cost: Record<string, unknown> | null = null;
  private costQty = 0;
  selectedId = '';

  ngOnInit(): void {
    this.api.products().subscribe((res) => {
      this.products.set(res.data as unknown as ProductRow[]);
      if (!this.selectedId && this.products().length) {
        this.selectedId = this.products()[0].id;
        this.select();
      }
    });
    this.api.materials().subscribe((m) => this.materials.set(m));
  }

  select(): void {
    const p = this.products().find((x) => x.id === this.selectedId) ?? null;
    this.selected.set(p);
    this.unitCost.set(null);
    this.cost = null;
    this.costBatchRef.set('');
    if (!p) return;
    const skus = new Set(p.variants.map((v) => v.sku));
    this.api.batches().subscribe((res) => {
      // Latest batch of this silhouette that has a recorded cost → standard unit cost.
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

  perUnit(key: string): number {
    if (!this.cost || this.costQty <= 0) return 0;
    return Number(this.cost[key] ?? 0) / this.costQty;
  }

  sizeList(p: ProductRow): string {
    const sizes = [...new Set(p.variants.map((v) => v.size).filter(Boolean))];
    return sizes.length ? sizes.join(' / ') : 'none registered';
  }
}
