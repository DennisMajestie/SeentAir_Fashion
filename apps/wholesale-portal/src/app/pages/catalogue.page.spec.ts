import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { CataloguePage } from './catalogue.page';
import { ApiService, Pricing, PricingProduct } from '../api.service';
import { CartService } from '../cart.service';

/**
 * Phase 1 proof: the collapse/expand pattern, data-derived ladder and column
 * counts, quantity handling, and the pricing-badge fix.
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
  let http: HttpTestingController;
  let cart: CartService;
  /** Derived stock the fake ApiService returns; override per test. */
  let stockPayload: Record<string, number | null> | null;

  beforeEach(() => {
    stockPayload = {};
  });

  /** Mount with a given pricing payload and resolve it. */
  async function boot(payload: Pricing = pricing()): Promise<void> {
    TestBed.configureTestingModule({
      imports: [CataloguePage, RouterTestingModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ApiService,
          useValue: {
            pricing: () => of(payload),
            applyForAccount: () => of({}),
            // Derived stock is optional context: an empty map leaves every
            // input uncapped, which is the "stock unknown" path.
            stock: () => of(stockPayload ?? {}),
          },
        },
      ],
    });
    cart = TestBed.inject(CartService);
    cart.clear();
    fixture = TestBed.createComponent(CataloguePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    http = TestBed.inject(HttpTestingController);
  }

  const rows = () => fixture.debugElement.queryAll(By.css('.prodrow'));
  const heads = () => fixture.debugElement.queryAll(By.css('.pr-head'));
  const text = () => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');

  afterEach(() => {
    http?.verify();
  });

  describe('collapse / expand pattern', () => {
    it('renders every product collapsed by default', async () => {
      await boot();
      expect(rows().length).toBe(2);
      expect(component.openIds().size).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('.pr-panel').length).toBe(0);
    });

    it('expands one row in place and wires aria-expanded + aria-controls', async () => {
      await boot();
      heads()[0].nativeElement.click();
      fixture.detectChanges();

      expect(component.isOpen('p1')).toBe(true);
      const head = fixture.nativeElement.querySelector('.pr-head') as HTMLButtonElement;
      expect(head.getAttribute('aria-expanded')).toBe('true');
      const panelId = head.getAttribute('aria-controls')!;
      const panel = document.getElementById(panelId);
      expect(panel).toBeTruthy();
      expect(panel!.classList.contains('pr-panel')).toBe(true);
    });

    it('expanding a second row does not expand the first', async () => {
      await boot();
      heads()[0].nativeElement.click();
      fixture.detectChanges();
      heads()[1].nativeElement.click();
      fixture.detectChanges();

      expect(component.isOpen('p1')).toBe(false);
      expect(component.isOpen('p2')).toBe(true);
      expect(fixture.nativeElement.querySelectorAll('.pr-panel').length).toBe(1);
    });

    it('collapses an already-open row on a second click', async () => {
      await boot();
      heads()[0].nativeElement.click();
      fixture.detectChanges();
      heads()[0].nativeElement.click();
      fixture.detectChanges();

      expect(component.isOpen('p1')).toBe(false);
      expect(fixture.nativeElement.querySelectorAll('.pr-panel').length).toBe(0);
    });

    it('uses a real button element, so it is keyboard reachable', async () => {
      await boot();
      expect(fixture.nativeElement.querySelector('.pr-head').tagName).toBe('BUTTON');
    });
  });

  describe('pricing ladder is built from real data', () => {
    it('labels the tier band with the configured MOQ, not a hardcoded 20', async () => {
      await boot();
      const range = fixture.nativeElement.querySelector('.lad.mine .lad-range').textContent;
      expect(range).toContain('20+');
    });

    it('reflects a different MOQ value from the API', async () => {
      await boot(pricing({ moq: 40 }));
      expect(fixture.nativeElement.querySelector('.lad.mine .lad-range').textContent).toContain(
        '40+',
      );
    });

    it('labels volume pricing as a desk quote rather than inventing a price', async () => {
      await boot();
      const quote = fixture.nativeElement.querySelector('.lad:last-child');
      expect(quote.textContent).toContain('Volume');
      expect(quote.textContent).toContain('Desk quote');
      // No fabricated naira figure in the quote band.
      expect(quote.querySelector('.lad-price').textContent).not.toContain('₦');
    });

    it('shows a single flat band when the account has no discount', async () => {
      await boot(pricing({ hasDiscount: false, tier: null }));
      // Scope to the first row: there are two products in the fixture.
      const bands = rows()[0].nativeElement.querySelectorAll('.lad');
      expect(bands.length).toBe(2);
      expect(rows()[0].nativeElement.querySelector('.lad.mine .lad-price').textContent).toContain(
        'Flat rate',
      );
    });
  });

  describe('pricing badge / retail comparison', () => {
    it('shows the retail strike and discount badge when a real discount exists', async () => {
      await boot();
      const s = fixture.nativeElement.querySelector('.pr-price s');
      expect(s).toBeTruthy();
      expect(s.textContent).toContain('9,000');
      const badge = fixture.nativeElement.querySelector('.margin');
      expect(badge.textContent).toContain('15% off retail');
      expect(badge.classList.contains('at-retail')).toBe(false);
    });

    it('hides the strike and the discount badge when wholesale equals retail', async () => {
      // This is the "-0% vs retail" bug: no tier, so the prices are identical.
      await boot(
        pricing({ hasDiscount: false, tier: null, data: [product({ wholesalePrice: 9000 })] }),
      );
      expect(fixture.nativeElement.querySelector('.pr-price s')).toBeNull();
      const badge = fixture.nativeElement.querySelector('.margin');
      expect(badge.textContent).toContain('At retail');
      expect(badge.textContent).not.toContain('0%');
      expect(badge.classList.contains('at-retail')).toBe(true);
    });

    it('never renders a 0% discount badge', async () => {
      await boot(pricing({ hasDiscount: false, tier: null }));
      expect(text()).not.toContain('-0%');
      expect(text()).not.toContain('0% off');
    });
  });

  describe('thumbnails', () => {
    it('renders the product image when the API provides one', async () => {
      await boot();
      const img = fixture.nativeElement.querySelector('.pr-thumb img') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe('https://cdn.example/cargo.jpg');
      // Decorative: the row button already names the product.
      expect(img.getAttribute('alt')).toBe('');
    });

    it('falls back to a no-image state rather than a broken image', async () => {
      await boot();
      const secondThumb = rows()[1].nativeElement.querySelector('.pr-thumb');
      expect(secondThumb.querySelector('img')).toBeNull();
      expect(secondThumb.querySelector('.material-symbols-outlined')).toBeTruthy();
    });
  });

  describe('quantity grid derives its columns from variant data', () => {
    it('uses the distinct size labels, not a hardcoded three', async () => {
      await boot();
      expect(component.columns(component.pricing()!.data[0])).toEqual(['S', 'M', 'L']);
      // The grid header only renders inside an expanded row.
      heads()[0].nativeElement.click();
      fixture.detectChanges();
      const cols = fixture.nativeElement.querySelectorAll('.qh-col');
      expect(cols.length).toBe(3);
      expect(cols[0].textContent!.trim()).toBe('S');
    });

    it('derives a two-column header for a product with two variants', async () => {
      await boot();
      heads()[1].nativeElement.click();
      fixture.detectChanges();
      const cols = fixture.nativeElement.querySelectorAll('.pr-panel .qh-col');
      expect(cols.length).toBe(2);
    });

    it('falls back to colour when a variant has no size', async () => {
      await boot();
      const p = product({ variants: [variant('a', null, 'black'), variant('b', null, 'sand')] });
      expect(component.columns(p)).toEqual(['black', 'sand']);
    });

    it('handles a product with a single variant', async () => {
      await boot();
      const p = product({ variants: [variant('only', 'M', 'black')] });
      expect(component.columns(p)).toEqual(['M']);
    });

    it('labels every cell with its size and colour', async () => {
      await boot();
      heads()[0].nativeElement.click();
      fixture.detectChanges();
      const labels = fixture.nativeElement.querySelectorAll('.q-l');
      expect(labels.length).toBe(3);
      expect(labels[0].textContent!.replace(/\s+/g, ' ')).toContain('S · black');
    });
  });

  describe('quantity inputs', () => {
    async function openFirst(): Promise<void> {
      heads()[0].nativeElement.click();
      fixture.detectChanges();
    }

    it('records a typed quantity and updates the running footer total', async () => {
      await boot();
      await openFirst();
      component.setQty('v1', 5);
      fixture.detectChanges();

      expect(component.productUnits(component.pricing()!.data[0])).toBe(5);
      const foot = fixture.nativeElement.querySelector('.foot-units');
      expect(foot.textContent).toContain('5');
    });

    it('totals across variants within the product, not just the last typed', async () => {
      await boot();
      await openFirst();
      component.setQty('v1', 4);
      component.setQty('v2', 6);
      fixture.detectChanges();
      expect(component.productUnits(component.pricing()!.data[0])).toBe(10);
    });

    it('enforces non-negative integers', async () => {
      await boot();
      await openFirst();
      component.setQty('v1', -3);
      expect(component.qtyOf('v1')).toBe(0);
      component.setQty('v1', 2.7);
      expect(component.qtyOf('v1')).toBe(2);
      component.setQty('v1', 'abc');
      expect(component.qtyOf('v1')).toBe(0);
      component.setQty('v1', '');
      expect(component.qtyOf('v1')).toBe(0);
    });

    it('exposes min/step/inputmode so the field is a numeric stepper', async () => {
      await boot();
      await openFirst();
      const input = fixture.nativeElement.querySelector('.qcell input') as HTMLInputElement;
      expect(input.getAttribute('min')).toBe('0');
      expect(input.getAttribute('step')).toBe('1');
      expect(input.getAttribute('inputmode')).toBe('numeric');
      expect(input.getAttribute('type')).toBe('number');
    });

    it('gives every input a 44px minimum tap target', async () => {
      await boot();
      await openFirst();
      const inputs = fixture.nativeElement.querySelectorAll('.qcell input');
      expect(inputs.length).toBe(3);
      const styles = Array.from(inputs).map((i) => {
        const s = (i as HTMLElement).ownerDocument.defaultView!.getComputedStyle(i as HTMLElement);
        return parseFloat(s.minHeight);
      });
      for (const h of styles) expect(h).toBeGreaterThanOrEqual(44);
    });

    it('shows an availability label for non-in-stock variants', async () => {
      await boot(
        pricing({
          data: [
            product({
              variants: [
                variant('v1', 'S', 'black', { availabilityStatus: 'out_of_stock' }),
                variant('v2', 'M', 'black', { availabilityStatus: 'made_to_order' }),
                variant('v3', 'L', 'black'),
              ],
            }),
          ],
        }),
      );
      await openFirst();
      const badges = fixture.nativeElement.querySelectorAll('.avail');
      expect(badges.length).toBe(2);
      expect(badges[0].textContent).toContain('Out of stock');
      expect(badges[1].textContent).toContain('Made to order');
      expect(badges[1].classList.contains('mto')).toBe(true);
    });

    it('shows no availability badge for in-stock variants', async () => {
      await boot();
      await openFirst();
      expect(fixture.nativeElement.querySelectorAll('.avail').length).toBe(0);
    });
  });

  describe('add to bulk order', () => {
    it('stays disabled until the product has units', async () => {
      await boot();
      heads()[0].nativeElement.click();
      fixture.detectChanges();
      const cta = fixture.nativeElement.querySelector('.pr-foot .cta') as HTMLButtonElement;
      expect(cta.disabled).toBe(true);

      component.setQty('v1', 2);
      fixture.detectChanges();
      expect(
        (fixture.nativeElement.querySelector('.pr-foot .cta') as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    it('pushes lines to the shared cart and clears that product inputs', async () => {
      await boot();
      heads()[0].nativeElement.click();
      fixture.detectChanges();
      component.setQty('v1', 3);
      component.setQty('v2', 2);
      fixture.detectChanges();

      (fixture.nativeElement.querySelector('.pr-foot .cta') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(cart.lines().length).toBe(2);
      expect(cart.units()).toBe(5);
      expect(component.qtyOf('v1')).toBe(0);
      expect(component.qtyOf('v2')).toBe(0);
    });

    it('collapses the row after adding, so the list stays scannable', async () => {
      await boot();
      heads()[0].nativeElement.click();
      fixture.detectChanges();
      component.setQty('v1', 3);
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.pr-foot .cta') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(component.isOpen('p1')).toBe(false);
    });
  });

  describe('search and category filters are untouched', () => {
    it('still filters by name', async () => {
      await boot();
      component.query = 'shirt';
      fixture.detectChanges();
      expect(rows().length).toBe(1);
      expect(rows()[0].nativeElement.textContent).toContain('Woven Shirt');
    });

    it('still filters by SKU', async () => {
      await boot();
      component.query = 'SKU-w2';
      fixture.detectChanges();
      expect(rows().length).toBe(1);
    });

    it('still filters by category', async () => {
      await boot();
      component.category.set('tops');
      fixture.detectChanges();
      expect(rows().length).toBe(1);
      expect(rows()[0].nativeElement.textContent).toContain('Woven Shirt');
    });

    it('shows an empty state when nothing matches', async () => {
      await boot();
      component.query = 'zzzz';
      fixture.detectChanges();
      expect(rows().length).toBe(0);
      expect(text()).toContain('No garments match');
    });

    it('keeps the category chip counts', async () => {
      await boot();
      const chips = fixture.nativeElement.querySelectorAll('.filter-chips button');
      expect(chips[0].textContent).toContain('All garments');
      expect(chips.length).toBe(3);
    });
  });

  describe('pre-approval state', () => {
    it('shows the apply flow instead of the catalogue when the API refuses', async () => {
      TestBed.configureTestingModule({
        imports: [CataloguePage, RouterTestingModule],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: ApiService,
            useValue: {
              pricing: () => of(null),
              applyForAccount: () => of({}),
              stock: () => of({}),
            },
          },
        ],
      });
      fixture = TestBed.createComponent(CataloguePage);
      fixture.detectChanges();
      // Simulate the error path.
      fixture.componentInstance.needsAccount.set(true);
      fixture.detectChanges();
      expect(text()).toContain('Wholesale account required');
    });
  });

  describe('fixed MOQ progress tray', () => {
    /** Open a product row so its quantity inputs exist. */
    async function openFirst(): Promise<void> {
      await boot();
      component.toggle('p1');
      fixture.detectChanges();
    }

    function tray(): HTMLElement {
      return fixture.nativeElement.querySelector('.moq-tray');
    }

    it('is always present, so the disabled state is visible from the start', async () => {
      await boot();
      expect(tray()).toBeTruthy();
    });

    it('disables review at zero units', async () => {
      await boot();
      const link = fixture.nativeElement.querySelector('.mt-review');
      expect(link.getAttribute('aria-disabled')).toBe('true');
      expect(link.classList).toContain('is-disabled');
    });

    it('enables review once a single unit is typed, well below the MOQ', async () => {
      await openFirst();
      component.setQty('v1', 1);
      fixture.detectChanges();
      const link = fixture.nativeElement.querySelector('.mt-review');
      expect(link.getAttribute('aria-disabled')).toBe('false');
      // Below MOQ the buyer is still let through: the MOQ is a server rule.
      expect(link.getAttribute('href')).toBe('/cart');
    });

    it('cancels the navigation click at zero units and says why', async () => {
      await boot();
      const link = fixture.nativeElement.querySelector('.mt-review');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      fixture.detectChanges();
      expect(event.defaultPrevented).toBe(true);
      expect(text()).toContain('Select at least one unit');
    });

    it('counts typed quantities before they are committed to the cart', async () => {
      await openFirst();
      component.setQty('v1', 12);
      fixture.detectChanges();
      // Shared state, not just the local footer: the bar moves on typing.
      expect(component.trayUnits()).toBe(12);
      expect(cart.units()).toBe(0);
    });

    it('totals across several products, not just the open row', async () => {
      await openFirst();
      component.setQty('v1', 6);
      component.setQty('v2', 4);
      component.toggle('p2');
      fixture.detectChanges();
      component.setQty('w1', 5);
      fixture.detectChanges();
      expect(component.trayUnits()).toBe(15);
    });

    it('sums committed lines and typed quantities without double counting', async () => {
      await openFirst();
      component.setQty('v1', 8);
      component.addToOrder(product());
      fixture.detectChanges();
      // Committed: 8. Inputs cleared on commit, so pending must be 0.
      expect(cart.units()).toBe(8);
      expect(component.pendingUnits()).toBe(0);
      expect(component.trayUnits()).toBe(8);

      component.toggle('p1');
      fixture.detectChanges();
      component.setQty('v2', 3);
      fixture.detectChanges();
      expect(component.trayUnits()).toBe(11);
    });

    it('values the selection at the account wholesale price', async () => {
      await openFirst();
      component.setQty('v1', 2);
      component.setQty('v2', 1);
      fixture.detectChanges();
      // 3 units at 7650.
      expect(component.trayAmount()).toBe(22950);
    });

    it('shows a shortfall below the MOQ', async () => {
      await openFirst();
      component.setQty('v1', 19);
      fixture.detectChanges();
      expect(component.moqShort()).toBe(1);
      expect(component.moqMet()).toBe(false);
      expect(text()).toContain('1 more to reach 20');
    });

    it('treats exactly the MOQ as met', async () => {
      await openFirst();
      component.setQty('v1', 19);
      component.setQty('v2', 1);
      fixture.detectChanges();
      expect(component.moqMet()).toBe(true);
      expect(text()).toContain('MOQ of 20 met');
    });

    it('keeps progress full and met above the MOQ', async () => {
      await openFirst();
      component.setQty('v1', 25);
      fixture.detectChanges();
      expect(component.moqMet()).toBe(true);
      expect(component.moqProgress()).toBe(100);
      expect(component.moqShort()).toBe(0);
    });

    it('reads the MOQ from the API, not a local constant', async () => {
      await boot(pricing({ moq: 35 }));
      expect(component.moq()).toBe(35);
      expect(text()).toContain('35 more to reach 35');
    });

    it('exposes the bar as a progressbar with the MOQ as its maximum', async () => {
      await openFirst();
      component.setQty('v1', 5);
      fixture.detectChanges();
      const bar = fixture.nativeElement.querySelector('.mt-bar');
      expect(bar.getAttribute('role')).toBe('progressbar');
      expect(bar.getAttribute('aria-valuenow')).toBe('5');
      expect(bar.getAttribute('aria-valuemax')).toBe('20');
      // 5 of 20 is a quarter full.
      const fill = fixture.nativeElement.querySelector('.mt-fill');
      expect(fill.style.width).toBe('25%');
    });

    it('tracks the progress bar width as quantities change', async () => {
      await openFirst();
      component.setQty('v1', 10);
      fixture.detectChanges();
      expect(component.moqProgress()).toBe(50);
      component.setQty('v1', 15);
      fixture.detectChanges();
      expect(component.moqProgress()).toBe(75);
    });
  });

  describe('live stock visibility', () => {
    async function openWithStock(
      stock: Record<string, number | null>,
      payload: Pricing = pricing(),
    ): Promise<void> {
      stockPayload = stock;
      await boot(payload);
      component.toggle('p1');
      fixture.detectChanges();
    }

    it('shows the derived stock under each cell', async () => {
      await openWithStock({ v1: 40, v2: 0, v3: 12 });
      const notes = fixture.nativeElement.querySelectorAll('.q-stock');
      expect(notes.length).toBe(3);
      expect(notes[0].textContent).toContain('40 available');
    });

    it('labels a zero-stock variant rather than showing "0 available"', async () => {
      await openWithStock({ v1: 40, v2: 0, v3: 12 });
      const notes = fixture.nativeElement.querySelectorAll('.q-stock');
      expect(notes[1].textContent).toContain('None in stock');
    });

    it('caps the input at the derived stock', async () => {
      await openWithStock({ v1: 40, v2: 0, v3: 12 });
      const input = document.querySelector<HTMLInputElement>('#cat-qty-v1')!;
      expect(input.getAttribute('max')).toBe('40');
    });

    it('clamps a typed quantity to the real ceiling', async () => {
      await openWithStock({ v1: 40 });
      component.setQty('v1', 999);
      fixture.detectChanges();
      expect(component.qtyOf('v1')).toBe(40);
    });

    it('settles an empty-stock variant at zero instead of an oversell', async () => {
      await openWithStock({ v1: 0 });
      component.setQty('v1', 5);
      fixture.detectChanges();
      expect(component.qtyOf('v1')).toBe(0);
    });

    it('links the note to the input so a screen reader announces it', async () => {
      await openWithStock({ v1: 40 });
      const input = document.querySelector<HTMLInputElement>('#cat-qty-v1')!;
      expect(input.getAttribute('aria-describedby')).toBe('cat-qty-v1-stock');
      expect(document.querySelector('#cat-qty-v1-stock')).toBeTruthy();
    });

    it('never caps a made-to-order variant, which has no shelf stock', async () => {
      await openWithStock(
        { m1: 0, v2: 0, v3: 0 },
        pricing({
          data: [
            product({
              variants: [
                variant('m1', 'S', 'black', { availabilityStatus: 'made_to_order' }),
                variant('v2', 'M', 'black'),
                variant('v3', 'L', 'black'),
              ],
            }),
          ],
        }),
      );
      const input = document.querySelector<HTMLInputElement>('#cat-qty-m1')!;
      expect(input.getAttribute('max')).toBeNull();
      // A made-to-order variant is orderable, so the cap cannot be zero.
      component.setQty('m1', 25);
      fixture.detectChanges();
      expect(component.qtyOf('m1')).toBe(25);
      expect(fixture.nativeElement.querySelector('#cat-qty-m1-stock')).toBeNull();
    });

    it('leaves every input uncapped when the stock call fails', async () => {
      // An empty map is the "stock unknown" path: showing a limit would be a
      // guess, so no cap and no note.
      await openWithStock({});
      const input = document.querySelector<HTMLInputElement>('#cat-qty-v1')!;
      expect(input.getAttribute('max')).toBeNull();
      expect(fixture.nativeElement.querySelector('.q-stock')).toBeNull();
      component.setQty('v1', 999);
      fixture.detectChanges();
      expect(component.qtyOf('v1')).toBe(999);
    });
  });

  describe('regression: per-row pricing and the quick-variant cap', () => {
    it('uses each row’s own retail price in the "1+" band', async () => {
      const p = pricing({
        data: [
          product({
            id: 'p1',
            variants: [variant('v1', 'S', 'black', { retailPrice: 9000 })],
          }),
          product({
            id: 'p2',
            name: 'Woven Shirt',
            variants: [variant('w1', 'M', 'sand', { retailPrice: 20000 })],
          }),
        ],
      });
      await boot(p);
      const rows = fixture.nativeElement.querySelectorAll('.prodrow');
      // Row two must not inherit the first product's retail figure.
      expect(rows[1].querySelector('.pr-ladder').textContent).toContain('20,000');
      expect(rows[0].querySelector('.pr-ladder').textContent).toContain('9,000');
    });

    it('renders only the first six variants, as the copy claims', async () => {
      const many = Array.from({ length: 9 }, (_, i) => variant(`v${i}`, `S${i}`, 'black'));
      await boot(pricing({ data: [product({ variants: many })] }));
      component.toggle('p1');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.qcell').length).toBe(6);
      expect(text()).toContain('Showing the first 6 colourways');
    });

    it('points the overflow note at the matrix that lists the rest', async () => {
      const many = Array.from({ length: 9 }, (_, i) => variant(`v${i}`, `S${i}`, 'black'));
      await boot(pricing({ data: [product({ variants: many })] }));
      component.toggle('p1');
      fixture.detectChanges();
      const link = fixture.nativeElement.querySelector('.pr-panel .link');
      expect(link.getAttribute('href')).toContain('/matrix');
    });

    it('does not show the overflow note when a product fits', async () => {
      await boot();
      component.toggle('p1');
      fixture.detectChanges();
      expect(text()).not.toContain('Showing the first');
    });

    it('keeps the column header aligned with the rendered cells', async () => {
      const many = Array.from({ length: 9 }, (_, i) => variant(`v${i}`, `S${i}`, 'black'));
      await boot(pricing({ data: [product({ variants: many })] }));
      component.toggle('p1');
      fixture.detectChanges();
      // Headers are derived from the same capped list the grid renders.
      expect(component.columns(component.pricing()!.data[0]).length).toBe(6);
      expect(fixture.nativeElement.querySelectorAll('.pr-qty-head .qh-col').length).toBe(6);
    });
  });
});
