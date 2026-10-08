import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService, Product } from '../api.service';
import { BrandAlertService } from '../brand-alert.service';
import { CartService } from '../cart.service';
import { PRODUCT_PLACEHOLDER } from '../product-image';
import { ShopPage } from './shop.page';

/**
 * Phase 2 PLP tests for the three controls added to match the reference: the
 * circular sub-category rail, the Sort/Filter toolbar, and the grid/list toggle.
 *
 * The rails must stay projections of real catalogue data, so the ordering and
 * filtering assertions here guard the two ways a redesign could quietly start
 * lying: inventing a category the API never sent, or ranking by a number that
 * is not real sales.
 */
describe('ShopPage', () => {
  let fixture: ComponentFixture<ShopPage>;
  let element: HTMLElement;
  let products: Product[];

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
      // No soldCount by default so tests opt into sales data deliberately.
      ...over,
    }) as Product;

  const variant = (over: Partial<{ imageUrl: string | null }> = {}) => [
    {
      id: 'v1',
      sku: 'S1',
      size: 'OS',
      colour: null,
      priceOverride: null,
      imageUrl: null,
      availabilityStatus: 'in_stock',
      ...over,
    },
  ];

  const mount = async (): Promise<void> => {
    TestBed.configureTestingModule({
      imports: [ShopPage],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            products: () => of({ data: products, total: products.length }),
            reviews: () => of({ data: [], total: 0 }),
          },
        },
        { provide: CartService, useValue: { count: 0, add: () => undefined } },
        { provide: BrandAlertService, useValue: { toast: () => Promise.resolve() } },
      ],
    });
    fixture = TestBed.createComponent(ShopPage);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    products = [
      product({ id: 'a', name: 'A Tee', category: 'tops', soldCount: 3 }),
      product({ id: 'b', name: 'B Tee', category: 'tops', soldCount: 12 }),
      product({ id: 'c', name: 'C Trouser', category: 'bottoms', soldCount: 7 }),
    ];
  });

  describe('sub-category rail', () => {
    it('renders an All pill plus one pill per real category', async () => {
      await mount();
      const pills = [...element.querySelectorAll('.pill--circle')];
      expect(pills.length).toBe(3);
      expect(pills[0].querySelector('.pill__label')?.textContent?.trim()).toBe('All');
      expect([...pills].map((p) => p.querySelector('.pill__label')?.textContent?.trim())).toEqual([
        'All',
        'Tops',
        'Bottoms',
      ]);
    });

    it('shows no audience or sub-type the catalogue never sent', async () => {
      await mount();
      const labels = element.querySelector('.pill-bar--circles')?.textContent ?? '';
      // The reference lists 2-Piece Sets / T-Shirts / Underwear. Product.category
      // is a single free-text field and cannot prove those, so they stay out.
      expect(labels).not.toContain('Women');
      expect(labels).not.toContain('Men');
      expect(labels).not.toContain('Underwear');
    });

    it('filters the grid when a pill is chosen, and All restores it', async () => {
      await mount();
      const c = fixture.componentInstance;
      expect(c.filtered().length).toBe(3);

      c.category.set('bottoms');
      fixture.detectChanges();
      expect(c.filtered().map((p) => p.id)).toEqual(['c']);

      c.category.set(null);
      fixture.detectChanges();
      expect(c.filtered().length).toBe(3);
    });

    it('gives each pill circle a real photo from that category', async () => {
      products = [
        product({ id: 'a', category: 'tops', variants: variant({ imageUrl: 'https://cdn.test/t.png' }) }),
        product({ id: 'b', category: 'bottoms', variants: variant() }),
      ];
      await mount();
      const c = fixture.componentInstance;
      expect(c.categoryImage('tops')).toBe('https://cdn.test/t.png');
      // No product photo anywhere, so the one shared placeholder stands in —
      // never a colour swatch, and never a photo keyed to a grid slot.
      expect(c.categoryImage('bottoms')).toBe(PRODUCT_PLACEHOLDER);
    });

    it('uses the shared placeholder for a category with no products yet', async () => {
      await mount();
      expect(fixture.componentInstance.categoryImage('nope')).toBe(PRODUCT_PLACEHOLDER);
    });

    it('marks the active pill for assistive tech as well as visually', async () => {
      await mount();
      const c = fixture.componentInstance;
      c.category.set('tops');
      fixture.detectChanges();
      const active = [...element.querySelectorAll('.pill--circle')].filter(
        (p) => p.getAttribute('aria-pressed') === 'true',
      );
      expect(active.length).toBe(1);
      expect(active[0].querySelector('.pill__label')?.textContent?.trim()).toBe('Tops');
    });
  });

  describe('sort / filter toolbar', () => {
    it('offers best selling as a sort option', async () => {
      await mount();
      const values = [...element.querySelectorAll('select option')].map((o) =>
        o.getAttribute('value'),
      );
      expect(values).toContain('best-selling');
    });

    it('keeps the native select as the real control for accessibility', async () => {
      await mount();
      const select = element.querySelector('.tbtn select') as HTMLSelectElement | null;
      expect(select).not.toBeNull();
      expect(select?.getAttribute('aria-label')).toBe('Sort products');
    });

    it('sorts by best selling using real sales, highest first', async () => {
      await mount();
      const c = fixture.componentInstance;
      c.sort.set('best-selling');
      expect(c.filtered().map((p) => p.id)).toEqual(['b', 'c', 'a']);
    });

    it('treats a missing soldCount as zero so it never outranks a real sale', async () => {
      products = [
        product({ id: 'nosold', name: 'No Count Tee' }),
        product({ id: 'sold', name: 'Sold Tee', soldCount: 1 }),
      ];
      await mount();
      fixture.componentInstance.sort.set('best-selling');
      expect(fixture.componentInstance.filtered().map((p) => p.id)).toEqual(['sold', 'nosold']);
    });

    it('exposes the filter button as a dialog trigger', async () => {
      await mount();
      const btn = element.querySelector('.tbtn[filtersBtn], button[aria-haspopup="dialog"]');
      expect(btn?.getAttribute('aria-expanded')).toBe('false');
    });

    it('opens the filter sheet on demand', async () => {
      await mount();
      fixture.componentInstance.openSheet();
      fixture.detectChanges();
      expect(fixture.componentInstance.sheetOpen()).toBe(true);
    });
  });

  describe('view toggle', () => {
    it('defaults to the reference grid view', async () => {
      await mount();
      expect(fixture.componentInstance.view()).toBe('grid');
      const grid = element.querySelector('.grid');
      expect(grid?.classList.contains('grid--list')).toBe(false);
    });

    it('switches to one-piece-per-row list view', async () => {
      await mount();
      const c = fixture.componentInstance;
      c.view.set('list');
      fixture.detectChanges();
      expect(element.querySelector('.grid')?.classList.contains('grid--list')).toBe(true);
    });

    it('marks exactly one toggle as pressed for screen readers', async () => {
      await mount();
      const c = fixture.componentInstance;
      c.view.set('list');
      fixture.detectChanges();
      const pressed = [...element.querySelectorAll('.vt-btn')].filter(
        (b) => b.getAttribute('aria-pressed') === 'true',
      );
      expect(pressed.length).toBe(1);
      expect(pressed[0].getAttribute('aria-label')).toBe('List view');
    });

    it('names both toggles so neither is an unlabelled icon', async () => {
      await mount();
      const labels = [...element.querySelectorAll('.vt-btn')].map((b) => b.getAttribute('aria-label'));
      expect(labels).toEqual(['Two column grid', 'List view']);
    });

    it('does not change which products are shown, only their layout', async () => {
      await mount();
      const c = fixture.componentInstance;
      const before = c.filtered().map((p) => p.id);
      c.view.set('list');
      expect(c.filtered().map((p) => p.id)).toEqual(before);
    });
  });
});