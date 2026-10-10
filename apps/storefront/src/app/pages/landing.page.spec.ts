import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService, Product } from '../api.service';
import { BrandAlertService } from '../brand-alert.service';
import { CartService } from '../cart.service';
import { PRODUCT_PLACEHOLDER, productImage } from '../product-image';
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
    /**
     * The page now asks for every card's rating in one batched call, so the
     * stub derives the same averages the API would return for the whole page.
     */
    ratingSummaries: (ids: string[]) =>
      of(
        ids
          .filter((id) => (reviews[id] ?? []).length > 0)
          .map((id) => {
            const rows = reviews[id];
            return {
              productId: id,
              avg: rows.reduce((s, r) => s + r.rating, 0) / rows.length,
              count: rows.length,
            };
          }),
      ),
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
      product({ id: 'a', name: 'A Tee', soldCount: 3, isBestseller: true }),
      product({ id: 'b', name: 'B Tee', soldCount: 12, isBestseller: true }),
      product({ id: 'c', name: 'C Tee', soldCount: 7, isBestseller: true }),
    ];
    await mount();
    expect(fixture.componentInstance.bestSellers().map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('shows only products the seller flagged, never an unflagged one', async () => {
    products = [
      product({ id: 'sold', soldCount: 4, isBestseller: true }),
      // Unflagged even though it outsells the flagged one: membership is the
      // merchandising label, not a sales cut-off.
      product({ id: 'unflagged', soldCount: 30 }),
    ];
    await mount();
    expect(fixture.componentInstance.bestSellers().map((p) => p.id)).toEqual(['sold']);
  });

  it('treats a missing soldCount as unknown-but-zero, not as a sale', async () => {
    products = [
      product({ id: 'sold', soldCount: 4, isBestseller: true }),
      product({ id: 'legacy', isBestseller: true }),
    ];
    await mount();
    expect(fixture.componentInstance.bestSellers().map((p) => p.id)).toEqual(['sold', 'legacy']);
    expect(fixture.componentInstance.soldOf(fixture.componentInstance.all()[1])).toBe(0);
  });

  it('breaks sales ties on reviews, then name, so the order is stable', async () => {
    products = [
      product({ id: 'z', name: 'Zebra Tee', soldCount: 5, isBestseller: true }),
      product({ id: 'a', name: 'Alpha Tee', soldCount: 5, isBestseller: true }),
    ];
    reviews = { z: [{ rating: 5, comment: null }, { rating: 4, comment: null }] };
    await mount();
    // `z` has more reviews, so it outranks `a` despite the identical sales count.
    expect(fixture.componentInstance.bestSellers().map((p) => p.id)).toEqual(['z', 'a']);
  });

  it('shows the stars first, then the real purchase count beside them', async () => {
    products = [product({ id: 'sold', name: 'Sold Tee', soldCount: 42, isBestseller: true })];
    reviews = {
      sold: [
        { rating: 5, comment: null },
        { rating: 4, comment: null },
        { rating: 4, comment: null },
        { rating: 3, comment: null },
      ],
    };
    await mount();
    const card = element.querySelector('.m-row3 app-product-card')!;
    const line = card.querySelector('.stars-line')!;
    // 4.0 average renders as four filled stars plus one outline.
    expect(line.querySelector('.stars')?.textContent?.trim()).toBe('★★★★☆');
    expect(line.querySelector('.stars-sold')?.textContent?.trim()).toBe('(42)');
    // The user asked for the count to sit right after the stars: it must come
    // after them in reading order as well as visually.
    const spans = [...line.querySelectorAll('span')].map((s) => s.textContent?.trim());
    expect(spans).toEqual(['★★★★☆', '(42)']);
  });

  it('shows muted unrated stars and the real count, never a made-up score', async () => {
    products = [product({ id: 'sold', soldCount: 5, isBestseller: true })];
    await mount();
    const line = element.querySelector('.stars-line')!;
    // No reviews, so five muted stars and no invented average or review count.
    expect(line.querySelector('.no-reviews-stars')?.textContent?.trim()).toBe('☆☆☆☆☆');
    expect(line.querySelector('.stars-sold')?.textContent?.trim()).toBe('(5)');
    // The only number in the row is the real paid order count in its parentheses.
    expect(line.textContent).toContain('(5)');
  });

  it('labels the third rail Best Sellers', async () => {
    products = [product({ id: 'sold', soldCount: 4, isBestseller: true })];
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

  it('shows the product photo, else a variant photo, else the one placeholder', async () => {
    products = [
      product({ id: 'withprimary', primaryImageUrl: 'https://cdn.test/primary.png', variants: withImage('https://cdn.test/variant.png') }),
      product({ id: 'withimg', variants: withImage('https://cdn.test/real.png') }),
      product({ id: 'noimg', variants: withImage(null) }),
    ];
    await mount();
    // The rail and every card now read through the shared hierarchy.
    expect(productImage(products[0])).toBe('https://cdn.test/primary.png');
    expect(productImage(products[1])).toBe('https://cdn.test/real.png');
    expect(productImage(products[2])).toBe(PRODUCT_PLACEHOLDER);
    // No grid-position fallback assets remain — anything without a real photo
    // gets the single placeholder, nothing "by index".
    expect(fixture.componentInstance.categories().find((c) => c.name === 'tops')?.image).toBe(
      'https://cdn.test/primary.png',
    );
  });

  it('shows an honest empty state instead of placeholder tiles', async () => {
    await mount();
    const empties = [...element.querySelectorAll('.m-empty')].map((n) => n.textContent?.trim());
    // Nothing was flagged for the rail, so Best Sellers must say so rather than
    // invent a rail out of products the seller never chose.
    expect(empties).toContain('Nothing flagged yet — check back after the first drop.');
    expect(fixture.componentInstance.bestSellers().length).toBe(0);
  });
});