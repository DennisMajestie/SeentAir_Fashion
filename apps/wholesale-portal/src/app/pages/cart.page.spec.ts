import { CommonModule } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CartPage } from './cart.page';
import { ApiService, Pricing } from '../api.service';
import { CartService } from '../cart.service';

/**
 * W5 checkout on the shared primitives.
 *
 * Two rules get the most attention here, because this is the page where money
 * is committed:
 *  - the allocation a buyer is verifying is always visible (rows start open)
 *  - the MOQ never comes from a hardcoded constant, and an unknown MOQ defers
 *    to the server instead of guessing
 */

function line(over: Partial<CartService['lines'] extends never ? never : any> = {}) {
  return {
    variantId: 'v1',
    productId: 'p1',
    productName: 'Aba Cargo',
    sku: 'CARGO-S',
    size: 'S',
    colour: 'black',
    unitPrice: 7650,
    quantity: 10,
    ...over,
  };
}

const pricing: Pricing = {
  tier: { name: 'Standard', discountPercent: 15 },
  hasDiscount: true,
  moq: 20,
  total: 1,
  data: [],
};

describe('CartPage', () => {
  let fixture: ComponentFixture<CartPage>;
  let component: CartPage;
  let cart: CartService;
  let placed: Array<{ variantId: string; quantity: number }>[];

  async function boot(
    lines: ReturnType<typeof line>[] = [line()],
    tier: Pricing | 'error' = pricing,
  ): Promise<void> {
    placed = [];

    TestBed.configureTestingModule({
      imports: [CartPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            me: () => of({ name: 'Aba Textiles Ltd' }),
            pricing: () => (tier === 'error' ? throwError(() => new Error('403')) : of(tier)),
            placeOrder: (items: Array<{ variantId: string; quantity: number }>) => {
              placed.push(items);
              return of({ id: 'committed0000-1111-2222', totalAmount: 153000 });
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(CartPage);
    component = fixture.componentInstance;
    // CartService is root-provided, so the draft is shared with the component.
    cart = TestBed.inject(CartService);
    cart.clear();
    cart.add(lines);
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
  }

  function rows(): HTMLElement[] {
    return [...fixture.nativeElement.querySelectorAll('se-row')];
  }

  describe('the MOQ is real data, never a constant', () => {
    it('reads the minimum from the API response', async () => {
      await boot([line()], { ...pricing, moq: 40 });
      expect(component.moq()).toBe(40);
      expect(text()).toContain('30 short of the 40 minimum');
    });

    it('does not invent 20 when the pricing call fails', async () => {
      await boot([line()], 'error');
      // Guessing here could block a valid order or wave through an invalid one.
      expect(component.moq()).toBe(0);
      expect(component.moqKnown()).toBe(false);
      expect(text()).toContain('minimum being confirmed');
    });

    it('blocks commit while below the real minimum', async () => {
      await boot([line()]);
      expect(cart.units()).toBe(10);
      expect(component.moqMet()).toBe(false);
      const commit = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
        b.textContent!.includes('Commit batch'),
      ) as HTMLButtonElement;
      expect(commit.disabled).toBe(true);
      expect(text()).toContain('Minimum order is 20 units: you have 10.');
    });

    it('unlocks commit exactly at the minimum', async () => {
      await boot([line({ quantity: 20 })]);
      expect(component.moqMet()).toBe(true);
      const commit = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
        b.textContent!.includes('Commit batch'),
      ) as HTMLButtonElement;
      expect(commit.disabled).toBe(false);
    });

    it('defers to the server when the minimum is unknown', async () => {
      await boot([line()], 'error');
      // The server enforces MOQ on POST /orders either way.
      expect(component.moqMet()).toBe(true);
      expect(text()).not.toContain('Minimum order is');
    });
  });

  describe('the allocation is visible without a click', () => {
    it('starts every batch row open, because this is a verify step', async () => {
      await boot([line(), line({ variantId: 'v2', productId: 'p2', productName: 'Woven Shirt' })]);
      expect(rows().length).toBe(2);
      expect(fixture.nativeElement.querySelectorAll('.drow.open').length).toBe(2);
      expect(fixture.nativeElement.querySelectorAll('.drow-panel').length).toBe(2);
    });

    it('shows the size breakdown per colourway', async () => {
      await boot([
        line({ variantId: 'v1', size: 'S', colour: 'black', quantity: 6 }),
        line({ variantId: 'v2', size: 'M', colour: 'black', quantity: 4 }),
      ]);
      expect(text()).toContain('6× S');
      expect(text()).toContain('4× M');
      expect(text()).toContain('10');
    });

    it('renders the allocation as a real table with headers', async () => {
      await boot();
      const table = fixture.nativeElement.querySelector('.alloc') as HTMLTableElement;
      expect(table).toBeTruthy();
      expect(table.querySelectorAll('th').length).toBe(3);
      // Row totals are aligned by the table, not by hand-tuned flex.
      expect(table.querySelector('tfoot td.num')?.textContent?.trim()).toBe('10');
    });

    it('can still collapse a row to focus on the others', async () => {
      await boot([line(), line({ variantId: 'v2', productId: 'p2', productName: 'Woven Shirt' })]);
      const head = fixture.nativeElement.querySelector('.drow-head') as HTMLButtonElement;
      head.click();
      fixture.detectChanges();
      // Unlike the Orders log, collapsing one leaves the other open.
      expect(fixture.nativeElement.querySelectorAll('.drow.open').length).toBe(1);
    });

    it('groups lines by product, not by variant', async () => {
      await boot([
        line({ variantId: 'v1', size: 'S', colour: 'black', quantity: 6 }),
        line({ variantId: 'v2', size: 'M', colour: 'black', quantity: 4 }),
      ]);
      expect(component.groups().length).toBe(1);
      expect(component.groups()[0].units).toBe(10);
    });

    it('reopens a row that is removed and re-added', async () => {
      await boot([line()]);
      const head = fixture.nativeElement.querySelector('.drow-head') as HTMLButtonElement;
      head.click();
      fixture.detectChanges();
      expect(component.isOpen('p1')).toBe(false);

      cart.removeProduct('p1');
      fixture.detectChanges();
      cart.add([line()]);
      fixture.detectChanges();
      expect(component.isOpen('p1')).toBe(true);
    });
  });

  describe('the cost summary reconciles with the cart', () => {
    it('marks one total line', async () => {
      await boot([line({ quantity: 20 })]);
      const totals = fixture.nativeElement.querySelectorAll('.ledger .lg-row.total');
      expect(totals.length).toBe(1);
    });

    it('totals the merchandise, not the allocation count', async () => {
      await boot([line({ quantity: 20 })]);
      expect(cart.amount()).toBe(153000);
      // Grouping is locale-dependent, so assert on the digits, not the format.
      expect(text().replace(/\D/g, '')).toContain('15300000');
    });

    it('names the applied tier rate from the API', async () => {
      await boot([line()]);
      expect(text()).toContain('Standard wholesale rate');
      expect(text()).toContain('15% off retail: applied');
    });

    it('omits the tier row rather than inventing one when pricing fails', async () => {
      await boot([line()], 'error');
      expect(text()).not.toContain('off retail: applied');
    });

    it('names freight without pricing it', async () => {
      await boot([line()]);
      expect(text()).toContain('Freight logistics waybill');
      expect(text()).toContain('On final invoice');
    });
  });

  describe('empty and committed states', () => {
    it('shows the shared empty state when there is no batch', async () => {
      await boot([]);
      expect(fixture.nativeElement.querySelector('se-empty')).toBeTruthy();
      expect(text()).toContain('Your draft batch is empty');
      expect(rows().length).toBe(0);
    });

    it('confirms the commit with the real unit count', async () => {
      await boot([line({ quantity: 20 })]);
      spyOn(component['alerts'], 'confirm').and.resolveTo(true);
      await component.commit();
      expect(component['alerts'].confirm).toHaveBeenCalled();
    });

    it('does not place an order when the desk confirmation is declined', async () => {
      await boot([line({ quantity: 20 })]);
      spyOn(component['alerts'], 'confirm').and.resolveTo(false);
      await component.commit();
      expect(placed).toHaveSize(0);
    });

    it('sends the cart items and clears the draft on success', async () => {
      await boot([line({ quantity: 20 })]);
      spyOn(component['alerts'], 'confirm').and.resolveTo(true);
      spyOn(component['alerts'], 'toast').and.returnValue(Promise.resolve());
      await component.commit();
      fixture.detectChanges();
      expect(placed).toHaveSize(1);
      expect(placed[0]).toEqual([{ variantId: 'v1', quantity: 20 }]);
      expect(cart.lines()).toHaveSize(0);
      expect(component.orderResult()).toEqual({
        id: 'committed0000-1111-2222',
        totalAmount: 153000,
      });
      // The committed order's short code is on screen, so the confirmation
      // strip rendered rather than the page silently clearing.
      expect(text()).toContain('COMMITTE');
    });
  });

  describe('shared primitives in use', () => {
    it('uses strips rather than the old rounded panels', async () => {
      await boot([line()]);
      expect(fixture.nativeElement.querySelectorAll('se-strip').length).toBeGreaterThanOrEqual(5);
      expect(fixture.nativeElement.querySelectorAll('.panel').length).toBe(0);
    });

    it('leaves no ordercard behind', async () => {
      await boot([line()]);
      expect(fixture.nativeElement.querySelectorAll('.ordercard').length).toBe(0);
    });
  });
});
