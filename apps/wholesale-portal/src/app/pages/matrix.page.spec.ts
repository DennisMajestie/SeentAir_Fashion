import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { SeCurrencyService } from '@seentair/ui';
import { of } from 'rxjs';

import { ApiService, Pricing, PricingProduct } from '../api.service';
import { CartService } from '../cart.service';
import { MatrixPage } from './matrix.page';

function variant(
  id: string,
  size: string,
  colour: string,
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

const PRODUCT: PricingProduct = {
  id: 'p1',
  name: 'Aba Cargo',
  category: 'trousers',
  imageUrl: null,
  retailPrice: 9000,
  wholesalePrice: 7650,
  variants: [
    variant('v1', 'S', 'black'),
    variant('v2', 'M', 'black'),
    variant('v3', 'S', 'sand'),
    variant('v4', 'M', 'sand', { availabilityStatus: 'made_to_order' }),
  ],
};

const PRICING: Pricing = {
  tier: { name: 'Standard', discountPercent: 15 },
  hasDiscount: true,
  moq: 20,
  total: 1,
  data: [PRODUCT],
};

describe('MatrixPage', () => {
  let fixture: ComponentFixture<MatrixPage>;
  let page: MatrixPage;
  let cart: CartService;
  let api: jasmine.SpyObj<ApiService>;
  let router: Router;

  async function boot(
    stock: Record<string, number | null> = {},
    id = 'p1',
    seed: Parameters<CartService['add']>[0] = [],
  ): Promise<void> {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['pricing', 'stock']);
    api.pricing.and.returnValue(of(PRICING));
    api.stock.and.returnValue(of(stock));
    await TestBed.configureTestingModule({
      imports: [MatrixPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id }) } },
        },
      ],
    }).compileComponents();
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    cart = TestBed.inject(CartService);
    cart.clear();
    cart.add(seed);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(MatrixPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => (el().textContent ?? '').replace(/\s+/g, ' ');
  const inputs = () => el().querySelectorAll<HTMLInputElement>('table input');

  it('renders a colour × size grid from the variants with scoped headers', async () => {
    await boot();
    expect(page.sizes()).toEqual(['S', 'M']);
    expect(page.colours()).toEqual(['black', 'sand']);
    expect(el().querySelectorAll('thead th[scope="col"]').length).toBe(4);
    expect(el().querySelectorAll('tbody th[scope="row"]').length).toBe(2);
    expect(inputs().length).toBe(4);
    const first = inputs()[0];
    expect(first.getAttribute('type')).toBe('number');
    expect(first.getAttribute('min')).toBe('0');
    expect(first.getAttribute('inputmode')).toBe('numeric');
    expect(first.getAttribute('aria-label')).toBe('black size S');
    expect(api.stock).toHaveBeenCalledWith(['v1', 'v2', 'v3', 'v4']);
  });

  it('shows product facts and the MOQ rule in plain words', async () => {
    await boot();
    expect(text()).toContain('₦7,650.00 per unit');
    expect(text()).toContain('20 units across the batch');
    expect(text()).toContain('20-unit minimum per batch');
  });

  it('keeps a running total in units and money and warns about the shortfall', async () => {
    await boot();
    page.setQty('v1', 6);
    page.setQty('v3', 4);
    fixture.detectChanges();
    expect(page.formUnits()).toBe(10);
    expect(page.formAmount()).toBe(76500);
    expect(page.moqShort()).toBe(10);
    expect(text()).toContain('10 more units to reach the minimum');
    expect(text()).toContain('₦76,500.00');
    // A shortfall is a warning, never a block.
    const add = el().querySelector<HTMLButtonElement>('.se-form__actions button[seButton]')!;
    expect(add.disabled).toBe(false);
  });

  it('counts other products in the draft toward the MOQ', async () => {
    await boot();
    cart.add([
      {
        variantId: 'x1',
        productId: 'p9',
        productName: 'Other',
        sku: 'SKU-x1',
        size: 'M',
        colour: 'sand',
        unitPrice: 5000,
        quantity: 15,
      },
    ]);
    page.setQty('v1', 5);
    fixture.detectChanges();
    expect(page.committedUnits()).toBe(20);
    expect(page.moqShort()).toBe(0);
    expect(text()).toContain('MOQ met');
    expect(el().querySelector('se-banner')).toBeNull();
  });

  it('shows stock per cell, caps the input, and never caps made-to-order', async () => {
    await boot({ v1: 40, v2: 0, v3: 12, v4: 0 });
    expect(inputs()[0].getAttribute('max')).toBe('40');
    expect(text()).toContain('40 in stock');
    expect(text()).toContain('None in stock');
    page.setQty('v1', 999);
    expect(page.qtyOf('v1')).toBe(40);
    page.setQty('v2', 5);
    expect(page.qtyOf('v2')).toBe(0);
    expect(inputs()[3].getAttribute('max')).toBeNull();
    page.setQty('v4', 25);
    expect(page.qtyOf('v4')).toBe(25);
    page.setQty('v1', -3);
    expect(page.qtyOf('v1')).toBe(0);
  });

  it('writes the right lines to the cart and goes to the cart', async () => {
    await boot();
    page.setQty('v1', 3);
    page.setQty('v4', 2);
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.se-form__actions button[seButton]')!.click();
    fixture.detectChanges();
    expect(cart.lines()).toEqual([
      jasmine.objectContaining({
        variantId: 'v1',
        productId: 'p1',
        productName: 'Aba Cargo',
        sku: 'SKU-v1',
        size: 'S',
        colour: 'black',
        unitPrice: 7650,
        quantity: 3,
      }),
      jasmine.objectContaining({ variantId: 'v4', quantity: 2 }),
    ]);
    expect(cart.units()).toBe(5);
    expect(router.navigate).toHaveBeenCalledWith(['/cart']);
  });

  it('seeds the grid from existing draft lines for this product', async () => {
    await boot({}, 'p1', [
      {
        variantId: 'v2',
        productId: 'p1',
        productName: 'Aba Cargo',
        sku: 'SKU-v2',
        size: 'M',
        colour: 'black',
        unitPrice: 7650,
        quantity: 7,
      },
    ]);
    expect(page.qtyOf('v2')).toBe(7);
    expect(inputs()[1].value).toBe('7');
  });

  it('shows an empty state when the product is not in the catalogue', async () => {
    await boot({}, 'missing');
    expect(el().querySelector('table')).toBeNull();
    expect(el().querySelector('se-empty-state')!.textContent).toContain('not in your catalogue');
  });
});
