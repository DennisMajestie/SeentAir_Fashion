import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface VariantRow { id: string; sku: string; size: string | null; colour: string | null; priceOverride: number | null; }
interface ProductRow { id: string; name: string; category: string | null; basePrice: number; variants: VariantRow[]; collection: { name: string } | null; }

/** Product catalogue management — Stitch layout: products table with
    expandable variants, add-product panel, approval-gated price changes. */
@Component({
  selector: 'app-catalogue-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Product catalogue</h1>
    <p class="rule-strip">Price changes require an approved request — use "Request approval", have Management approve it in the queue, then apply.</p>

    <div class="cols">
      <section class="panel">
        <p class="section-label" style="margin-top:0">Add product</p>
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
        <p class="section-label" style="margin-top:0">Add variant</p>
        <form class="form-grid" (ngSubmit)="createVariant()">
          <label class="wide">Product
            <select [(ngModel)]="nv.productId" name="vprod" required>
              @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
            </select>
          </label>
          <label>SKU <input [(ngModel)]="nv.sku" name="vsku" required placeholder="TEE-BLK-M" /></label>
          <label>Size <input [(ngModel)]="nv.size" name="vsize" placeholder="M" /></label>
          <label>Colour <input [(ngModel)]="nv.colour" name="vcol" placeholder="black" /></label>
          <label>Price override ₦ <input type="number" min="0" [(ngModel)]="nv.priceOverride" name="vpo" /></label>
          <div class="wide"><button class="cta small" type="submit">Add variant</button></div>
        </form>
      </section>
    </div>

    <p class="section-label">Products <span class="count">[{{ products().length | number: '2.0' }}]</span></p>
    <table class="table">
      <thead><tr><th>Name</th><th>Category</th><th>Base price</th><th>Variants</th><th>Price change</th></tr></thead>
      <tbody>
        @for (p of products(); track p.id) {
          <tr>
            <td><strong>{{ p.name }}</strong></td>
            <td><span class="chip">{{ p.category || '—' }}</span></td>
            <td class="mono">₦{{ p.basePrice | number: '1.0-2' }}</td>
            <td>
              @for (v of p.variants; track v.id) { <span class="chip" style="margin:0 2px 2px 0">{{ v.sku }}</span> }
              <button class="link" type="button" (click)="toggleVariants(p.id)">
                {{ expanded() === p.id ? 'hide' : 'details' }}
              </button>
            </td>
            <td>
              <div class="actions" style="margin:0">
                <input type="number" placeholder="New ₦" [(ngModel)]="newPrices[p.id]" style="max-width:7rem" />
                @if (!approvals[p.id]) {
                  <button class="cta small ghost" (click)="requestPriceApproval(p)">Request approval</button>
                } @else {
                  <button class="cta small" (click)="applyPrice(p)">Apply (req {{ approvals[p.id].slice(0, 8) }})</button>
                }
              </div>
            </td>
          </tr>
          @if (expanded() === p.id) {
            <tr>
              <td colspan="5">
                <table class="table compact">
                  <thead><tr><th>SKU</th><th>Size</th><th>Colour</th><th>Price</th><th>Availability</th></tr></thead>
                  <tbody>
                    @for (v of variantRows(); track v['id']) {
                      <tr>
                        <td><code>{{ v['sku'] }}</code></td>
                        <td class="mono">{{ v['size'] || '—' }}</td>
                        <td>{{ v['colour'] || '—' }}</td>
                        <td class="mono">₦{{ variantPrice(v, p.basePrice) | number: '1.0-2' }}</td>
                        <td><span class="chip" [class.ok]="v['availabilityStatus'] === 'in_stock'">{{ v['availabilityStatus'] }}</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </td>
            </tr>
          }
        }
      </tbody>
    </table>
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class CatalogueAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly products = signal<ProductRow[]>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly collectionRows = signal<Array<{ id: string; name: string }>>([]);
  /** Expanded product id + its variant rows, read fresh from the API. */
  readonly expanded = signal<string | null>(null);
  readonly variantRows = signal<Array<Record<string, unknown>>>([]);
  newPrices: Record<string, number> = {};
  approvals: Record<string, string> = {};
  newCollection = '';
  np = { name: '', category: '', basePrice: 0, description: '', collectionId: '' };
  nv = { productId: '', sku: '', size: '', colour: '', priceOverride: null as number | null };

  ngOnInit(): void { this.load(); }
  private load(): void {
    this.api.products().subscribe((res) => this.products.set(res.data as unknown as ProductRow[]));
    this.api.collections().subscribe((res) => this.collectionRows.set(res));
  }

  variantPrice(variant: Record<string, unknown>, basePrice: number): number {
    const override = variant['priceOverride'];
    return override === null || override === undefined ? basePrice : Number(override);
  }

  toggleVariants(productId: string): void {
    if (this.expanded() === productId) { this.expanded.set(null); return; }
    this.api.productVariants(productId).subscribe({
      next: (rows) => { this.variantRows.set(rows); this.expanded.set(productId); },
      error: () => this.error.set('Could not load variants.'),
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
    }).subscribe({ next: () => this.ok('Product created.'), error: (e) => this.fail(e, 'Create failed.') });
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
