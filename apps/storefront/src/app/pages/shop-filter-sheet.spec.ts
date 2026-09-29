import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService, Product } from '../api.service';
import { ShopPage } from './shop.page';

/**
 * The four behaviours the sheet must hold: the count moves without the grid
 * moving, dismissing throws pending away, applying writes the URL and the grid
 * agrees with the number that was on the button, and a zero-match selection
 * cannot be applied.
 *
 * ApiService is mocked; nothing here touches the network.
 */
describe('ShopPage — filter bottom sheet', () => {
  let fixture: ComponentFixture<ShopPage>;
  let page: ShopPage;
  let router: Router;

  const variant = (size: string, colour: string) => ({
    id: `v-${size}-${colour}`,
    sku: `SKU-${size}-${colour}`,
    size,
    colour,
    priceOverride: null,
    imageUrl: null,
    availabilityStatus: 'in_stock',
  });

  const product = (id: string, name: string, price: number, vs: Array<[string, string]>): Product =>
    ({
      id,
      name,
      description: null,
      category: 'tops',
      basePrice: price,
      collection: { id: 'c1', name: 'Drop 04' },
      createdAt: '2026-09-01T00:00:00.000Z',
      variants: vs.map(([s, c]) => variant(s, c)),
    }) as Product;

  // 3 products: two have size M, one is black, one is expensive.
  const PRODUCTS: Product[] = [
    product('p1', 'Box Tee', 9000, [['M', 'black']]),
    product('p2', 'Jogger', 18000, [['M', 'sand']]),
    product('p3', 'Suit', 185000, [['L', 'charcoal']]),
  ];

  const grid = (): number =>
    fixture.nativeElement.querySelectorAll('app-product-card').length as number;
  const applyButton = (): HTMLButtonElement | null =>
    fixture.nativeElement.querySelector('.sheet-apply');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShopPage],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            products: () => of({ data: PRODUCTS, total: PRODUCTS.length }),
            reviews: () => of({ data: [] }),
          },
        },
        {
          // Angular's ParamMap returns null for a missing key; a bare Map
          // returns undefined, which is not the contract the page codes to.
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: () => null, has: () => false, getAll: () => [], keys: [] },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShopPage);
    page = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('toggling a size updates the count without touching the grid', async () => {
    expect(grid()).toBe(3);
    page.openSheet();
    fixture.detectChanges();

    const sheet = fixture.debugElement.children.find((c) => c.name === 'app-filter-sheet');
    sheet!.componentInstance.toggle('size', 'M');
    fixture.detectChanges();

    // Two products carry size M, so the button offers 2 …
    expect(applyButton()!.textContent).toContain('Show 2 pieces');
    // … while the grid behind is untouched.
    expect(grid()).toBe(3);
    expect(page.appliedFilters().size).toBeNull();
  });

  it('dismissing discards pending changes', () => {
    page.openSheet();
    fixture.detectChanges();
    const sheet = fixture.debugElement.children.find((c) => c.name === 'app-filter-sheet');
    sheet!.componentInstance.toggle('size', 'M');
    fixture.detectChanges();

    page.closeSheet();
    fixture.detectChanges();

    expect(page.appliedFilters().size).toBeNull();
    expect(grid()).toBe(3);

    // Re-opening starts from applied, not from the discarded pending set.
    page.openSheet();
    fixture.detectChanges();
    const reopened = fixture.debugElement.children.find((c) => c.name === 'app-filter-sheet');
    expect(reopened!.componentInstance.pending().size).toBeNull();
  });

  it('applying writes the URL and the grid matches the count shown on the button', async () => {
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    page.openSheet();
    fixture.detectChanges();
    const sheet = fixture.debugElement.children.find((c) => c.name === 'app-filter-sheet');
    sheet!.componentInstance.toggle('size', 'M');
    fixture.detectChanges();

    const promised = Number(applyButton()!.textContent!.match(/Show (\d+)/)![1]);
    sheet!.componentInstance.commit();
    fixture.detectChanges();

    expect(grid()).toBe(promised);
    expect(page.appliedFilters().size).toBe('M');
    expect(navigate).toHaveBeenCalled();
    const params = (navigate.calls.mostRecent().args[1] as { queryParams: Record<string, unknown> })
      .queryParams;
    expect(params['size']).toBe('M');
    // The sheet closes on apply.
    expect(page.sheetOpen()).toBeFalse();
  });

  it('a zero-match selection disables the button', () => {
    page.openSheet();
    fixture.detectChanges();
    const sheet = fixture.debugElement.children.find((c) => c.name === 'app-filter-sheet');
    // Size L exists only on the charcoal suit, so L + black matches nothing.
    sheet!.componentInstance.toggle('size', 'L');
    sheet!.componentInstance.toggle('colour', 'black');
    fixture.detectChanges();

    const btn = applyButton()!;
    expect(btn.disabled).toBeTrue();
    expect(btn.textContent).toContain('No pieces match');
    expect(fixture.nativeElement.querySelector('.sheet-zero')).toBeTruthy();

    // And it cannot be applied even if something calls it directly.
    sheet!.componentInstance.commit();
    fixture.detectChanges();
    expect(page.appliedFilters().size).toBeNull();
  });
});
