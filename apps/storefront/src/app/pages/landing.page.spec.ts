import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService, Product } from '../api.service';
import { BrandAlertService } from '../brand-alert.service';
import { CartService } from '../cart.service';
import { LandingPage } from './landing.page';

/**
 * Phase 2 home tests. The rails must be projections of real catalogue data, so
 * these check the two places where a redesign could quietly start lying:
 * the ordering signals, and any category the API never actually sent.
 */
describe('LandingPage', () => {
  let fixture: ComponentFixture<LandingPage>;
  let element: HTMLElement;
  let products: Product[];
  let reviews: Record<string, Array<{ rating: number; comment: string | null }>>;

  const product = (over: Partial<Product> = {}): Product =>
    ({
      id: 'p1',
      name: 'Harmattan Tee',
      description: null,
      category: 'tops',
      basePrice: 18500,
      collection: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      variants: [],
      // Deliberately no soldCount by default so tests must opt into sales data
      // rather than inheriting an accidental count of 0 or 1.
      ...over,
    }) as Product;

  const withImage = (url: string | null) => [
    { id: 'v1', sku: 'S1', size: 'OS', colour: null, priceOverride: null, imageUrl: url, availabilityStatus: 'in_stock' },
  ];

  const mount = async (): Promise<void> => {
    TestBed.configureTestingModule({
      imports: [LandingPage],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            products: () => of({ data: products, total: products.length }),
            reviews: (id: string) =>
              of({ data: reviews[id] ?? [], total: (reviews[id] ?? []).length }),
          },
        },
        { provide: CartService, useValue: { count: 0, add: () => undefined } },
        { provide: BrandAlertService, useValue: { toast: () => Promise.resolve() } },
      ],
    });
    fixture = TestBed.createComponent(LandingPage);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    localStorage.removeItem('seentair.wishlist');
    reviews = {};
    products = [
      product({ id: 'old', name: 'Old Tee', createdAt: '2026-01-01T00:00:00.000Z' }),
      product({ id: 'new', name: 'New Tee', createdAt: '2026-06-01T00:00:00.000Z' }),
      product({ id: 'mid', name: 'Mid Tee', createdAt: '2026-03-01T00:00:00.000Z' }),
    ];
  });

  it('ranks New Arrivals by the real createdAt, newest first, three across', async () => {
    await mount();
    expect(fixture.componentInstance.newArrivals().map((p) => p.id)).toEqual([
      'new',
      'mid',
      'old',
    ]);
    expect(element.querySelectorAll('.m-row3 app-product-card').length).toBe(3);
  });

  it('ranks Best Sellers by real orders sold, highest first', async () => {
    products = [
      product({ id: 'a', name: 'A Tee', soldCount: 3 }),
      product({ id: 'b', name: 'B Tee', soldCount: 12 }),
      product({ id: 'c', name: 'C Tee', soldCount: 7 }),
    ];
    await mount();
    expect(fixture.componentInstance.bestSellers().map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('excludes products with no sales rather than implying popularity', async () => {
    products = [
      product({ id: 'sold', soldCount: 4 }),
      product({ id: 'unsold', soldCount: 0 }),
    ];
    await mount();
    expect(fixture.componentInstance.bestSellers().map((p) => p.id)).toEqual(['sold']);
  });

  it('treats a missing soldCount as unknown-but-zero, not as a sale', async () => {
    products = [
      product({ id: 'sold', soldCount: 4 }),
      product({ id: 'legacy' }),
    ];
    await mount();
    expect(fixture.componentInstance.bestSellers().map((p) => p.id)).toEqual(['sold']);
    expect(fixture.componentInstance.soldOf(fixture.componentInstance.all()[1])).toBe(0);
  });

  it('breaks sales ties on reviews, then name, so the order is stable', async () => {
    products = [
      product({ id: 'z', name: 'Zebra Tee', soldCount: 5 }),
      product({ id: 'a', name: 'Alpha Tee', soldCount: 5 }),
    ];
    reviews = { z: [{ rating: 5, comment: null }, { rating: 4, comment: null }] };
    await mount();
    // `z` has more reviews, so it outranks `a` despite the identical sales count.
    expect(fixture.componentInstance.bestSellers().map((p) => p.id)).toEqual(['z', 'a']);
  });

  it('shows the purchase count above the star rating', async () => {
    products = [product({ id: 'sold', name: 'Sold Tee', soldCount: 42 })];
    reviews = {
      sold: [
        { rating: 5, comment: null },
        { rating: 4, comment: null },
        { rating: 4, comment: null },
        { rating: 3, comment: null },
      ],
    };
    await mount();
    const tile = element.querySelector('.m-tile')!;
    expect(tile.querySelector('.m-tile__sold')?.textContent?.trim()).toBe('42 bought');
    // The user asked for the count to sit in front of the rating, so it must
    // come first in reading order as well as visually.
    const html = tile.innerHTML;
    expect(html.indexOf('m-tile__sold')).toBeLessThan(html.indexOf('m-tile__rate'));
    // 4.0 average renders as four filled stars plus one outline.
    expect(tile.querySelector('.m-tile__stars')?.textContent?.trim()).toBe('★★★★☆');
    expect(tile.querySelector('.m-tile__rate-num')?.textContent?.trim()).toBe('(4)');
  });

  it('omits the rating when a product has no reviews rather than showing stars', async () => {
    products = [product({ id: 'sold', soldCount: 5 })];
    await mount();
    const tile = element.querySelector('.m-tile')!;
    expect(tile.querySelector('.m-tile__sold')?.textContent?.trim()).toBe('5 bought');
    expect(tile.querySelector('.m-tile__rate')).toBeNull();
  });

  it('clamps star glyphs so a bad rating cannot overflow the row', async () => {
    await mount();
    const c = fixture.componentInstance;
    expect(c.starGlyph(4.3)).toBe('★★★★☆');
    expect(c.starGlyph(5)).toBe('★★★★★');
    expect(c.starGlyph(0)).toBe('☆☆☆☆☆');
    expect(c.starGlyph(9)).toBe('★★★★★');
    expect(c.starGlyph(-1)).toBe('☆☆☆☆☆');
  });

  it('labels the third rail Best Sellers', async () => {
    products = [product({ id: 'sold', soldCount: 4 })];
    await mount();
    const headings = [...element.querySelectorAll('.m-sec__head h2')].map((n) =>
      n.textContent?.trim(),
    );
    expect(headings).toEqual(['Shop by Category', 'New Arrivals', 'Best Sellers']);
  });

  it('builds the category rail from category values the catalogue really has', async () => {
    products = [
      product({ id: 'a', category: 'tops' }),
      product({ id: 'b', category: 'bottoms' }),
      product({ id: 'c', category: 'bottoms' }),
      product({ id: 'd', category: null }),
    ];
    await mount();
    const cats = fixture.componentInstance.categories();
    expect(cats.map((c) => c.name)).toEqual(['tops', 'bottoms', 'other']);
    expect(cats.find((c) => c.name === 'bottoms')?.count).toBe(2);
    // The reference shows Men/Women/Children. Those are audiences, and the flat
    // category string cannot prove them, so they must not be invented.
    expect(element.querySelector('.m-cats')?.textContent).not.toContain('Women');
  });

  it('prefers the variant image and only falls back to a shipped asset', async () => {
    products = [
      product({ id: 'withimg', variants: withImage('https://cdn.test/real.png') }),
      product({ id: 'noimg', variants: withImage(null) }),
    ];
    await mount();
    const c = fixture.componentInstance;
    expect(c.imageFor(c.all()[0], 0)).toBe('https://cdn.test/real.png');
    expect(c.imageFor(c.all()[1], 0)).toBe('assets/products/product_01.png');
  });

  it('shows an honest empty state instead of placeholder tiles', async () => {
    await mount();
    const empties = [...element.querySelectorAll('.m-empty')].map((n) => n.textContent?.trim());
    // Nothing had sold, so Best Sellers must say so rather than invent a rail.
    expect(empties).toContain('Nothing has sold yet — check back after the first drop.');
    expect(element.querySelectorAll('.m-tile').length).toBe(0);
  });
});