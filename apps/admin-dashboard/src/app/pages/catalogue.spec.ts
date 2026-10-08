import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { SeConfirmService, SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { CatalogueDetailPage } from './catalogue-detail.page';
import { ProductRow, SALE_REQUESTS_KEY, count, salePriceAt } from './catalogue-format';
import { CatalogueAdminPage } from './catalogue.page';

const product = (over: Partial<ProductRow> = {}): ProductRow => ({
  id: 'p1',
  name: 'Silk tee',
  category: 'tees',
  basePrice: 10000,
  primaryImageUrl: null,
  salePercent: null,
  saleEndsAt: null,
  salePrice: null,
  variants: [{ id: 'v1', sku: 'TEE-BLK-M', size: 'M', colour: 'black', priceOverride: null }],
  collection: null,
  ...over,
});

const METHODS = [
  'products',
  'collections',
  'categories',
  'createCategory',
  'createProduct',
  'uploadProductImage',
  'tiers',
  'inventorySummary',
  'pendingApprovals',
  'productVariants',
  'createApproval',
  'setProductSale',
  'endProductSale',
  'updateProduct',
] as const;

let api: jasmine.SpyObj<ApiService>;

/** Sets up the API double and the signed-in role; `products` is what GET /products answers. */
function setUp(products: unknown, level: string, extra: unknown[] = []): void {
  localStorage.removeItem(SALE_REQUESTS_KEY);
  api = jasmine.createSpyObj<ApiService>('ApiService', [...METHODS]);
  api.products.and.returnValue(products as never);
  api.collections.and.returnValue(of([]));
  api.categories.and.returnValue(of([]));
  api.createCategory.and.returnValue(of({}));
  api.tiers.and.returnValue(of([]));
  api.inventorySummary.and.returnValue(of([]));
  api.pendingApprovals.and.returnValue(of([]));
  api.productVariants.and.returnValue(
    of([{ id: 'v1', sku: 'TEE-BLK-M', availabilityStatus: 'in_stock' }]),
  );
  api.createApproval.and.returnValue(of({ id: 'req-1' }));
  api.setProductSale.and.returnValue(of({}));
  api.endProductSale.and.returnValue(of({}));
  api.updateProduct.and.returnValue(of({}));
  api.createProduct.and.returnValue(of({}));
  api.uploadProductImage.and.returnValue(of({ url: 'http://api.test/uploads/products/a.png' }));
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: ApiService, useValue: api }, ...(extra as never[])],
  });
  TestBed.inject(SeCurrencyService).config.set({
    currencyCode: 'NGN',
    currencySymbol: '₦',
    locale: 'en-NG',
  });
  TestBed.inject(AccessService).me.set({
    name: 'Ada',
    email: 'ada@example.com',
    role: 'tester',
    totpEnabled: false,
    access: { catalogue: level },
  });
}

/** The labels of the buttons on the page itself; closed drawers keep their own in the DOM. */
function pageButtons(root: HTMLElement): string {
  return [...root.querySelectorAll('button, a')]
    .filter((b) => !b.closest('se-drawer'))
    .map((b) => b.textContent?.trim())
    .join('|');
}

describe('catalogue format', () => {
  it('rounds a sale price the way the API does and writes counts properly', () => {
    expect(salePriceAt(9999, 15)).toBe(8499.15);
    expect(count(1, 'size')).toBe('1 size');
    expect(count(3, 'size')).toBe('3 sizes');
  });
});

