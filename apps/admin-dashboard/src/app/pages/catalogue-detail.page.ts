import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  SeBadgeComponent,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDatePipe,
  SeDrawerComponent,
  SeFieldComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMoneyPipe,
  SePageComponent,
  SeRowAction,
  SeSkeletonComponent,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
  formatDate,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import {
  ProductRow,
  SaleRequest,
  TierRow,
  count,
  onSale,
  readSaleRequests,
  salePriceAt,
  stockOf,
  stockValue,
  writeSaleRequests,
} from './catalogue-format';

type Variant = Record<string, unknown>;
type Material = { id: string; name: string; unit: string | null };

/**
 * One product (catalogue/:id): its sizes, prices, timed sale and specs.
 *
 * A retail price change and a timed sale are both approval-gated: this page
 * raises the request, management approves it in Approvals, and only then can
 * it be applied here. The API checks the approval against the exact terms.
 */
@Component({
  selector: 'app-catalogue-detail',
  imports: [
    FormsModule,
    RouterLink,
    SeBadgeComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeCellDirective,
    SeDatePipe,
    SeDrawerComponent,
    SeFieldComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMoneyPipe,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page [title]="product()?.name ?? 'Product'" [breadcrumbs]="crumbs()">
      @if (product()?.salePercent && product()?.salePrice !== null) {
        <se-badge sePageStatus tone="warning">On sale, {{ product()?.salePercent }}% off</se-badge>
      }
      @if (product(); as p) {
        <p sePageMeta>
          {{ p.category || 'No category' }}{{ p.collection ? ', ' + p.collection.name : '' }}
        </p>
      }
      @if (product()) {
        <ng-container sePageActions>
          <a seButton routerLink="/tech-pack">Open tech packs</a>
          @if (canWrite()) {
            <button seButton variant="primary" type="button" (click)="openAddSize()">
              Add size
            </button>
            <button seButton variant="danger" type="button" (click)="deleteProduct()">
              Delete product
            </button>
          }
        </ng-container>
      }

      @if (loading()) {
        <div class="se-detail" aria-busy="true">
          <div class="se-detail__main">
            <se-card><se-skeleton shape="table" [rows]="4" [columns]="5" /></se-card>
          </div>
          <aside class="se-detail__aside">
            <se-card><se-skeleton shape="detail" [rows]="4" /></se-card>
          </aside>
        </div>
      } @else if (error()) {
        <se-banner
          tone="danger"
          title="This product could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          {{ error() }}
        </se-banner>
      } @else if (product(); as p) {
        <div class="se-detail">
          <div class="se-detail__main">
            <se-card title="Sizes and availability" flush>
              <se-table
                caption="Sizes and availability"
                [columns]="variantColumns"
                [rows]="variants()"
                [loading]="variantsLoading()"
                [error]="variantsError()"
                (retry)="loadVariants()"
                [actions]="variantActions"
                activatable
                (rowActivate)="openSpec($event)"
                hideDensity
                emptyHeading="No sizes yet"
                emptyText="Add a size or colour so this product can be stocked and sold."
              >
                <ng-template seCell="availability" let-row>
                  <se-status kind="stock" [value]="row['availabilityStatus']" />
                </ng-template>
              </se-table>
            </se-card>
          </div>

          <aside class="se-detail__aside">
            <se-card title="Photo">
              @if (p.primaryImageUrl; as photo) {
                <img class="product-photo" [src]="photo" [alt]="p.name" />
              } @else {
                <p class="product-photo-note">
                  No photo yet. Shoppers see the storefront placeholder until one is uploaded.
                </p>
              }
              @if (photoUploading()) {
                <p class="product-photo-note">Uploading the photo…</p>
              }
              @if (photoError()) {
                <p class="product-photo-error">{{ photoError() }}</p>
              }
              @if (canWrite()) {
                <ng-container seCardFooter>
                  <input
                    type="file"
                    hidden
                    #photoInput
                    accept="image/jpeg,image/png,image/webp"
                    (change)="replacePhoto($event)"
                  />
                  <button
                    seButton
                    type="button"
                    [disabled]="photoUploading()"
                    (click)="photoInput.click()"
                  >
                    {{ p.primaryImageUrl ? 'Replace photo' : 'Upload photo' }}
                  </button>
                  @if (p.primaryImageUrl) {
                    <button seButton variant="danger" type="button" (click)="removePhoto(p)">
                      Remove
                    </button>
                  }
                </ng-container>
              }
            </se-card>

            <se-card title="Prices">
              <dl seKv>
                <div seKvItem label="Retail price" numeric>{{ p.basePrice | seMoney }}</div>
                @for (t of tiers(); track t.id) {
                  <div seKvItem [label]="t.name + ' (' + t.discountPercent + '% off)'" numeric>
                    {{ tierPrice(p, t) | seMoney }}
                  </div>
                }
                <div seKvItem label="In stock" numeric>{{ stock(p) }}</div>
                <div seKvItem label="Stock value" numeric>{{ value(p) | seMoney }}</div>
              </dl>
            </se-card>

            @if (canWrite()) {
              <se-card title="Change retail price">
                @if (priceRequest(); as req) {
                  <dl seKv>
                    <div seKvItem label="Requested price" numeric>{{ req.to | seMoney }}</div>
                  </dl>
                  <p>Management approves the request in Approvals. Then apply it here.</p>
                } @else {
                  <form class="se-form" (ngSubmit)="requestPriceApproval(p)">
                    <se-field
                      label="New retail price"
                      hint="Needs management approval before it applies."
                      [error]="priceError()"
                    >
                      <input seInput type="number" min="0" name="npx" [(ngModel)]="newPrice" />
                    </se-field>
                  </form>
                }
                <ng-container seCardFooter>
                  @if (priceRequest()) {
                    <button seButton variant="primary" type="button" (click)="applyPrice(p)">
                      Apply price
                    </button>
                  } @else {
                    <button seButton type="button" (click)="requestPriceApproval(p)">
                      Request approval
                    </button>
                  }
                </ng-container>
              </se-card>
            }

            <se-card title="Timed sale">
              @if (isOnSale(p)) {
                <dl seKv>
                  <div seKvItem label="Sale price" numeric>{{ p.salePrice | seMoney }}</div>
                  <div seKvItem label="Discount" numeric>{{ p.salePercent }}%</div>
                  <div seKvItem label="Ends">{{ p.saleEndsAt | seDate: 'datetime' }}</div>
                </dl>
              } @else if (saleRequest(); as req) {
                <dl seKv>
                  <div seKvItem label="Requested discount" numeric>{{ req.percent }}%</div>
                  <div seKvItem label="Sale price" numeric>
                    {{ salePrice(p, req.percent) | seMoney }}
                  </div>
                  <div seKvItem label="Ends">{{ req.endsAt | seDate: 'datetime' }}</div>
                </dl>
                <p>Management approves the request in Approvals. Then start the sale here.</p>
              } @else if (canWrite()) {
                <form class="se-form" (ngSubmit)="requestSaleApproval(p)">
                  <se-field
                    label="Discount"
                    hint="Between 1 and 90 percent"
                    [error]="salePercentError()"
                  >
                    <input
                      seInput
                      type="number"
                      min="1"
                      max="90"
                      name="salepct"
                      [(ngModel)]="salePercentDraft"
                    />
                  </se-field>
                  <se-field label="Sale ends" [error]="saleEndError()">
                    <input
                      seInput
                      type="datetime-local"
                      name="saleend"
                      [(ngModel)]="saleEndDraft"
                    />
                  </se-field>
                  @if (salePercentDraft; as pct) {
                    <p>
                      Shoppers would pay {{ salePrice(p, pct) | seMoney: 2 }} instead of
                      {{ p.basePrice | seMoney }}. Wholesale tier prices are not affected.
                    </p>
                  }
                </form>
              } @else {
                <p>This product is not on sale.</p>
              }
              @if (canWrite()) {
                <ng-container seCardFooter>
                  @if (isOnSale(p)) {
                    <button seButton variant="danger" type="button" (click)="endSale(p)">
                      End sale
                    </button>
                  } @else if (saleRequest()) {
                    <button seButton type="button" (click)="discardSaleRequest(p)">
                      Discard request
                    </button>
                    <button seButton variant="primary" type="button" (click)="applySale(p)">
                      Start sale
                    </button>
                  } @else {
                    <button seButton type="button" (click)="requestSaleApproval(p)">
                      Request approval
                    </button>
                  }
                </ng-container>
              }
            </se-card>
          </aside>
        </div>

        <se-drawer title="Add size" [(open)]="addingSize">
          <form class="se-form" (ngSubmit)="createVariant(p)">
            <se-field label="SKU" hint="For example TEE-BLK-M" [error]="skuError()">
              <input seInput name="vsku" [(ngModel)]="nv.sku" />
            </se-field>
            <div class="se-form__row">
              <se-field label="Size" optional>
                <input seInput name="vsize" [(ngModel)]="nv.size" />
              </se-field>
              <se-field label="Colour" optional>
                <input seInput name="vcol" [(ngModel)]="nv.colour" />
              </se-field>
            </div>
            <se-field label="Own price" hint="Leave empty to use the retail price." optional>
              <input seInput type="number" min="0" name="vpo" [(ngModel)]="nv.priceOverride" />
            </se-field>
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="addingSize.set(false)">Cancel</button>
            <button seButton variant="primary" type="button" (click)="createVariant(p)">
              Add size
            </button>
          </ng-container>
        </se-drawer>

        <se-drawer [title]="'Spec for ' + (activeSpec()?.['sku'] ?? '')" [(open)]="specOpen">
          <form class="se-form" (ngSubmit)="saveSpec(p)">
            <se-field label="Fit note" hint="How the garment should sit on the body." optional>
              <textarea
                seInput
                rows="3"
                name="sfit"
                [readOnly]="!canWrite()"
                [(ngModel)]="spec.fitNotes"
              ></textarea>
            </se-field>
            <se-field label="Pattern notes" hint="Block size and seam allowance." optional>
              <input seInput name="spat" [readOnly]="!canWrite()" [(ngModel)]="spec.patternNotes" />
            </se-field>
            <se-field label="Pattern file" hint="Where the DXF file is stored." optional>
              <input seInput name="sdxf" [readOnly]="!canWrite()" [(ngModel)]="spec.dxfUrl" />
            </se-field>
            <se-field label="Cut folder" optional>
              <input seInput name="scut" [readOnly]="!canWrite()" [(ngModel)]="spec.cutFolder" />
            </se-field>
            <div>
              <button seButton size="sm" type="button" (click)="exportSpecSheet()">
                Export spec sheet
              </button>
            </div>
            @if (specSheet(); as json) {
              <details open>
                <summary>Spec sheet document</summary>
                <pre class="spec-sheet">{{ json }}</pre>
              </details>
            }
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="specOpen.set(false)">
              {{ canWrite() ? 'Cancel' : 'Close' }}
            </button>
            @if (canWrite()) {
              <button seButton variant="primary" type="button" (click)="saveSpec(p)">
                Save spec
              </button>
            }
          </ng-container>
        </se-drawer>

        <se-drawer [title]="'Materials for ' + (activeBom()?.['sku'] ?? '')" [(open)]="bomOpen">
          <se-table
            caption="Bill of materials"
            [columns]="bomColumns"
            [rows]="specBom()"
            [rowId]="bomRowId"
            [loading]="bomLoading()"
            [error]="bomError()"
            (retry)="loadBom()"
            hideDensity
            emptyHeading="No materials listed yet"
            emptyText="List what one unit of this size uses."
          />
          @if (canWrite()) {
            <form class="se-form" (ngSubmit)="addBomItem()">
              <div class="se-form__row">
                <se-field label="Material" [error]="bomItemError()">
                  <select seInput name="bmtl" [(ngModel)]="nbom.materialId">
                    <option value="">Choose a material</option>
                    @for (m of rawMaterials(); track m.id) {
                      <option [value]="m.id">
                        {{ m.name }}{{ m.unit ? ' (' + m.unit + ')' : '' }}
                      </option>
                    }
                  </select>
                </se-field>
                <se-field label="Quantity per unit">
                  <input
                    seInput
                    type="number"
                    min="0"
                    step="0.01"
                    name="bqty"
                    [(ngModel)]="nbom.quantity"
                  />
                </se-field>
              </div>
              <div><button seButton size="sm" type="submit">Add material</button></div>
            </form>
          }
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="bomOpen.set(false)">
              {{ canWrite() ? 'Cancel' : 'Close' }}
            </button>
            @if (canWrite()) {
              <button seButton variant="primary" type="button" (click)="saveBom()">
                Save materials
              </button>
            }
          </ng-container>
        </se-drawer>
      }
    </se-page>
  `,
  // The exported spec sheet is a JSON document: it scrolls inside the drawer.
  styles: [
    `
      .spec-sheet {
        overflow: auto;
        padding: var(--se-space-3);
        border-radius: var(--se-radius-md);
        background: var(--se-color-surface-sunken);
        font: var(--se-type-caption);
      }
      .product-photo {
        display: block;
        width: 100%;
        max-width: 220px;
        aspect-ratio: 4 / 5;
        object-fit: cover;
        border-radius: var(--se-radius-md);
        border: var(--se-border-width) solid var(--se-color-border);
      }
      .product-photo-note {
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
      .product-photo-error {
        color: var(--se-color-danger-text);
        font: var(--se-type-caption);
      }
    `,
  ],
})
export class CatalogueDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);
  private readonly access = inject(AccessService);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  /** Every write on a product (price, sale, sizes, spec, materials) needs full access. */
  readonly canWrite = computed(() => this.access.can('catalogue', 'full'));

  readonly product = signal<ProductRow | null>(null);
  /** True only until the first answer arrives; a refresh keeps the page on screen. */
  readonly loading = signal(true);
  readonly error = signal('');
  readonly crumbs = computed(() => [
    { label: 'Catalogue', link: '/catalogue' },
    { label: this.product()?.name ?? 'Product' },
  ]);

  readonly tiers = signal<TierRow[]>([]);
  private readonly stockMap = signal<Map<string, number>>(new Map());

  // ---- sizes ----
  readonly variants = signal<Variant[]>([]);
  readonly variantsLoading = signal(true);
  readonly variantsError = signal('');
  readonly variantColumns: SeColumn<Variant>[] = [
    { key: 'sku', header: 'SKU', value: (v) => String(v['sku'] ?? '') },
    { key: 'size', header: 'Size', value: (v) => String(v['size'] || '–') },
    { key: 'colour', header: 'Colour', value: (v) => String(v['colour'] || '–') },
    {
      key: 'price',
      header: 'Price',
      numeric: true,
      value: (v) => this.variantPrice(v),
      format: (v) => this.currency.format(v as number),
    },
    { key: 'availability', header: 'Availability', value: (v) => String(v['availabilityStatus']) },
  ];
  readonly variantActions: SeRowAction<Variant>[] = [
    { label: 'Materials', run: (v) => this.openBom(v) },
  ];

  // ---- price change (approval-gated) ----
  newPrice: number | null = null;
  readonly priceError = signal('');
  /** The approval raised from this page, with the price it was raised for. */
  readonly priceRequest = signal<{ id: string; to: number } | null>(null);

  // ---- timed sale (approval-gated) ----
  salePercentDraft: number | null = null;
  saleEndDraft = '';
  readonly salePercentError = signal('');
  readonly saleEndError = signal('');
  private readonly saleRequests = signal<Record<string, SaleRequest>>(readSaleRequests());
  readonly saleRequest = computed(() => this.saleRequests()[this.id] ?? null);

  // ---- add size ----
  readonly addingSize = signal(false);
  readonly skuError = signal('');
  nv = { sku: '', size: '', colour: '', priceOverride: null as number | null };

  // ---- spec and bill of materials, per size ----
  readonly specOpen = signal(false);
  readonly activeSpec = signal<Variant | null>(null);
  readonly specSheet = signal<string | null>(null);
  spec = { fitNotes: '', patternNotes: '', dxfUrl: '', cutFolder: '' };
  readonly bomOpen = signal(false);
  readonly activeBom = signal<Variant | null>(null);
  readonly specBom = signal<Variant[]>([]);
  readonly bomLoading = signal(false);
  readonly bomError = signal('');
  readonly bomItemError = signal('');
  readonly rawMaterials = signal<Material[]>([]);
  nbom = { materialId: '', quantity: 1 };
  readonly bomColumns: SeColumn<Variant>[] = [
    {
      key: 'material',
      header: 'Material',
      value: (r) => String(r['materialName'] ?? this.rawName(r['materialId'])),
    },
    {
      key: 'quantity',
      header: 'Quantity per unit',
      numeric: true,
      value: (r) => Number(r['quantityPerUnit'] ?? r['quantity']),
    },
    { key: 'unit', header: 'Unit', value: (r) => String(r['unitOfMeasure'] ?? '–') },
  ];
  readonly bomRowId = (r: Variant): string => String(r['materialId']);

  ngOnInit(): void {
    this.load();
    this.loadVariants();
    this.api.tiers().subscribe({
      next: (t) => this.tiers.set(t as unknown as TierRow[]),
      error: () => undefined,
    });
    this.api.inventorySummary().subscribe({
      next: (rows) => {
        const m = new Map<string, number>();
        for (const r of rows) if (r.itemType === 'variant') m.set(r.itemId, r.currentQuantity);
        this.stockMap.set(m);
      },
      error: () => undefined,
    });
  }

  load(): void {
    this.api.products().subscribe({
      next: (res) => {
        const found = (res.data as unknown as ProductRow[]).find((p) => p.id === this.id) ?? null;
        this.product.set(found);
        this.loading.set(false);
        this.error.set(
          found ? '' : 'This product is not in the catalogue. It may have been removed.',
        );
      },
      error: (err) => {
        this.loading.set(false);
        if (!this.product()) {
          this.error.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
  }

  loadVariants(): void {
    this.api.productVariants(this.id).subscribe({
      next: (rows) => {
        this.variants.set(rows);
        this.variantsLoading.set(false);
        this.variantsError.set('');
      },
      error: (err) => {
        this.variantsLoading.set(false);
        if (this.variants().length === 0) {
          this.variantsError.set(err?.error?.message ?? 'The server did not respond.');
        }
      },
    });
  }

  // ---- figures ----
  isOnSale(p: ProductRow): boolean {
    return onSale(p);
  }
  stock(p: ProductRow): string {
    return count(stockOf(p, this.stockMap()), 'unit');
  }
  value(p: ProductRow): number {
    return stockValue(p, this.stockMap());
  }
  tierPrice(p: ProductRow, t: TierRow): number {
    return p.basePrice * (1 - Number(t.discountPercent) / 100);
  }
  salePrice(p: ProductRow, percent: number): number {
    return salePriceAt(p.basePrice, percent);
  }
  private variantPrice(v: Variant): number {
    const override = v['priceOverride'];
    return override === null || override === undefined
      ? (this.product()?.basePrice ?? 0)
      : Number(override);
  }

  // ---- photo: upload the bytes first, then write the returned URL onto the
  //      product. Remove clears the reference; the file on the server is kept. ----
  readonly photoUploading = signal(false);
  readonly photoError = signal('');

  replacePhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Cleared so choosing the same file twice still fires a change event.
    input.value = '';
    const p = this.product();
    this.photoError.set('');
    if (!file || !p) return;
    // Mirror of the API's own rules (JPG/PNG/WebP, 5MB) for instant feedback.
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.photoError.set('Only JPG, PNG and WebP images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.photoError.set('The photo must be 5MB or smaller.');
      return;
    }
    this.photoUploading.set(true);
    this.api.uploadProductImage(file).subscribe({
      next: (res) => this.savePhoto(p, res.url),
      error: (err) => {
        this.photoUploading.set(false);
        this.photoError.set(err?.error?.message ?? 'The photo could not be uploaded. Try again.');
      },
    });
  }

  private savePhoto(p: ProductRow, url: string): void {
    this.api.updateProduct(p.id, { primaryImageUrl: url }).subscribe({
      next: () => {
        this.photoUploading.set(false);
        this.toast.show(`Photo updated for ${p.name}`);
        this.load();
      },
      error: (err) => {
        this.photoUploading.set(false);
        this.photoError.set(err?.error?.message ?? 'The photo could not be saved. Try again.');
      },
    });
  }

  async removePhoto(p: ProductRow): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Remove the photo from ${p.name}?`,
      consequence:
        'Shoppers see the storefront placeholder until a new photo is uploaded. This cannot be undone from here.',
      confirmLabel: 'Remove photo',
      danger: true,
    });
    if (!ok) return;
    this.photoError.set('');
    this.api.updateProduct(p.id, { primaryImageUrl: null }).subscribe({
      next: () => {
        this.toast.show(`Photo removed from ${p.name}`);
        this.load();
      },
      error: (err) =>
        this.photoError.set(err?.error?.message ?? 'The photo could not be removed. Try again.'),
    });
  }

  /** Delete the entire product (and its variants). Requires confirmation. */
  async deleteProduct(): Promise<void> {
    const p = this.product();
    if (!p) return;
    const ok = await this.confirm.ask({
      title: `Delete "${p.name}"?`,
      consequence:
        'This removes the product, all its sizes/colours, and cannot be undone. ' +
        'Fails if the product has orders, reviews, or inventory movements.',
      confirmLabel: 'Delete product',
      danger: true,
    });
    if (!ok) return;

    this.api.deleteProduct(p.id).subscribe({
      next: () => {
        this.toast.show(`Deleted ${p.name}`);
        window.history.back();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'The product could not be deleted.';
        this.toast.show(msg);
      },
    });
  }

  // ---- price change: request approval, then apply once management has approved ----
  requestPriceApproval(p: ProductRow): void {
    const to = Number(this.newPrice);
    if (!this.newPrice || to <= 0) {
      this.priceError.set('Enter the new price, more than 0.');
      return;
    }
    this.priceError.set('');
    this.api
      .createApproval('price_change', { productId: p.id, product: p.name, from: p.basePrice, to })
      .subscribe({
        next: (res) => {
          this.priceRequest.set({ id: res.id, to });
          this.toast.show(`Price change for ${p.name} sent for approval`);
        },
        error: (err) =>
          this.priceError.set(err?.error?.message ?? 'The request could not be sent. Try again.'),
      });
  }

  async applyPrice(p: ProductRow): Promise<void> {
    const req = this.priceRequest();
    if (!req) return;
    const ok = await this.confirm.ask({
      title: `Apply the new price to ${p.name}?`,
      consequence: `The retail price changes from ${this.currency.format(p.basePrice)} to ${this.currency.format(req.to)} for every customer straight away. It only goes through if management has approved the request, and it is recorded in the audit log. Changing it back needs a new approval.`,
      confirmLabel: 'Apply price',
    });
    if (!ok) return;
    this.api.updateProduct(p.id, { basePrice: req.to, approvalRequestId: req.id }).subscribe({
      next: () => {
        this.priceRequest.set(null);
        this.newPrice = null;
        this.toast.show(`${p.name} now sells at ${this.currency.format(req.to)}`);
        this.load();
      },
      error: (err) =>
        this.toast.show(err?.error?.message ?? 'Not approved yet. Check the Approvals queue.', {
          tone: 'danger',
          action: { label: 'Try again', run: () => void this.applyPrice(p) },
        }),
    });
  }

  // ---- timed sale: request approval, then start it once management has approved ----
  requestSaleApproval(p: ProductRow): void {
    const percent = Number(this.salePercentDraft);
    const endLocal = this.saleEndDraft;
    const percentOk = !!percent && percent >= 1 && percent <= 90;
    const endOk = !!endLocal && new Date(endLocal).getTime() > Date.now();
    this.salePercentError.set(percentOk ? '' : 'Enter a discount between 1 and 90 percent.');
    this.saleEndError.set(endOk ? '' : 'Choose a date and time in the future.');
    if (!percentOk || !endOk) return;
    const endsAt = new Date(endLocal).toISOString();
    this.api
      .createApproval('price_change', {
        kind: 'sale',
        productId: p.id,
        product: p.name,
        from: p.basePrice,
        to: salePriceAt(p.basePrice, percent),
        salePercent: percent,
        saleEndsAt: endsAt,
      })
      .subscribe({
        next: (res) => {
          this.setSaleRequest(p.id, { id: res.id, percent, endsAt });
          this.toast.show(`Sale on ${p.name} sent for approval`);
        },
        error: (err) =>
          this.salePercentError.set(
            err?.error?.message ?? 'The request could not be sent. Try again.',
          ),
      });
  }

  async applySale(p: ProductRow): Promise<void> {
    const req = this.saleRequest();
    if (!req) return;
    const ok = await this.confirm.ask({
      title: `Start the sale on ${p.name}?`,
      consequence: `Shoppers pay ${this.currency.format(salePriceAt(p.basePrice, req.percent), 2)} instead of ${this.currency.format(p.basePrice)} (${req.percent}% off) until ${formatDate(req.endsAt, 'datetime')}. Wholesale tier prices are not affected. It only starts if management has approved the request, and it is recorded in the audit log. You can end the sale early.`,
      confirmLabel: 'Start sale',
    });
    if (!ok) return;
    this.api
      .setProductSale(p.id, { percent: req.percent, endsAt: req.endsAt, approvalRequestId: req.id })
      .subscribe({
        next: () => {
          this.setSaleRequest(p.id, null);
          this.toast.show(`Sale started on ${p.name}`);
          this.load();
        },
        error: (err) =>
          this.toast.show(err?.error?.message ?? 'Not approved yet. Check the Approvals queue.', {
            tone: 'danger',
            action: { label: 'Try again', run: () => void this.applySale(p) },
          }),
      });
  }

  async endSale(p: ProductRow): Promise<void> {
    const ok = await this.confirm.ask({
      title: `End the sale on ${p.name}?`,
      consequence: `The price goes back from ${this.currency.format(p.salePrice ?? 0, 2)} to ${this.currency.format(p.basePrice)} for every customer straight away. Starting it again needs a new approval.`,
      confirmLabel: 'End sale',
      danger: true,
    });
    if (!ok) return;
    this.api.endProductSale(p.id).subscribe({
      next: () => {
        this.toast.show(`Sale ended. ${p.name} is back at its normal price`);
        this.load();
      },
      error: (err) =>
        this.toast.show(err?.error?.message ?? 'The sale could not be ended', {
          tone: 'danger',
          action: { label: 'Try again', run: () => void this.endSale(p) },
        }),
    });
  }

  async discardSaleRequest(p: ProductRow): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Discard the sale request for ${p.name}?`,
      consequence:
        'This page forgets the request, so the sale can no longer be started from it. The request itself stays in the Approvals queue. This cannot be undone.',
      confirmLabel: 'Discard request',
      danger: true,
    });
    if (ok) this.setSaleRequest(p.id, null);
  }

  private setSaleRequest(productId: string, request: SaleRequest | null): void {
    // Re-read first: another tab may have raised a request for another product.
    const all = { ...readSaleRequests() };
    if (request) all[productId] = request;
    else delete all[productId];
    writeSaleRequests(all);
    this.saleRequests.set(all);
  }

  // ---- add size ----
  openAddSize(): void {
    this.skuError.set('');
    this.addingSize.set(true);
  }

  createVariant(p: ProductRow): void {
    const sku = this.nv.sku.trim();
    this.skuError.set(sku ? '' : 'Enter the SKU.');
    if (!sku) return;
    this.api
      .createVariant(p.id, {
        sku,
        size: this.nv.size || undefined,
        colour: this.nv.colour || undefined,
        priceOverride: this.nv.priceOverride ?? undefined,
      })
      .subscribe({
        next: () => {
          this.addingSize.set(false);
          this.nv = { sku: '', size: '', colour: '', priceOverride: null };
          this.toast.show(`${sku} added to ${p.name}`);
          this.load();
          this.loadVariants();
        },
        error: (err) =>
          this.skuError.set(err?.error?.message ?? 'The size could not be added. Try again.'),
      });
  }

  // ---- spec ----
  openSpec(v: Variant): void {
    this.activeSpec.set(v);
    this.specSheet.set(null);
    this.spec = {
      fitNotes: String(v['fitNotes'] ?? ''),
      patternNotes: String(v['patternNotes'] ?? ''),
      dxfUrl: String(v['dxfUrl'] ?? ''),
      cutFolder: String(v['cutFolder'] ?? ''),
    };
    this.specOpen.set(true);
  }

  saveSpec(p: ProductRow): void {
    const v = this.activeSpec();
    if (!v || !this.canWrite()) return;
    this.api
      .updateVariant(p.id, v['id'] as string, {
        fitNotes: this.spec.fitNotes || undefined,
        patternNotes: this.spec.patternNotes || undefined,
        dxfUrl: this.spec.dxfUrl || undefined,
        cutFolder: this.spec.cutFolder || undefined,
      })
      .subscribe({
        next: () => {
          this.specOpen.set(false);
          this.toast.show(`Spec saved for ${v['sku']}`);
          this.loadVariants();
        },
        error: (err) =>
          this.toast.show(err?.error?.message ?? 'The spec could not be saved', {
            tone: 'danger',
            action: { label: 'Try again', run: () => this.saveSpec(p) },
          }),
      });
  }

  exportSpecSheet(): void {
    const v = this.activeSpec();
    if (!v) return;
    this.api.variantSpecSheet(v['id'] as string).subscribe({
      next: (sheet) => this.specSheet.set(JSON.stringify(sheet, null, 2)),
      error: (err) =>
        this.toast.show(err?.error?.message ?? 'The spec sheet could not be built', {
          tone: 'danger',
          action: { label: 'Try again', run: () => this.exportSpecSheet() },
        }),
    });
  }

  // ---- bill of materials ----
  openBom(v: Variant): void {
    this.activeBom.set(v);
    this.specBom.set([]);
    this.bomItemError.set('');
    this.bomOpen.set(true);
    this.loadBom();
    if (this.rawMaterials().length === 0) {
      this.api.materials().subscribe({
        next: (m) => this.rawMaterials.set(m as unknown as Material[]),
        error: () => this.bomItemError.set('The list of materials could not be loaded.'),
      });
    }
  }

  loadBom(): void {
    const v = this.activeBom();
    if (!v) return;
    this.bomLoading.set(true);
    this.bomError.set('');
    this.api.variantBom(v['id'] as string).subscribe({
      next: (rows) => {
        this.specBom.set(rows);
        this.bomLoading.set(false);
      },
      error: (err) => {
        this.bomLoading.set(false);
        this.bomError.set(err?.error?.message ?? 'The server did not respond.');
      },
    });
  }

  private rawName(materialId: unknown): string {
    return (
      this.rawMaterials().find((m) => m.id === materialId)?.name ??
      String(materialId ?? '').slice(0, 8)
    );
  }

  addBomItem(): void {
    const m = this.rawMaterials().find((x) => x.id === this.nbom.materialId);
    this.bomItemError.set(m ? '' : 'Choose a material.');
    if (!m) return;
    this.specBom.update((rows) => [
      ...rows,
      {
        materialId: m.id,
        materialName: m.name,
        unitOfMeasure: m.unit,
        quantityPerUnit: Number(this.nbom.quantity) || 1,
      },
    ]);
    this.nbom = { materialId: '', quantity: 1 };
  }

  saveBom(): void {
    const v = this.activeBom();
    if (!v) return;
    const items = this.specBom().map((r) => ({
      materialId: r['materialId'] as string,
      quantity: Number(r['quantityPerUnit'] ?? r['quantity'] ?? 1),
      note: r['materialName'] as string | undefined,
    }));
    this.api.replaceVariantBom(v['id'] as string, items).subscribe({
      next: () => {
        this.bomOpen.set(false);
        this.toast.show(`Materials saved for ${v['sku']}`);
      },
      error: (err) =>
        this.toast.show(err?.error?.message ?? 'The materials could not be saved', {
          tone: 'danger',
          action: { label: 'Try again', run: () => this.saveBom() },
        }),
    });
  }
}
