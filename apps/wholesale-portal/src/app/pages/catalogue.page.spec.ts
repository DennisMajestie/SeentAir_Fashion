import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';

import { ApiService, Pricing, PricingProduct } from '../api.service';
import { CartService } from '../cart.service';
import { CataloguePage } from './catalogue.page';

/**
 * The pricing display rules (strike-through and badge only on a real
 * discount), the apply-for-account path, the MOQ warning against the shared
 * cart, availability, and the filters.
 */

function variant(
  id: string,
  size: string | null,
  colour: string | null,
  over: Partial<PricingProduct['variants'][number]> = {},
) {
  return {
    id,
    sku: `SKU-${id}`,
    size,
    colour,
    imageUrl: null,
    availabilityStatus: 'in_stock' as const,
    retailPrice: 9000,
    wholesalePrice: 7650,
    ...over,
  };
}

function product(over: Partial<PricingProduct> = {}): PricingProduct {
  return {
    id: 'p1',
    name: 'Aba Cargo',
    category: 'trousers',
    imageUrl: 'https://cdn.example/cargo.jpg',
    retailPrice: 9000,
    wholesalePrice: 7650,
    variants: [
      variant('v1', 'S', 'black'),
      variant('v2', 'M', 'black'),
      variant('v3', 'L', 'black'),
    ],
    ...over,
  };
}

function pricing(over: Partial<Pricing> = {}): Pricing {
  return {
    tier: { name: 'Standard', discountPercent: 15 },
    hasDiscount: true,
    moq: 20,
    total: 2,
    data: [
      product(),
      product({
        id: 'p2',
        name: 'Woven Shirt',
        category: 'tops',
        imageUrl: null,
        variants: [variant('w1', 'M', 'sand'), variant('w2', 'L', 'sand')],
      }),
    ],
    ...over,
  };
}