describe('CatalogueAdminPage', () => {
  let fixture: ComponentFixture<CatalogueAdminPage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const mount = (products: unknown, level = 'full'): void => {
    setUp(products, level);
    fixture = TestBed.createComponent(CatalogueAdminPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('renders the products through the shared table', () => {
    mount(of({ data: [product()], total: 1 }));
    expect(el().querySelector('se-table')).not.toBeNull();
    expect(el().textContent).toContain('Silk tee');
    expect(el().textContent).toContain('1 colour, 1 size');
  });

  it('shows an error with a retry when the load fails, not an empty catalogue', () => {
    mount(throwError(() => ({ error: { message: 'Database is down' } })));
    expect(el().textContent).toContain('Database is down');
    expect(el().textContent).toContain('Try again');
    expect(el().textContent).not.toContain('No products yet');
  });

  it('offers "Add product" only to a role with full access to the catalogue', () => {
    mount(of({ data: [product()], total: 1 }), 'view');
    expect(pageButtons(el())).not.toContain('Add product');
    expect(pageButtons(el())).not.toContain('Add collection');
    expect(pageButtons(el())).not.toContain('Add category');
    TestBed.inject(AccessService).me.update((me) => ({ ...me!, access: { catalogue: 'full' } }));
    fixture.detectChanges();
    expect(pageButtons(el())).toContain('Add product');
    expect(pageButtons(el())).toContain('Add category');
  });

  it('carries an uploaded photo URL onto the product it creates', () => {
    mount(of({ data: [], total: 0 }));
    const page = fixture.componentInstance;
    page.np = {
      name: 'Silk tee',
      category: 'tees',
      basePrice: 5000,
      description: '',
      collectionId: '',
    };
    page.photoUrl.set('http://api.test/uploads/products/a.png');
    page.createProduct();
    expect(api.createProduct).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        name: 'Silk tee',
        primaryImageUrl: 'http://api.test/uploads/products/a.png',
      }),
    );
    expect(page.photoUrl()).toBeNull();
  });

  it('refuses a file that is not a supported image before uploading anything', () => {
    mount(of({ data: [], total: 0 }));
    const page = fixture.componentInstance;
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })],
    });
    page.pickPhoto({ target: input } as unknown as Event);
    expect(page.photoError()).toContain('Only JPG, PNG and WebP');
    expect(api.uploadProductImage).not.toHaveBeenCalled();
  });
});

