import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService, Order } from '../api.service';
import { BrandAlertService } from '../brand-alert.service';
import { CartService } from '../cart.service';
import { CheckoutPage } from './checkout.page';

/**
 * Checkout is split into four steps (cart, details, delivery, payment) so no
 * single screen asks for name, email and a five-field address at once. These
 * cover what that split must not break:
 *
 *  - each step shows only its own form,
 *  - each step validates only what it owns, so a bad address cannot be reported
 *    on the details step and a missing name cannot be reported on delivery,
 *  - going back keeps what was typed (address typos are the common miss),
 *  - a signed-in customer is not shown an empty details form,
 *  - the order is placed once, carrying the guest token to the payment call.
 *
 * ApiService and CartService are mocked; nothing here touches the network.
 */
describe('CheckoutPage — split steps', () => {
  let fixture: ComponentFixture<CheckoutPage>;
  let element: HTMLElement;
  let page: CheckoutPage;
  let createOrder: jasmine.Spy;
  let payWithPaystack: jasmine.Spy;
  let loggedIn: boolean;
  /** Set before build() when a spec needs a differently-shaped order response. */
  let orderOverride: Partial<Order> = {};

  const order = (over: Partial<Order> = {}): Order =>
    ({
      id: 'o1',
      status: 'awaiting_payment',
      paymentStatus: 'unpaid',
      totalAmount: 18000,
      createdAt: '2026-09-30T00:00:00.000Z',
      trackingToken: 'tok-abc',
      ...over,
    }) as Order;

  const fillDetails = () => {
    page.name = 'Ada Obi';
    page.email = 'ada@example.com';
  };
  const fillDelivery = () => {
    page.shipState = 'Lagos';
    page.shipCity = 'Yaba';
    page.shipLine = '12 Herbert Macaulay Way';
    page.shipPhone = '+2348000000000';
  };
  const text = () => element.textContent ?? '';

  const build = () => {
    createOrder = jasmine.createSpy('createOrder').and.returnValue(of(order(orderOverride)));
    payWithPaystack = jasmine
      .createSpy('payWithPaystack')
      .and.returnValue(of({ authorizationUrl: 'https://checkout.test/x' }));
    TestBed.configureTestingModule({
      imports: [CheckoutPage],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            get isLoggedIn() {
              return loggedIn;
            },
            login: () => of({ accessToken: 'a', refreshToken: 'r' }),
            me: () => of({ id: 'u1', email: 'ada@example.com', name: 'Ada', role: 'customer' }),
            createOrder,
            payWithPaystack,
          },
        },
        {
          provide: CartService,
          useValue: {
            // The manifest reads productName for the monogram when an item has
            // no image, so every field the template touches has to be present.
            items: () => [
              {
                variantId: 'v1',
                quantity: 2,
                productName: 'Box Tee',
                sku: 'SKU-BLK-M',
                size: 'M',
                colour: 'black',
                unitPrice: 9000,
                imageUrl: null,
              },
            ],
            count: 2,
            total: 18000,
            moqEligible: false,
            hasMadeToOrder: false,
            clear: () => {},
          },
        },
        { provide: BrandAlertService, useValue: { toast: () => of(undefined) } },
      ],
    });
    fixture = TestBed.createComponent(CheckoutPage);
    element = fixture.nativeElement as HTMLElement;
    page = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    loggedIn = false;
    orderOverride = {};
    // Karma reuses one browser context, so a token stashed by an earlier spec
    // would leak into the next. The component reads it back at payment time.
    localStorage.clear();
    build();
  });

  afterEach(() => TestBed.resetTestingModule());

  /** TestBed cannot be reconfigured once instantiated, so a signed-in spec
      rebuilds from scratch rather than re-using the guest fixture. */
  const buildSignedIn = () => {
    TestBed.resetTestingModule();
    loggedIn = true;
    build();
  };

  // ---- the split itself ----

  it('opens on the details step, showing name and email but not the address', () => {
    expect(page.currentStep()).toBe(2);
    expect(text()).toContain('Your details');
    expect(text()).not.toContain('Delivery address');
  });

  it('shows the delivery step alone once details are given', () => {
    fillDetails();
    page.toDelivery();
    fixture.detectChanges();
    expect(page.currentStep()).toBe(3);
    expect(text()).toContain('Delivery address');
    // The details form is gone, not merely hidden: one question per screen.
    expect(text()).not.toContain('Your details');
  });

  it('counts four steps, not three', () => {
    expect(text()).toContain('Step 2 of 4');
    fillDetails();
    page.toDelivery();
    fixture.detectChanges();
    expect(text()).toContain('Step 3 of 4');
  });

  // ---- each step validates only what it owns ----

  it('will not leave the details step without a name, and does not blame the address', () => {
    page.email = 'ada@example.com';
    page.toDelivery();
    fixture.detectChanges();
    expect(page.currentStep()).toBe(2);
    expect(page.detailsError()).toContain('name');
    expect(page.deliveryError()).toBeNull();
  });

  it('will not leave the details step without a usable email', () => {
    page.name = 'Ada Obi';
    page.email = 'not-an-email';
    page.toDelivery();
    fixture.detectChanges();
    expect(page.currentStep()).toBe(2);
    expect(page.detailsError()).toContain('email');
  });

  it('does not place an order from a click that lands back on the details step', () => {
    page.toDelivery();
    page.primaryAction();
    fixture.detectChanges();
    expect(createOrder).not.toHaveBeenCalled();
  });

  // ---- going back ----

  it('keeps what was typed when stepping back from delivery', () => {
    fillDetails();
    page.toDelivery();
    fillDelivery();
    page.toDetails();
    fixture.detectChanges();
    expect(page.currentStep()).toBe(2);
    expect(page.name).toBe('Ada Obi');
    // Nothing is cleared on the way back; the address survives too.
    expect(page.shipLine).toBe('12 Herbert Macaulay Way');
  });

  it('offers a way back only on the delivery step', () => {
    expect(text()).not.toContain('Back to your details');
    fillDetails();
    page.toDelivery();
    fixture.detectChanges();
    expect(text()).toContain('Back to your details');
  });

  it('returns to details without placing an order', () => {
    fillDetails();
    page.toDelivery();
    fixture.detectChanges();
    page.toDetails();
    fixture.detectChanges();
    expect(createOrder).not.toHaveBeenCalled();
    expect(page.currentStep()).toBe(2);
  });

  // ---- placing the order ----

  it('places the order once both steps are satisfied', () => {
    fillDetails();
    page.toDelivery();
    fillDelivery();
    page.primaryAction();
    fixture.detectChanges();
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder.calls.argsFor(0)[3]).toEqual({ name: 'Ada Obi', email: 'ada@example.com' });
  });

  it('sends the tracking token to the payment call, not just the order', () => {
    // The token is what lets a guest pay at all; placing the order is not enough.
    fillDetails();
    page.toDelivery();
    fillDelivery();
    page.primaryAction();
    expect(payWithPaystack).toHaveBeenCalledWith('o1', 18000, undefined, 'tok-abc');
  });

  it('sends no token when the API returns none', () => {
    orderOverride = { trackingToken: undefined };
    TestBed.resetTestingModule();
    build();
    fillDetails();
    page.toDelivery();
    fillDelivery();
    page.primaryAction();
    expect(payWithPaystack).toHaveBeenCalledWith('o1', 18000, undefined, undefined);
  });

  it('shows step 4 once the order exists', () => {
    fillDetails();
    page.toDelivery();
    fillDelivery();
    page.primaryAction();
    fixture.detectChanges();
    expect(page.currentStep()).toBe(4);
    expect(text()).toContain('Step 4 of 4');
    expect(text()).toContain('Order placed');
  });

  // ---- signed-in customers ----

  it('does not show an empty details form to a signed-in customer', () => {
    // Their name and email are already on the account; asking again is noise,
    // and they have nothing to fill in.
    buildSignedIn();
    expect(text()).not.toContain('Full name');
  });

  it('advances a signed-in customer without asking for a name', () => {
    buildSignedIn();
    page.toDelivery();
    fixture.detectChanges();
    expect(page.currentStep()).toBe(3);
    expect(page.detailsError()).toBeNull();
  });

  it('sends no guest block for a signed-in order', () => {
    buildSignedIn();
    page.toDelivery();
    fillDelivery();
    page.primaryAction();
    expect(createOrder.calls.argsFor(0)[3]).toBeUndefined();
  });

  // ---- the order summary is not lost ----

  it('keeps the order summary visible on both form steps', () => {
    expect(text()).toContain('Total due');
    fillDetails();
    page.toDelivery();
    fixture.detectChanges();
    expect(text()).toContain('Total due');
  });
});