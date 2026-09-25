import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../api.service';

interface VariantRow { id: string; sku: string; size: string | null; colour: string | null; priceOverride: number | null; }
interface ProductRow { id: string; name: string; category: string | null; basePrice: number; variants: VariantRow[]; collection: { name: string } | null; }
interface TierRow { id: string; name: string; ruleDescription: string | null; discountPercent: number; }

/** A6 — Product catalogue & silhouette registry. Approved Stitch layout:
    registry KPIs, silhouette list, and a spec inspector with the size matrix,
    wholesale tier pricing and the dual-control (approval-gated) price change. */
@Component({
  selector: 'app-catalogue-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Products · Prices & sizes</p>
        <h1>Product catalogue</h1>
        <p class="ops-sub">Everything you sell — products, sizes, colours and prices, all in one place.</p>
      </div>
      <div class="ops-actions">
        <button class="cta small" type="button" (click)="showAdd.set(!showAdd())">{{ showAdd() ? 'Close' : '+ New product' }}</button>
      </div>
    </div>

    <div class="kpi-bar">
      <div class="kpi"><span class="kpi-label">Active products</span><span class="kpi-value">{{ products().length }}</span><span class="kpi-sub">in your catalogue</span></div>
      <div class="kpi"><span class="kpi-label">Sizes & colours</span><span class="kpi-value">{{ skuCount() }}</span><span class="kpi-sub">across all products</span></div>
      <div class="kpi"><span class="kpi-label">Stock value</span><span class="kpi-value">₦{{ catalogueValue() | number: '1.0-0' }}</span><span class="kpi-sub">units in stock × retail price</span></div>
      <div class="kpi" [class.kpi-action]="pendingPriceChanges() > 0">
        <span class="kpi-label">Pending price changes</span>
        <span class="kpi-value">{{ pendingPriceChanges() }}</span>
        <span class="kpi-sub">needs management approval — see Approvals</span>
      </div>
    </div>

    <p class="rule-strip">To change a price: request it → management approves it → then it applies.</p>

    @if (showAdd()) {
      <div class="cols">
        <section class="panel">
          <div class="panel-head"><h2>Add product</h2></div>
          <form class="form-grid" (ngSubmit)="createProduct()">
            <label class="wide">Name <input [(ngModel)]="np.name" name="pname" required /></label>
            <label>Category <input [(ngModel)]="np.category" name="pcat" placeholder="tees" /></label>
            <label>Base price ₦ <input type="number" min="0" [(ngModel)]="np.basePrice" name="pprice" required /></label>
            <label>Collection
              <select [(ngModel)]="np.collectionId" name="pcoll">
                <option value="">—</option>
                @for (c of collectionRows(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
              </select>
            </label>
            <label class="wide">Description <textarea [(ngModel)]="np.description" name="pdesc" rows="2"></textarea></label>
            <div class="wide"><button class="cta small" type="submit">Create product</button></div>
          </form>
          <div class="actions">
            <input [(ngModel)]="newCollection" name="ncoll" placeholder="New collection name" />
            <button class="cta small ghost" (click)="createCollection()">Add collection</button>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Add size / colour</h2></div>
          <form class="form-grid" (ngSubmit)="createVariant()">
            <label class="wide">Product
              <select [(ngModel)]="nv.productId" name="vprod" required>
                @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
              </select>
            </label>
            <label>SKU <input [(ngModel)]="nv.sku" name="vsku" required placeholder="TEE-BLK-M" /></label>
            <label>Size <input [(ngModel)]="nv.size" name="vsize" placeholder="M" /></label>
            <label>Colour <input [(ngModel)]="nv.colour" name="vcol" placeholder="black" /></label>
            <label>Custom price ₦ <input type="number" min="0" [(ngModel)]="nv.priceOverride" name="vpo" /></label>
            <div class="wide"><button class="cta small" type="submit">Add size / colour</button></div>
          </form>
        </section>
      </div>
    }

    <div class="ops-toolbar">
      <span class="search"><input placeholder="Search by product, size or category…" [(ngModel)]="query" name="q" aria-label="Search catalogue" /></span>
      <div class="seg" role="group" aria-label="Category">
        <button type="button" [class.on]="catFilter() === ''" (click)="catFilter.set('')">All <span class="seg-n">{{ products().length }}</span></button>
        @for (c of categories(); track c.name) {
          <button type="button" [class.on]="catFilter() === c.name" (click)="catFilter.set(c.name)">{{ c.name }} <span class="seg-n">{{ c.count }}</span></button>
        }
      </div>
    </div>

    <div class="side-split">
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Product & item codes</th><th>Category</th><th>Colours & sizes</th><th>Stock</th><th>Retail ₦</th></tr></thead>
          <tbody>
            @for (p of visible(); track p.id) {
              <tr class="clickable" [class.sel]="selected()?.id === p.id" (click)="select(p)">
                <td><strong>{{ p.name }}</strong><br />
                  <span class="muted small mono">{{ skuRange(p) }}</span>
                  @if (p.collection) { <span class="chip gap-end">{{ p.collection.name }}</span> }
                </td>
                <td><span class="chip">{{ p.category || '—' }}</span></td>
                <td class="mono">{{ colourways(p) }} colour(s) · {{ p.variants.length }} size option(s)</td>
                <td class="mono">{{ stockOf(p) | number }}</td>
                <td class="mono">₦{{ p.basePrice | number: '1.0-0' }}</td>
              </tr>
            }
            @if (visible().length === 0) { <tr><td colspan="5" class="muted small">No products match.</td></tr> }
          </tbody>
        </table>
      </div>

      <aside class="inspector">
        @if (selected(); as p) {
          <div class="insp-head">
            <h2>{{ p.name }}</h2>
            <span class="chip acid">{{ p.category || 'uncategorised' }}</span>
          </div>

          <div class="panel-head"><h2>Prices & margins</h2></div>
          <dl class="kv">
            <dt>Retail price</dt><dd class="naira">₦{{ p.basePrice | number: '1.0-0' }}</dd>
            @for (t of tiers(); track t.id) {
              <dt>{{ t.name }}</dt>
              <dd>₦{{ tierPrice(p, t) | number: '1.0-0' }} <span class="muted">(−{{ t.discountPercent }}%)</span></dd>
            }
            <dt>Stock on hand</dt><dd>{{ stockOf(p) | number }} unit(s) · est. ₦{{ stockValue(p) | number: '1.0-0' }}</dd>
          </dl>

          <div class="panel-head"><h2>Change retail price</h2><span class="ph-sub">needs management approval</span></div>
          <div class="actions">
            <input type="number" placeholder="New ₦" [(ngModel)]="newPrices[p.id]" name="npx" class="num-input-sm" />
            @if (!approvals[p.id]) {
              <button class="cta small ghost" (click)="requestPriceApproval(p)">Request approval</button>
            } @else {
              <button class="cta small" (click)="applyPrice(p)">Apply (req {{ approvals[p.id].slice(0, 8) }})</button>
            }
          </div>

          <div class="gap-sep"></div>
          <div class="panel-head"><h2>Sizes & availability</h2><span class="ph-sub">up to date</span></div>
          @if (variantRows().length > 0) {
            <table class="table">
              <thead><tr><th>SKU</th><th>Size</th><th>Colour</th><th>Price</th><th>Status</th></tr></thead>
              <tbody>
                @for (v of variantRows(); track v['id']) {
                  <tr>
                    <td><code>{{ v['sku'] }}</code></td>
                    <td class="mono">{{ v['size'] || '—' }}</td>
                    <td>{{ v['colour'] || '—' }}</td>
                    <td class="mono">₦{{ variantPrice(v, p.basePrice) | number: '1.0-0' }}</td>
                    <td>
                      <span class="chip" [class.ok]="v['availabilityStatus'] === 'in_stock'" [class.warn]="v['availabilityStatus'] !== 'in_stock'">{{ v['availabilityStatus'] }}</span>
                      <button class="cta small ghost" type="button" (click)="openSpec(v)">spec & BOM</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="muted small">Loading variants…</p>
          }

          @if (activeSpec(); as v) {
            <div class="gap-sep"></div>
            <div class="panel-head"><h2>Tech spec — {{ v['sku'] }}</h2><span class="ph-sub">fit note & pattern geometry</span>
              <span class="ph-end"><button class="cta small ghost" type="button" (click)="exportSpecSheet(v)">Export spec-sheet</button></span>
            </div>
            <form class="form-grid" (ngSubmit)="saveSpec(v, p)">
              <label class="wide">Fit note (anatomic)
                <textarea rows="2" [(ngModel)]="spec.fitNotes" name="sfit" placeholder="Regular fit, half-inch ease at chest; drop shoulder 3 cm…"></textarea>
              </label>
              <label>Pattern geometry <input [(ngModel)]="spec.patternNotes" name="spat" placeholder="Block size small; 1.2 cm seam allowance" /></label>
              <label>DXF / pattern file <input [(ngModel)]="spec.dxfUrl" name="sdxf" placeholder="s3://patterns/silktee-small.dxf" /></label>
              <label>Cut folder <input [(ngModel)]="spec.cutFolder" name="scut" placeholder="cut/fw25/tee/small" /></label>
              <div class="wide"><button class="cta small" type="submit">Save spec</button></div>
            </form>

            <div class="panel-head" style="margin-top:0.9rem;"><h3 style="font-size:0.9rem;">Bill of materials</h3><span class="ph-sub">per silhouette</span></div>
            @if (specBom().length > 0) {
              <table class="table">
                <thead><tr><th>Material</th><th>Qty / unit</th><th>Unit</th></tr></thead>
                <tbody>
                  @for (row of specBom(); track $index) {
                    <tr>
                      <td class="small">{{ row['materialName'] ?? rawName(row['materialId']) }}</td>
                      <td class="mono">{{ row['quantityPerUnit'] ?? row['quantity'] }}</td>
                      <td class="mono">{{ row['unitOfMeasure'] ?? '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="muted small">No raw materials listed for this silhouette yet.</p>
            }
            <div class="actions">
              <select [(ngModel)]="nbom.materialId" name="bmtl">
                <option value="">+ Add raw material…</option>
                @for (m of rawMaterials(); track m.id) { <option [value]="m.id">{{ m.name }}{{ m.unit ? ' (' + m.unit + ')' : '' }}</option> }
              </select>
              <input type="number" min="0" step="0.01" style="width:6rem;" [(ngModel)]="nbom.quantity" name="bqty" placeholder="qty" />
              <button class="cta small ghost" [disabled]="!nbom.materialId" (click)="addBomItem()">Add</button>
              @if (specBom().length > 0) { <button class="cta small" (click)="saveBom(v)">Save BOM</button> }
            </div>

            @if (specSheet(); as json) {
              <div class="gap-sep"></div>
              <details><summary>Spec-sheet document</summary>
              <pre class="code-window">{{ json }}</pre></details>
            }
          }
          <a class="link" href="/tech-pack">Open tech pack editor</a>
        } @else {
          <p class="muted small">Select a product to see its prices, wholesale discounts and sizes.</p>
        }
      </aside>
    </div>

    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class CatalogueAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly products = signal<ProductRow[]>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly collectionRows = signal<Array<{ id: string; name: string }>>([]);
  readonly tiers = signal<TierRow[]>([]);
  readonly showAdd = signal(false);
  readonly catFilter = signal('');
  /** Inspector selection + its variant rows, read fresh from the API. */
  readonly selected = signal<ProductRow | null>(null);
  readonly variantRows = signal<Array<Record<string, unknown>>>([]);
  readonly pendingPriceChanges = signal(0);
  /** variantId → current stock (inventory summary), for valuation. */
  private readonly stockMap = signal<Map<string, number>>(new Map());
  readonly activeSpec = signal<Record<string, unknown> | null>(null);
  readonly specBom = signal<Array<Record<string, unknown>>>([]);
  readonly rawMaterials = signal<Array<{ id: string; name: string; unit: string | null }>>([]);
  readonly specSheet = signal<string | null>(null);
  spec = { fitNotes: '', patternNotes: '', dxfUrl: '', cutFolder: '' };
  nbom = { materialId: '', quantity: 1 };
  newPrices: Record<string, number> = {};
  approvals: Record<string, string> = {};
  newCollection = '';
  query = '';
  np = { name: '', category: '', basePrice: 0, description: '', collectionId: '' };
  nv = { productId: '', sku: '', size: '', colour: '', priceOverride: null as number | null };

  ngOnInit(): void {
    this.query = this.route.snapshot.queryParamMap.get('q') ?? '';
    this.load();
    this.api.tiers().subscribe({ next: (t) => this.tiers.set(t as unknown as TierRow[]), error: () => undefined });
    this.api.inventorySummary().subscribe({
      next: (rows) => {
        const m = new Map<string, number>();
        for (const r of rows) if (r.itemType === 'variant') m.set(r.itemId, r.currentQuantity);
        this.stockMap.set(m);
      },
      error: () => undefined,
    });
    this.api.pendingApprovals().subscribe({
      next: (a) => this.pendingPriceChanges.set(a.filter((x) => x.actionType === 'price_change').length),
      error: () => undefined,
    });
  }

  private load(): void {
    this.api.products().subscribe((res) => this.products.set(res.data as unknown as ProductRow[]));
    this.api.collections().subscribe((res) => this.collectionRows.set(res));
  }

  readonly skuCount = computed(() => this.products().reduce((s, p) => s + p.variants.length, 0));
  readonly catalogueValue = computed(() => {
    const stock = this.stockMap();
    return this.products().reduce((sum, p) =>
      sum + p.variants.reduce((s, v) => s + (stock.get(v.id) ?? 0) * (v.priceOverride ?? p.basePrice), 0), 0);
  });
  readonly categories = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.products()) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  });

  visible(): ProductRow[] {
    const q = this.query.trim().toLowerCase();
    const c = this.catFilter();
    return this.products().filter((p) => {
      if (c && p.category !== c) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q)
        || p.variants.some((v) => v.sku.toLowerCase().includes(q));
    });
  }

  skuRange(p: ProductRow): string {
    const skus = p.variants.map((v) => v.sku);
    return skus.length ? (skus.length > 2 ? `${skus[0]} … ${skus[skus.length - 1]}` : skus.join(' · ')) : 'no variants yet';
  }
  colourways(p: ProductRow): number {
    return new Set(p.variants.map((v) => v.colour ?? '—')).size;
  }
  stockOf(p: ProductRow): number {
    const stock = this.stockMap();
    return p.variants.reduce((s, v) => s + (stock.get(v.id) ?? 0), 0);
  }
  stockValue(p: ProductRow): number {
    const stock = this.stockMap();
    return p.variants.reduce((s, v) => s + (stock.get(v.id) ?? 0) * (v.priceOverride ?? p.basePrice), 0);
  }
  tierPrice(p: ProductRow, t: TierRow): number {
    return p.basePrice * (1 - Number(t.discountPercent) / 100);
  }
  variantPrice(variant: Record<string, unknown>, basePrice: number): number {
    const override = variant['priceOverride'];
    return override === null || override === undefined ? basePrice : Number(override);
  }

  select(p: ProductRow): void {
    if (this.selected()?.id === p.id) { this.selected.set(null); this.variantRows.set([]); this.activeSpec.set(null); return; }
    this.selected.set(p);
    this.variantRows.set([]);
    this.api.productVariants(p.id).subscribe({
      next: (rows) => this.variantRows.set(rows),
      error: () => this.error.set('Could not load variants.'),
    });
  }

  openSpec(v: Record<string, unknown>): void {
    if (this.activeSpec()?.['id'] === v['id']) { this.activeSpec.set(null); this.specSheet.set(null); return; }
    this.activeSpec.set(v);
    this.specBom.set([]);
    this.specSheet.set(null);
    this.spec = {
      fitNotes: String(v['fitNotes'] ?? ''), patternNotes: String(v['patternNotes'] ?? ''),
      dxfUrl: String(v['dxfUrl'] ?? ''), cutFolder: String(v['cutFolder'] ?? ''),
    };
    this.api.variantBom(v['id'] as string).subscribe({
      next: (rows) => this.specBom.set(rows),
      error: () => this.specBom.set([]),
    });
    if (this.rawMaterials().length === 0) {
      this.api.materials().subscribe({
        next: (m) => this.rawMaterials.set(m as unknown as Array<{ id: string; name: string; unit: string | null }>),
        error: () => undefined,
      });
    }
  }

  rawName(materialId: unknown): string {
    return this.rawMaterials().find((m) => m.id === materialId)?.name ?? String(materialId ?? '').slice(0, 8);
  }

  saveSpec(v: Record<string, unknown>, p: ProductRow): void {
    this.api.updateVariant(p.id, v['id'] as string, {
      fitNotes: this.spec.fitNotes || undefined,
      patternNotes: this.spec.patternNotes || undefined,
      dxfUrl: this.spec.dxfUrl || undefined,
      cutFolder: this.spec.cutFolder || undefined,
    }).subscribe({
      next: () => this.ok('Spec saved to the variant.'),
      error: (e) => this.fail(e, 'Spec save failed.'),
    });
  }

  addBomItem(): void {
    const m = this.rawMaterials().find((x) => x.id === this.nbom.materialId);
    if (!m) return;
    this.specBom.update((rows) => [...rows, { materialId: m.id, materialName: m.name, unitOfMeasure: m.unit, quantityPerUnit: Number(this.nbom.quantity) || 1 }]);
    this.nbom = { materialId: '', quantity: 1 };
  }

  saveBom(v: Record<string, unknown>): void {
    const items = this.specBom().map((r) => ({
      materialId: r['materialId'] as string,
      quantity: Number(r['quantityPerUnit'] ?? r['quantity'] ?? 1),
      note: r['materialName'] as string | undefined,
    }));
    this.api.replaceVariantBom(v['id'] as string, items).subscribe({
      next: () => this.ok('BOM saved for this silhouette.'),
      error: (e) => this.fail(e, 'BOM save failed.'),
    });
  }

  exportSpecSheet(v: Record<string, unknown>): void {
    this.api.variantSpecSheet(v['id'] as string).subscribe({
      next: (sheet) => this.specSheet.set(JSON.stringify(sheet, null, 2)),
      error: (e) => this.fail(e, 'Could not build the spec-sheet.'),
    });
  }

  createCollection(): void {
    if (!this.newCollection.trim()) return;
    this.api.createCollection(this.newCollection.trim()).subscribe({
      next: () => { this.newCollection = ''; this.ok('Collection created.'); },
      error: (e) => this.fail(e, 'Collection failed.'),
    });
  }
  private ok(msg: string): void { this.message.set(msg); this.error.set(null); this.load(); }
  private fail(err: { error?: { message?: string } }, fallback: string): void {
    this.error.set(err?.error?.message ?? fallback); this.message.set(null);
  }

  createProduct(): void {
    this.api.createProduct({
      name: this.np.name, category: this.np.category || undefined,
      basePrice: Number(this.np.basePrice), description: this.np.description || undefined,
      collectionId: this.np.collectionId || undefined,
    }).subscribe({ next: () => { this.showAdd.set(false); this.ok('Product created.'); }, error: (e) => this.fail(e, 'Create failed.') });
  }

  createVariant(): void {
    const { productId, ...rest } = this.nv;
    this.api.createVariant(productId, {
      sku: rest.sku, size: rest.size || undefined, colour: rest.colour || undefined,
      priceOverride: rest.priceOverride ?? undefined,
    }).subscribe({ next: () => this.ok('Variant added.'), error: (e) => this.fail(e, 'Variant failed.') });
  }

  requestPriceApproval(p: ProductRow): void {
    const newPrice = this.newPrices[p.id];
    if (!newPrice) { this.error.set('Enter the new price first.'); return; }
    this.api.createApproval('price_change', { productId: p.id, product: p.name, from: p.basePrice, to: newPrice })
      .subscribe({
        next: (res) => { this.approvals[p.id] = res.id; this.ok(`Approval requested for ${p.name} — Management must approve it in the queue before you can apply.`); },
        error: (e) => this.fail(e, 'Approval request failed.'),
      });
  }

  applyPrice(p: ProductRow): void {
    this.api.updateProduct(p.id, { basePrice: Number(this.newPrices[p.id]), approvalRequestId: this.approvals[p.id] })
      .subscribe({
        next: () => { delete this.approvals[p.id]; this.ok('Price updated.'); },
        error: (e) => this.fail(e, 'Not approved yet — check the Approvals queue.'),
      });
  }
}
