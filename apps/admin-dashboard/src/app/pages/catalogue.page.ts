import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  SeBadgeComponent,
  SeBannerComponent,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeCurrencyService,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilter,
  SeFilterBarComponent,
  SeInputDirective,
  SeMetricCardComponent,
  SeMoneyPipe,
  SePageComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { urlFilters } from '../url-filters';
import { ProductRow, count, onSale, skuRange, stockOf, stockValue } from './catalogue-format';

/**
 * Catalogue: every product sold, with its sizes, colours and retail price.
 *
 * The list finds a product; the product's own page (catalogue/:id) is where its
 * price, timed sale, sizes and specs are worked on. Adding a product or a
 * collection is the only writing done here.
 */
@Component({
  selector: 'app-catalogue-admin',
  imports: [
    FormsModule,
    SeBadgeComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCellDirective,
    SeDrawerComponent,
    SeFieldComponent,
    SeFilterBarComponent,
    SeInputDirective,
    SeMetricCardComponent,
    SeMoneyPipe,
    SePageComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Catalogue">
      @if (canWrite()) {
        <ng-container sePageActions>
          <button seButton type="button" (click)="openCategory()">Add category</button>
          <button seButton type="button" (click)="openCollection()">Add collection</button>
          <button seButton variant="primary" type="button" (click)="openProduct()">
            Add product
          </button>
        </ng-container>
      }

      <div class="se-metric-grid">
        <se-metric-card label="Products" [value]="products().length" hint="In the catalogue" />
        <se-metric-card label="Sizes and colours" [value]="skuCount()" hint="Across all products" />
        <se-metric-card
          label="Stock value"
          [value]="catalogueValue() | seMoney"
          hint="Units in stock at retail price"
        />
        <se-metric-card
          label="Price changes awaiting approval"
          [value]="pendingPriceChanges()"
          hint="Management approves them in Approvals"
        />
      </div>

      @if (sideError()) {
        <se-banner
          tone="warning"
          title="Some figures could not be loaded"
          actionLabel="Try again"
          (action)="loadFigures()"
        >
          {{ sideError() }}
        </se-banner>
      }

      <se-table
        caption="Products"
        [columns]="columns"
        [rows]="rows()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [pageSize]="25"
        activatable
        (rowActivate)="open($event)"
        [emptyHeading]="filtering() ? 'No products match these filters' : 'No products yet'"
        [emptyText]="
          filtering()
            ? 'Remove a filter, or clear them all to see every product.'
            : 'Add the first product to start selling it.'
        "
        [emptyActionLabel]="filtering() ? 'Clear all filters' : ''"
        (emptyAction)="clearFilters()"
      >
        <se-filter-bar
          seTableToolbar
          searchLabel="Search products"
          searchPlaceholder="Product, category or SKU"
          [(query)]="query"
          [filters]="filters()"
          [(value)]="filterValue"
          [summary]="summary()"
        />
        <ng-template seCell="price" let-row>
          @if (isOnSale(row)) {
            {{ row.salePrice | seMoney }}
            <se-badge tone="warning">Sale, {{ row.salePercent }}% off</se-badge>
          } @else {
            {{ row.basePrice | seMoney }}
          }
        </ng-template>
      </se-table>

      <se-drawer title="Add product" [(open)]="adding">
        <form class="se-form" (ngSubmit)="createProduct()">
          <se-field label="Name" [error]="nameError()">
            <input seInput name="pname" [(ngModel)]="np.name" />
          </se-field>
          <div class="se-form__row">
            <se-field
              label="Category"
              hint="Products are grouped by category on the storefront."
              [error]="categoryPickError()"
            >
              <select seInput name="pcat" [(ngModel)]="np.category">
                <option value="">Choose a category</option>
                @for (c of categories(); track c.id) {
                  <option [value]="c.name">{{ c.name }}</option>
                }
              </select>
            </se-field>
            <se-field label="Retail price" [error]="priceError()">
              <input seInput type="number" min="0" name="pprice" [(ngModel)]="np.basePrice" />
            </se-field>
          </div>
          <se-field label="Collection" optional>
            <select seInput name="pcoll" [(ngModel)]="np.collectionId">
              <option value="">No collection</option>
              @for (c of collectionRows(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </se-field>
          <se-field label="Description" optional>
            <textarea seInput rows="3" name="pdesc" [(ngModel)]="np.description"></textarea>
          </se-field>
          <se-field
            label="Photo"
            hint="JPG, PNG or WebP up to 5MB. Listings, search results and wishlists use it."
            optional
            [error]="photoError()"
          >
            <input
              seInput
              type="file"
              accept="image/jpeg,image/png,image/webp"
              name="pimg"
              (change)="pickPhoto($event)"
            />
          </se-field>
          @if (photoUploading()) {
            <p class="photo-note">Uploading the photo…</p>
          }
          @if (photoUrl(); as url) {
            <div class="photo-preview">
              <img [src]="url" alt="Photo chosen for the new product" />
              <button seButton size="sm" type="button" (click)="clearPhoto()">
                Remove photo
              </button>
            </div>
          }
        </form>
        <ng-container seDrawerFooter>
          <button seButton type="button" (click)="adding.set(false)">Cancel</button>
          <button
            seButton
            variant="primary"
            type="button"
            [loading]="saving()"
            (click)="createProduct()"
          >
            Add product
          </button>
        </ng-container>
      </se-drawer>

      <se-drawer title="Add collection" [(open)]="addingCollection">
        <form class="se-form" (ngSubmit)="createCollection()">
          <se-field
            label="Collection name"
            hint="A collection groups products released together."
            [error]="collectionError()"
          >
            <input seInput name="ncoll" [(ngModel)]="newCollection" />
          </se-field>
        </form>
        <ng-container seDrawerFooter>
          <button seButton type="button" (click)="addingCollection.set(false)">Cancel</button>
          <button
            seButton
            variant="primary"
            type="button"
            [loading]="saving()"
            (click)="createCollection()"
          >
            Add collection
          </button>
        </ng-container>
      </se-drawer>

      <se-drawer title="Add category" [(open)]="addingCategory">
        <form class="se-form" (ngSubmit)="createCategory()">
          <se-field
            label="Category name"
            hint="It will appear in the category dropdown when adding a product."
            [error]="categoryError()"
          >
            <input seInput name="ncat" [(ngModel)]="newCategory" />
          </se-field>
        </form>
        <ng-container seDrawerFooter>
          <button seButton type="button" (click)="addingCategory.set(false)">Cancel</button>
          <button
            seButton
            variant="primary"
            type="button"
            [loading]="saving()"
            (click)="createCategory()"
          >
            Add category
          </button>
        </ng-container>
      </se-drawer>
    </se-page>
  `,
  styles: [
    `
      .photo-preview {
        display: flex;
        align-items: center;
        gap: var(--se-space-3);
        margin-top: var(--se-space-3);
      }
      .photo-preview img {
        width: 72px;
        height: 72px;
        object-fit: cover;
        border-radius: var(--se-radius-md);
        border: var(--se-border-width) solid var(--se-color-border);
      }
      .photo-note {
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
    `,
  ],
})
export class CatalogueAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);
  private readonly access = inject(AccessService);

  /** Creating products and collections needs full access to the catalogue. */
  readonly canWrite = computed(() => this.access.can('catalogue', 'full'));

  readonly products = signal<ProductRow[]>([]);
  readonly collectionRows = signal<Array<{ id: string; name: string }>>([]);
  readonly categories = signal<Array<{ id: string; name: string }>>([]);
  readonly pendingPriceChanges = signal(0);
  /** variantId to current stock (inventory summary), for valuation. */
  private readonly stockMap = signal<Map<string, number>>(new Map());
  /** True only until the first answer arrives; a refresh keeps the rows on screen. */
  readonly loading = signal(true);
  readonly error = signal('');
  /** Stock or approvals failed to load: the list is still usable, the figures are not. */
  readonly sideError = signal('');

  // ---- filters: held here, mirrored in the URL so a filtered list can be shared ----
  private readonly urlState = urlFilters(['category']);
  readonly query = this.urlState.query;
  readonly filterValue = this.urlState.value;
  readonly filters = computed<SeFilter[]>(() => {
    const names = this.categories().map((c) => c.name);
    return [
      {
        key: 'category',
        label: 'Category',
        options: names.map((value) => ({ value, label: value })),
      },
    ];
  });
  readonly filtering = computed(
    () => !!this.query().trim() || Object.keys(this.filterValue()).length > 0,
  );

  readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const category = this.filterValue()['category'];
    // Read here so the stock column redraws when stock levels arrive after the products.
    this.stockMap();
    return this.products().filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(q))
      );
    });
  });
  readonly summary = computed(() => count(this.rows().length, 'product'));

  readonly columns: SeColumn<ProductRow>[] = [
    { key: 'name', header: 'Product', sortable: true, value: (p) => p.name },
    { key: 'skus', header: 'SKUs', value: (p) => skuRange(p) },
    { key: 'category', header: 'Category', sortable: true, value: (p) => p.category || '–' },
    { key: 'collection', header: 'Collection', value: (p) => p.collection?.name ?? '–' },
    {
      key: 'sizes',
      header: 'Colours and sizes',
      value: (p) =>
        `${count(new Set(p.variants.map((v) => v.colour ?? '')).size, 'colour')}, ${count(p.variants.length, 'size')}`,
    },
    {
      key: 'stock',
      header: 'In stock',
      numeric: true,
      sortable: true,
      value: (p) => stockOf(p, this.stockMap()),
    },
    {
      key: 'price',
      header: 'Retail price',
      numeric: true,
      sortable: true,
      value: (p) => p.salePrice ?? p.basePrice,
      format: (v) => this.currency.format(v as number),
    },
  ];

  readonly skuCount = computed(() => this.products().reduce((s, p) => s + p.variants.length, 0));
  readonly catalogueValue = computed(() =>
    this.products().reduce((sum, p) => sum + stockValue(p, this.stockMap()), 0),
  );

  // ---- add product / add collection / add category ----
  readonly adding = signal(false);
  readonly addingCollection = signal(false);
  readonly addingCategory = signal(false);
  readonly saving = signal(false);
  readonly nameError = signal('');
  readonly priceError = signal('');
  readonly collectionError = signal('');
  readonly categoryPickError = signal('');
  readonly categoryError = signal('');
  np = {
    name: '',
    category: '',
    basePrice: null as number | null,
    description: '',
    collectionId: '',
  };
  newCollection = '';
  newCategory = '';

  // ---- product photo: uploaded as soon as a file is chosen, so the drawer can
  //      show it; the URL is only written onto the product when it is created ----
  readonly photoUrl = signal<string | null>(null);
  readonly photoUploading = signal(false);
  readonly photoError = signal('');

  ngOnInit(): void {
    this.load();
    this.loadFigures();
  }

  load(): void {
    this.api.products().subscribe({
      next: (res) => {
        this.products.set(res.data as unknown as ProductRow[]);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        // A failed refresh must not wipe a list that is already on screen.
        if (this.products().length === 0) {
          this.error.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
    this.api.collections().subscribe({
      next: (res) => this.collectionRows.set(res),
      error: () => undefined,
    });
    this.api.categories().subscribe({
      next: (res) => this.categories.set(res),
      error: () => undefined,
    });
  }

  /** Stock levels and the approvals count: figures beside the list, loaded on their own. */
  loadFigures(): void {
    this.sideError.set('');
    this.api.inventorySummary().subscribe({
      next: (rows) => {
        const m = new Map<string, number>();
        for (const r of rows) if (r.itemType === 'variant') m.set(r.itemId, r.currentQuantity);
        this.stockMap.set(m);
      },
      error: () => this.sideError.set('Stock levels are missing, so stock shows as 0.'),
    });
    this.api.pendingApprovals().subscribe({
      next: (a) =>
        this.pendingPriceChanges.set(a.filter((x) => x.actionType === 'price_change').length),
      error: () => this.sideError.set('The count of price changes awaiting approval is missing.'),
    });
  }

  isOnSale(p: ProductRow): boolean {
    return onSale(p);
  }

  open(p: ProductRow): void {
    void this.router.navigate(['/catalogue', p.id]);
  }

  clearFilters(): void {
    this.query.set('');
    this.filterValue.set({});
  }

  openProduct(): void {
    this.nameError.set('');
    this.priceError.set('');
    this.categoryPickError.set('');
    this.photoError.set('');
    this.photoUrl.set(null);
    this.photoUploading.set(false);
    this.adding.set(true);
  }

  openCollection(): void {
    this.collectionError.set('');
    this.addingCollection.set(true);
  }

  openCategory(): void {
    this.categoryError.set('');
    this.addingCategory.set(true);
  }

  /** Mirror of the API's own rules (JPG/PNG/WebP, 5MB) so a bad file fails here. */
  pickPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Cleared so choosing the same file twice still fires a change event.
    input.value = '';
    this.photoError.set('');
    if (!file) return;
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
      next: (res) => {
        this.photoUploading.set(false);
        this.photoUrl.set(res.url);
      },
      error: (err) => {
        this.photoUploading.set(false);
        this.photoError.set(err?.error?.message ?? 'The photo could not be uploaded. Try again.');
      },
    });
  }

  clearPhoto(): void {
    this.photoUrl.set(null);
    this.photoError.set('');
  }

  createProduct(): void {
    const name = this.np.name.trim();
    const category = this.np.category.trim();
    const price = Number(this.np.basePrice);
    if (this.photoUploading()) {
      this.photoError.set('Wait for the photo to finish uploading first.');
      return;
    }
    this.nameError.set(name ? '' : 'Enter the product name.');
    this.priceError.set(
      this.np.basePrice !== null && price >= 0 ? '' : 'Enter the retail price, 0 or more.',
    );
    this.categoryPickError.set(category ? '' : 'Choose a category.');
    if (this.nameError() || this.priceError() || this.categoryPickError()) return;
    this.saving.set(true);
    this.api
      .createProduct({
        name,
        category,
        basePrice: price,
        description: this.np.description || undefined,
        collectionId: this.np.collectionId || undefined,
        primaryImageUrl: this.photoUrl() || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.adding.set(false);
          this.np = { name: '', category: '', basePrice: null, description: '', collectionId: '' };
          this.photoUrl.set(null);
          this.toast.show(`${name} added to the catalogue`);
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.nameError.set(err?.error?.message ?? 'The product could not be added. Try again.');
        },
      });
  }

  createCollection(): void {
    const name = this.newCollection.trim();
    this.collectionError.set(name ? '' : 'Enter the collection name.');
    if (!name) return;
    this.saving.set(true);
    this.api.createCollection(name).subscribe({
      next: () => {
        this.saving.set(false);
        this.addingCollection.set(false);
        this.newCollection = '';
        this.toast.show(`Collection ${name} added`);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.collectionError.set(
          err?.error?.message ?? 'The collection could not be added. Try again.',
        );
      },
    });
  }

  createCategory(): void {
    const name = this.newCategory.trim();
    this.categoryError.set(name ? '' : 'Enter the category name.');
    if (!name) return;
    this.saving.set(true);
    this.api.createCategory(name).subscribe({
      next: () => {
        this.saving.set(false);
        this.addingCategory.set(false);
        this.newCategory = '';
        this.toast.show(`Category ${name} added`);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.categoryError.set(
          err?.error?.message ?? 'The category could not be added. Try again.',
        );
      },
    });
  }
}
