import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';

import { ProductPage } from './product.page';
import { Product } from '../api.service';

/**
 * The gallery has one job that is easy to get wrong: the photo on screen must
 * belong to the variant the shopper actually has selected.
 *
 * It failed that once. The gallery was built variant-first, so a product whose
 * variants carried their own photos opened on whichever colour happened to be
 * first rather than the selected one, and picking a colour changed the price and
 * the swatch but left the picture alone. These cases pin the behaviour.
 */
function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Men 2-Piece Set',
    description: null,
    category: '2-Piece Sets',
    basePrice: 5000,
    collection: null,
    createdAt: '2026-01-01',
    primaryImageUrl: 'assets/products/product_06.png',
    variants: [
      { id: 'v1', sku: 'A', size: 'OS', colour: 'black/gold', priceOverride: null, imageUrl: 'assets/products/product_06.png', availabilityStatus: 'in_stock' },
      { id: 'v2', sku: 'B', size: 'OS', colour: 'beige', priceOverride: null, imageUrl: 'assets/products/product_05.png', availabilityStatus: 'in_stock' },
      { id: 'v3', sku: 'C', size: 'OS', colour: 'brown', priceOverride: null, imageUrl: 'assets/products/product_01.png', availabilityStatus: 'in_stock' },
    ],
    ...over,
  } as Product;
}

async function setup(p: Product) {
  await TestBed.configureTestingModule({
    imports: [ProductPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'p1' } } } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ProductPage);
  const http = TestBed.inject(HttpTestingController);

  fixture.componentInstance.product.set(p);
  // ngOnInit fires on first detect and issues the two requests.
  fixture.detectChanges();

  http.expectOne((r) => r.url.includes('/products/p1') && !r.url.includes('reviews')).flush(p);
  const reviews = http.match((r) => r.url.includes('reviews'));
  reviews.forEach((r) => r.flush({ data: [], total: 0 }));
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance as ProductPage };
}

describe('ProductPage gallery', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('leads with the photo of the variant that is actually selected', async () => {
    const { page } = await setup(product());
    // The page opens on the first variant; its photo must be shot one.
    expect(page.colour()).toBe('black/gold');
    expect(page.gallery()[0].src).toBe('assets/products/product_06.png');
  });

  it('moves the lead photo when the shopper picks another colour', async () => {
    const { page } = await setup(product());
    const before = page.gallery()[0].src;

    page.pickColour('brown');

    // Brown is product_01, which is neither the first shot nor the primary.
    expect(page.colour()).toBe('brown');
    expect(page.gallery()[0].src).toBe('assets/products/product_01.png');
    expect(page.gallery()[0].src).not.toBe(before);
  });

  it('keeps the product own photo in the gallery even when it differs from every variant', async () => {
    const { page } = await setup(product());
    const srcs = page.gallery().map((s) => s.src);
    // product_06 is the primary AND the black/gold photo: it must appear once.
    expect(srcs).toContain('assets/products/product_06.png');
    expect(srcs).toContain('assets/products/product_05.png');
    expect(srcs).toContain('assets/products/product_01.png');
    expect(new Set(srcs).size).toBe(srcs.length);
  });

  it('does not repeat a photo that is both a colour shot and the primary', async () => {
    const { page } = await setup(product());
    const srcs = page.gallery().map((s) => s.src);
    expect(srcs.filter((s) => s === 'assets/products/product_06.png').length).toBe(1);
  });

  it('labels the pill with the colour of the photo on screen', async () => {
    const { page } = await setup(product());
    expect(page.galleryLabel()).toContain('| black/gold');
    page.pickColour('beige');
    expect(page.galleryLabel()).toContain('| beige');
  });

  it('falls back to the placeholder when the product has no photos at all', async () => {
    const bare = product({ primaryImageUrl: null });
    bare.variants = bare.variants.map((v) => ({ ...v, imageUrl: null }));
    const { page } = await setup(bare);
    expect(page.gallery().length).toBe(1);
    expect(page.gallery()[0].src).toContain('placeholder');
    expect(page.galleryLabel()).not.toContain('|');
  });
});