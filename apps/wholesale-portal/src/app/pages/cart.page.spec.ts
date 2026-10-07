import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SeConfirmService, SeCurrencyService, SeToastService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { ApiService, Pricing } from '../api.service';
import { CartLine, CartService } from '../cart.service';
import { CartPage } from './cart.page';

/**
 * What matters here is money and the minimum: the MOQ comes from the API and
 * is never a constant, the order body is exactly the cart, nothing is placed
 * without the buyer confirming the full total, and a placed order goes
 * straight to Paystack for the full amount.
 */
function line(variantId: string, quantity: number, unitPrice = 2500, size = 'M'): CartLine {
  return {
    variantId,
    productId: `p-${variantId.charAt(0)}`,
    productName: `Tee ${variantId.charAt(0).toUpperCase()}`,
    sku: `SE-${variantId.toUpperCase()}`,
    size,
    colour: 'black',
    unitPrice,
    quantity,
  };
}

describe('CartPage', () => {
  let fixture: ComponentFixture<CartPage>;
  let component: CartPage;
  let api: jasmine.SpyObj<ApiService>;
  let cart: CartService;
  let confirm: SeConfirmService;
  let toast: SeToastService;
  let router: Router;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (sel: string): string => el().querySelector(sel)?.textContent?.trim() ?? '';
  const placeButton = (): HTMLButtonElement => el().querySelector('.place') as HTMLButtonElement;

  const mount = (lines: CartLine[], pricing: unknown = of({ moq: 20, tier: null })): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'pricing',
      'placeOrder',
      'payWithPaystack',
    ]);
    api.pricing.and.returnValue(pricing as never);
    api.placeOrder.and.returnValue(
      of({ id: 'abcdef12-3456-7890-abcd-ef1234567890', totalAmount: 1 }),
    );
    api.payWithPaystack.and.returnValue(of({ authorizationUrl: '' }));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    cart = TestBed.inject(CartService);
    cart.clear();
    cart.add(lines);
    confirm = TestBed.inject(SeConfirmService);
    toast = TestBed.inject(SeToastService);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(CartPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  describe('the MOQ is real data, never a constant', () => {
    it('reads the minimum from the API response', () => {
      mount([line('a', 5)], of({ moq: 50, tier: null } as unknown as Pricing));
      expect(component.moq()).toBe(50);
      expect(text('.se-banner--warning')).toContain('at least 50 units');
      expect(text('.se-banner--warning')).toContain('Add 45 more');
    });

    it('does not invent 20 when the pricing call fails', () => {
      mount(
        [line('a', 5)],
        throwError(() => new Error('down')),
      );
      expect(component.moq()).toBe(0);
      expect(component.moqKnown()).toBeFalse();
      expect(el().querySelector('.se-banner--warning')).toBeNull();
      expect(text('.se-banner--info')).toContain('Minimum being confirmed');
    });

    it('blocks placing the order while below the real minimum', () => {
      mount([line('a', 19)]);
      expect(component.moqMet()).toBeFalse();
      expect(placeButton().disabled).toBeTrue();
    });

    it('unlocks exactly at the minimum', () => {
      mount([line('a', 20)]);
      expect(component.moqMet()).toBeTrue();
      expect(placeButton().disabled).toBeFalse();
      expect(el().querySelector('.se-banner--warning')).toBeNull();
    });

    it('defers to the server when the minimum is unknown', () => {
      mount(
        [line('a', 1)],
        throwError(() => new Error('down')),
      );
      expect(component.moqMet()).toBeTrue();
      expect(placeButton().disabled).toBeFalse();
    });
  });

  describe('the lines are the cart', () => {
    it('renders one table row per variant with SKU, size and colour', () => {
      mount([line('a', 10, 2500, 'M'), line('b', 10, 2500, 'L')]);
      const rows = el().querySelectorAll('se-table tbody tr');
      expect(rows.length).toBe(2);
      expect(rows[0].textContent).toContain('SE-A');
      expect(rows[0].textContent).toContain('M / black');
      expect(rows[0].textContent).toContain('₦25,000.00');
    });

    it('edits a quantity through the cart service', () => {
      mount([line('a', 10)]);
      component.setQuantity(cart.lines()[0], 12);
      expect(cart.units()).toBe(12);
      expect(cart.lines()[0].variantId).toBe('a');
    });

    it('removes a line on a zero quantity or the Remove action', () => {
      mount([line('a', 10), line('b', 10)]);
      component.setQuantity(cart.lines()[0], 0);
      expect(cart.lines().map((l) => l.variantId)).toEqual(['b']);
      fixture.detectChanges();
      (
        el().querySelector('se-table tbody button[aria-label^="Remove"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(cart.lines().length).toBe(0);
    });
  });

  describe('the summary reconciles with the cart', () => {
    it('shows units, subtotal and total at the same magnitude', () => {
      mount([line('a', 20, 1850000 / 20)]);
      const kv = text('dl');
      expect(kv).toContain('20');
      expect(kv.match(/₦1,850,000\.00/g)?.length).toBe(2);
    });

    it('keeps the naira scale for a fractional unit price', () => {
      mount([line('a', 20, 1234.56)]);
      expect(text('dl')).toContain('₦24,691.20');
    });

    it('names the applied tier rate from the API, and omits it when unknown', () => {
      mount([line('a', 20)], of({ moq: 20, tier: { name: 'Tier B', discountPercent: 20 } }));
      expect(text('dl')).toContain('Tier B · 20% off retail');
      fixture.destroy();
      TestBed.resetTestingModule();
      mount(
        [line('a', 20)],
        throwError(() => new Error('down')),
      );
      expect(text('dl')).not.toContain('Rate card');
    });

    it('states the full-payment rule', () => {
      mount([line('a', 20)]);
      expect(text('.rule')).toContain('Full payment upfront');
      expect(text('.rule')).toContain('No part-payments');
    });
  });

  describe('empty and placing states', () => {
    it('shows the empty state with a catalogue action when there is no batch', () => {
      mount([]);
      expect(text('se-empty-state')).toContain('Your cart is empty');
      expect(el().querySelector('se-table')).toBeNull();
      (el().querySelector('se-empty-state button') as HTMLButtonElement).click();
      expect(router.navigate).toHaveBeenCalledWith(['/catalogue']);
    });

    it('confirms with the full total and that payment is taken in full', async () => {
      mount([line('a', 20, 2500)]);
      const ask = spyOn(confirm, 'ask').and.resolveTo(false);
      await component.placeOrder();
      const opts = ask.calls.mostRecent().args[0];
      expect(opts.title).toContain('20-unit');
      expect(opts.title).toContain('₦50,000.00');
      expect(opts.consequence).toContain('in full');
      expect(opts.consequence).toContain('part-paid');
    });

    it('does not place an order when the confirmation is declined', async () => {
      mount([line('a', 20)]);
      spyOn(confirm, 'ask').and.resolveTo(false);
      await component.placeOrder();
      expect(api.placeOrder).not.toHaveBeenCalled();
      expect(cart.units()).toBe(20);
    });

    it('does not place an order below the minimum even if called directly', async () => {
      mount([line('a', 5)]);
      spyOn(confirm, 'ask').and.resolveTo(true);
      await component.placeOrder();
      expect(api.placeOrder).not.toHaveBeenCalled();
    });

    it('sends the cart items, clears the draft, then pays the full amount with Paystack', async () => {
      mount([line('a', 12), line('b', 8)]);
      spyOn(confirm, 'ask').and.resolveTo(true);
      const show = spyOn(toast, 'show');
      const leave = spyOn(component, 'leaveFor');
      api.placeOrder.and.returnValue(of({ id: 'abcdef12-0000', totalAmount: 50000 }));
      api.payWithPaystack.and.returnValue(of({ authorizationUrl: 'https://paystack.test/pay/1' }));
      await component.placeOrder();
      expect(leave).toHaveBeenCalledWith('https://paystack.test/pay/1');
      expect(router.navigate).not.toHaveBeenCalled();
      expect(api.placeOrder).toHaveBeenCalledWith(
        [
          { variantId: 'a', quantity: 12 },
          { variantId: 'b', quantity: 8 },
        ],
        { deliveryMethod: 'freight', customerNote: '' },
      );
      expect(cart.lines().length).toBe(0);
      expect(api.payWithPaystack).toHaveBeenCalledWith('abcdef12-0000', 50000);
      expect(show.calls.mostRecent().args[0]).toContain('#ABCDEF12');
    });

    it('sends the buyer delivery choice and factory-desk note with the order', async () => {
      mount([line('a', 20)]);
      component.freight = 'pickup';
      component.notes = 'Deliver after the Friday restock';
      spyOn(confirm, 'ask').and.resolveTo(true);
      const leave = spyOn(component, 'leaveFor');
      api.placeOrder.and.returnValue(of({ id: 'order-p', totalAmount: 50000 }));
      api.payWithPaystack.and.returnValue(of({ authorizationUrl: 'https://paystack.test/pay/2' }));
      await component.placeOrder();
      expect(api.placeOrder).toHaveBeenCalledWith([{ variantId: 'a', quantity: 20 }], {
        deliveryMethod: 'pickup',
        customerNote: 'Deliver after the Friday restock',
      });
      expect(leave).toHaveBeenCalledWith('https://paystack.test/pay/2');
    });

    it('sends the buyer to the invoice when Paystack returns no payment page', async () => {
      mount([line('a', 20)]);
      spyOn(confirm, 'ask').and.resolveTo(true);
      const leave = spyOn(component, 'leaveFor');
      api.placeOrder.and.returnValue(of({ id: 'order-7', totalAmount: 50000 }));
      await component.placeOrder();
      expect(leave).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/orders', 'order-7', 'invoice']);
    });

    it('toasts the failure with Try again and keeps the cart', async () => {
      mount([line('a', 20)]);
      spyOn(confirm, 'ask').and.resolveTo(true);
      const show = spyOn(toast, 'show');
      api.placeOrder.and.returnValue(
        throwError(() => ({ error: { message: 'Variant sold out' } })),
      );
      await component.placeOrder();
      expect(cart.units()).toBe(20);
      expect(component.placing()).toBeFalse();
      const [msg, opts] = show.calls.mostRecent().args;
      expect(msg).toBe('Variant sold out');
      expect(opts?.tone).toBe('danger');
      expect(opts?.action?.label).toBe('Try again');
      expect(api.payWithPaystack).not.toHaveBeenCalled();
    });

    it('falls back to the invoice when Paystack cannot be started', async () => {
      mount([line('a', 20)]);
      spyOn(confirm, 'ask').and.resolveTo(true);
      const show = spyOn(toast, 'show');
      api.placeOrder.and.returnValue(of({ id: 'order-9', totalAmount: 50000 }));
      api.payWithPaystack.and.returnValue(
        throwError(() => ({ error: { message: 'Gateway down' } })),
      );
      await component.placeOrder();
      expect(router.navigate).toHaveBeenCalledWith(['/orders', 'order-9', 'invoice']);
      expect(show.calls.mostRecent().args[1]?.tone).toBe('danger');
    });
  });

  it('leaves no legacy markup behind', () => {
    mount([line('a', 20)]);
    expect(el().querySelector('se-row, se-ledger, .cta, .panel')).toBeNull();
    expect(el().textContent).not.toContain('NaN');
  });
});