describe('CataloguePage', () => {
  let fixture: ComponentFixture<CataloguePage>;
  let component: CataloguePage;
  let cart: CartService;
  let api: jasmine.SpyObj<ApiService>;

  async function boot(payload: Pricing | Error = pricing()): Promise<void> {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['pricing', 'applyForAccount', 'stock']);
    api.pricing.and.returnValue(payload instanceof Error ? throwError(() => payload) : of(payload));
    api.applyForAccount.and.returnValue(of({} as never));
    api.stock.and.returnValue(of({}));
    await TestBed.configureTestingModule({
      imports: [CataloguePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ApiService, useValue: api },
      ],
    }).compileComponents();
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    cart = TestBed.inject(CartService);
    cart.clear();
    fixture = TestBed.createComponent(CataloguePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const cards = () => el().querySelectorAll('se-card');
  const text = () => (el().textContent ?? '').replace(/\s+/g, ' ');

  describe('product cards', () => {
    it('renders one card per product with an "Order in bulk" link to the matrix', async () => {
      await boot();
      expect(cards().length).toBe(2);
      const links = el().querySelectorAll<HTMLAnchorElement>('a.product__cta');
      expect(links.length).toBe(2);
      expect(links[0].textContent).toContain('Order in bulk');
      expect(links[0].getAttribute('href')).toBe('/catalogue/p1/matrix');
    });

    it('shows the image when provided and a no-image state otherwise', async () => {
      await boot();
      const img = cards()[0].querySelector('img')!;
      expect(img.getAttribute('src')).toBe('https://cdn.example/cargo.jpg');
      expect(img.getAttribute('alt')).toBe('');
      expect(cards()[1].querySelector('img')).toBeNull();
      expect(cards()[1].textContent).toContain('No image yet');
    });

    it('shows product-level availability as a stock status', async () => {
      await boot(
        pricing({
          data: [
            product({
              variants: [
                variant('v1', 'S', 'black', { availabilityStatus: 'out_of_stock' }),
                variant('v2', 'M', 'black', { availabilityStatus: 'made_to_order' }),
              ],
            }),
          ],
        }),
      );
      expect(component.availability(component.pricing()!.data[0])).toBe('made_to_order');
      expect(cards()[0].querySelector('se-status')!.textContent).toContain('Made to order');
    });
  });

  describe('pricing display rules', () => {
    it('shows the wholesale price, the retail strike and the discount badge on a real discount', async () => {
      await boot();
      const price = cards()[0].querySelector('.product__price')!;
      expect(price.querySelector('strong')!.textContent).toContain('7,650.00');
      expect(price.querySelector('s')!.textContent).toContain('9,000.00');
      expect(price.querySelector('se-badge')!.textContent).toContain('15% off retail');
    });

    it('hides the strike and never shows 0% when wholesale equals retail', async () => {
      await boot(
        pricing({ hasDiscount: false, tier: null, data: [product({ wholesalePrice: 9000 })] }),
      );
      const price = cards()[0].querySelector('.product__price')!;
      expect(price.querySelector('s')).toBeNull();
      expect(price.querySelector('se-badge')!.textContent).toContain('At retail');
      expect(text()).not.toContain('0% off');
    });

    it('formats money through the currency service, not a literal', async () => {
      await boot();
      expect(text()).toContain('₦');
      expect(component.discountPct()).toBe(15);
    });
  });

  describe('apply for a wholesale account', () => {
    it('shows the apply card instead of the catalogue when pricing is refused', async () => {
      await boot(Object.assign(new Error('forbidden'), { status: 403 }));
      expect(component.needsAccount()).toBe(true);
      expect(text()).toContain('Wholesale account required');
      expect(cards().length).toBe(1);
      expect(el().querySelector('a.product__cta')).toBeNull();
    });

    it('calls applyForAccount and shows the pending state', async () => {
      await boot(Object.assign(new Error('forbidden'), { status: 401 }));
      el().querySelector<HTMLButtonElement>('se-card button')!.click();
      fixture.detectChanges();
      expect(api.applyForAccount).toHaveBeenCalledTimes(1);
      expect(component.applied()).toBe(true);
      expect(text()).toContain('Application submitted');
    });

    it('treats any other failure as a load error with a retry, not the apply path', async () => {
      await boot(Object.assign(new Error('down'), { status: 500 }));
      expect(component.needsAccount()).toBe(false);
      const banner = el().querySelector('se-banner')!;
      expect(banner.textContent).toContain('could not be loaded');
      expect(banner.textContent).toContain('Try again');
      expect(el().querySelector('se-empty-state')).toBeNull();
    });
  });

  describe('MOQ against the shared cart', () => {
    it('reads the MOQ from the API and states it in the description', async () => {
      await boot(pricing({ moq: 35 }));
      expect(component.moq()).toBe(35);
      expect(text()).toContain('Minimum order 35 units');
    });

    it('warns about the shortfall when the cart is below the MOQ', async () => {
      await boot();
      cart.add([
        {
          variantId: 'v1',
          productId: 'p1',
          productName: 'Aba Cargo',
          sku: 'SKU-v1',
          size: 'S',
          colour: 'black',
          unitPrice: 7650,
          quantity: 12,
        },
      ]);
      fixture.detectChanges();
      expect(component.moqShort()).toBe(8);
      expect(component.moqMet()).toBe(false);
      expect(text()).toContain('8 more units to reach the 20-unit minimum');
      expect(text()).toContain('Review bulk order (12)');
    });

    it('shows no warning at or above the MOQ, or with an empty cart', async () => {
      await boot();
      expect(el().querySelector('se-banner')).toBeNull();
      cart.add([
        {
          variantId: 'v1',
          productId: 'p1',
          productName: 'Aba Cargo',
          sku: 'SKU-v1',
          size: 'S',
          colour: 'black',
          unitPrice: 7650,
          quantity: 20,
        },
      ]);
      fixture.detectChanges();
      expect(component.moqMet()).toBe(true);
      expect(el().querySelector('se-banner')).toBeNull();
    });
  });

  describe('search and category filter', () => {
    it('filters by name', async () => {
      await boot();
      component.query.set('shirt');
      fixture.detectChanges();
      expect(cards().length).toBe(1);
      expect(cards()[0].textContent).toContain('Woven Shirt');
    });

    it('filters by SKU', async () => {
      await boot();
      component.query.set('SKU-w2');
      fixture.detectChanges();
      expect(cards().length).toBe(1);
    });

    it('filters by category with counts in the options', async () => {
      await boot();
      expect(component.filters()[0].options).toEqual([
        { value: 'trousers', label: 'trousers (1)' },
        { value: 'tops', label: 'tops (1)' },
      ]);
      component.filterValue.set({ category: 'tops' });
      fixture.detectChanges();
      expect(cards().length).toBe(1);
      expect(cards()[0].textContent).toContain('Woven Shirt');
    });

    it('shows an empty state with a clear action when nothing matches', async () => {
      await boot();
      component.query.set('zzzz');
      fixture.detectChanges();
      expect(cards().length).toBe(0);
      const empty = el().querySelector('se-empty-state')!;
      expect(empty.textContent).toContain('No products match');
      empty.querySelector<HTMLButtonElement>('button')!.click();
      fixture.detectChanges();
      expect(component.query()).toBe('');
      expect(cards().length).toBe(2);
    });
  });
});