describe('CatalogueDetailPage', () => {
  let fixture: ComponentFixture<CatalogueDetailPage>;
  let page: CatalogueDetailPage;
  let ask: jasmine.Spy;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const mount = (p: ProductRow = product(), level = 'full'): void => {
    setUp(of({ data: [p], total: 1 }), level, [
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: p.id }) } },
      },
    ]);
    ask = spyOn(TestBed.inject(SeConfirmService), 'ask');
    fixture = TestBed.createComponent(CatalogueDetailPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  };
  const future = (): string => new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
  afterEach(() => {
    fixture?.destroy();
    localStorage.removeItem(SALE_REQUESTS_KEY);
  });

  it('requests a timed sale with exactly the payload the API checks, and keeps it across a reload', () => {
    mount();
    page.salePercentDraft = 20;
    page.saleEndDraft = future();
    const endsAt = new Date(page.saleEndDraft).toISOString();
    page.requestSaleApproval(product());
    expect(api.createApproval).toHaveBeenCalledOnceWith('price_change', {
      kind: 'sale',
      productId: 'p1',
      product: 'Silk tee',
      from: 10000,
      to: 8000,
      salePercent: 20,
      saleEndsAt: endsAt,
    });
    expect(JSON.parse(localStorage.getItem(SALE_REQUESTS_KEY)!)).toEqual({
      p1: { id: 'req-1', percent: 20, endsAt },
    });
  });

  it('refuses a discount outside 1 to 90 and an end time in the past, under the fields', () => {
    mount();
    page.salePercentDraft = 95;
    page.saleEndDraft = '2020-01-01T10:00';
    page.requestSaleApproval(product());
    fixture.detectChanges();
    expect(api.createApproval).not.toHaveBeenCalled();
    expect(el().textContent).toContain('Enter a discount between 1 and 90 percent.');
    expect(el().textContent).toContain('Choose a date and time in the future.');
    expect(page.salePercentDraft).toBe(95);
  });

  it('starts a sale only after a confirmation naming the old and new price', async () => {
    const endsAt = new Date(Date.now() + 86_400_000).toISOString();
    mount();
    localStorage.setItem(
      SALE_REQUESTS_KEY,
      JSON.stringify({ p1: { id: 'req-1', percent: 20, endsAt } }),
    );
    fixture.destroy();
    fixture = TestBed.createComponent(CatalogueDetailPage);
    page = fixture.componentInstance;
    fixture.detectChanges();

    ask.and.resolveTo(false);
    await page.applySale(product());
    expect(api.setProductSale).not.toHaveBeenCalled();
    const said = ask.calls.mostRecent().args[0].consequence as string;
    expect(said).toContain('8,000');
    expect(said).toContain('10,000');

    ask.and.resolveTo(true);
    await page.applySale(product());
    expect(api.setProductSale).toHaveBeenCalledOnceWith('p1', {
      percent: 20,
      endsAt,
      approvalRequestId: 'req-1',
    });
    expect(localStorage.getItem(SALE_REQUESTS_KEY)).toBe('{}');
  });

  it('applies an approved price only after a confirmation naming the old and new price', async () => {
    mount();
    page.newPrice = 12000;
    page.requestPriceApproval(product());
    expect(api.createApproval).toHaveBeenCalledOnceWith('price_change', {
      productId: 'p1',
      product: 'Silk tee',
      from: 10000,
      to: 12000,
    });

    ask.and.resolveTo(false);
    await page.applyPrice(product());
    expect(api.updateProduct).not.toHaveBeenCalled();
    const said = ask.calls.mostRecent().args[0].consequence as string;
    expect(said).toContain('10,000');
    expect(said).toContain('12,000');

    ask.and.resolveTo(true);
    await page.applyPrice(product());
    expect(api.updateProduct).toHaveBeenCalledOnceWith('p1', {
      basePrice: 12000,
      approvalRequestId: 'req-1',
    });
  });

  it('does not end a sale when the confirmation is declined', async () => {
    const live = product({ salePercent: 20, salePrice: 8000, saleEndsAt: '2026-12-01T10:00:00Z' });
    mount(live);
    ask.and.resolveTo(false);
    await page.endSale(live);
    expect(api.endProductSale).not.toHaveBeenCalled();
  });

  it('uploads a chosen photo and then writes its URL onto the product', () => {
    mount();
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'shirt.png', { type: 'image/png' })],
    });
    page.replacePhoto({ target: input } as unknown as Event);
    expect(api.uploadProductImage).toHaveBeenCalled();
    expect(api.updateProduct).toHaveBeenCalledOnceWith('p1', {
      primaryImageUrl: 'http://api.test/uploads/products/a.png',
    });
  });

  it('clears the photo reference only after the removal is confirmed', async () => {
    const photoed = product({ primaryImageUrl: 'http://api.test/uploads/products/a.png' });
    mount(photoed);
    ask.and.resolveTo(false);
    await page.removePhoto(photoed);
    expect(api.updateProduct).not.toHaveBeenCalled();

    ask.and.resolveTo(true);
    await page.removePhoto(photoed);
    expect(api.updateProduct).toHaveBeenCalledOnceWith('p1', { primaryImageUrl: null });
  });

  it('shows a view-only role the photo but never an upload or remove control', () => {
    mount(product({ primaryImageUrl: 'http://api.test/uploads/products/a.png' }), 'view');
    const buttons = pageButtons(el());
    expect(buttons).not.toContain('Replace photo');
    expect(buttons).not.toContain('Upload photo');
    expect(buttons).not.toContain('Remove');
    expect(el().querySelector('.product-photo')).not.toBeNull();
  });

  it('leaves out every write action for a role without full access', () => {
    mount(product(), 'view');
    const buttons = pageButtons(el());
    for (const label of ['Add size', 'Request approval', 'Apply price', 'Start sale', 'End sale']) {
      expect(buttons).withContext(label).not.toContain(label);
    }
    expect(el().textContent).not.toContain('Change retail price');
    expect(el().textContent).toContain('Sizes and availability');
  });
});
