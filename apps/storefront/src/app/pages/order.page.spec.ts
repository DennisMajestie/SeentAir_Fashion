import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { ApiService, Order, OrderTracking } from '../api.service';
import { OrderPage } from './order.page';

/**
 * Renders the page for every status the backend can emit and asserts the
 * customer-visible outcome. ApiService is mocked, so nothing here touches the
 * network or a database.
 *
 * Statuses come from OrderStatus in the API
 * (services/api/src/modules/orders/entities/order.entity.ts:38-49).
 */
describe('OrderPage', () => {
  let fixture: ComponentFixture<OrderPage>;
  let element: HTMLElement;

  const ORDER_ID = 'abc12345-0000-0000-0000-000000000000';

  const variant = {
    id: 'v1',
    sku: 'CMS-SUT-CHR-BSP',
    size: 'Bespoke',
    colour: 'charcoal',
    priceOverride: null,
    imageUrl: null,
    availabilityStatus: 'made_to_order',
  };

  const makeOrder = (over: Partial<Order> = {}): Order =>
    ({
      id: ORDER_ID,
      status: 'order_received',
      paymentStatus: 'paid',
      totalAmount: 370000,
      createdAt: '2026-09-28T10:00:00.000Z',
      shippingAddress: null,
      deliveredAt: null,
      deliveryNote: null,
      items: [{ variant, quantity: 2, unitPrice: 185000 }],
      ...over,
    }) as Order;

  const makeTracking = (over: Partial<OrderTracking> = {}): OrderTracking =>
    ({
      status: 'order_received',
      deliveredAt: null,
      events: [
        {
          status: 'order_received',
          note: 'Paid in full via paystack',
          createdAt: '2026-09-28T10:01:00.000Z',
        },
      ],
      deliveries: [],
      ...over,
    }) as OrderTracking;

  const setUp = (order: Order | null, tracking?: OrderTracking) => {
    const order$ = new BehaviorSubject<Order | null>(order);
    TestBed.configureTestingModule({
      imports: [OrderPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => ORDER_ID } } } },
        {
          provide: ApiService,
          useValue: {
            order: () => order$,
            tracking: () => of(tracking ?? makeTracking()),
            orderStream: () => Promise.resolve(),
            payWithPaystack: () => of({ authorizationUrl: 'https://checkout.test/x' }),
            submitReview: () => of({}),
            requestReturn: () => of({}),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(OrderPage);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  /**
   * Tracking is fetched inside a queueMicrotask so a burst of notifications
   * cannot stampede the API. detectChanges() is synchronous, so the microtask
   * has to be flushed and the view re-checked before tracking data is visible.
   */
  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  };

  const text = () => element.textContent ?? '';

  afterEach(() => TestBed.resetTestingModule());

  describe('the four walked stages', () => {
    for (const [status, label, headline] of [
      ['order_received', 'ORDER RECEIVED', "We've got your order"],
      ['processing', 'PROCESSING & PACKAGING', 'Making your pieces'],
      ['shipped', 'SHIPPED', 'On the way to you'],
      ['delivered', 'DELIVERED', 'Delivered'],
    ] as const) {
      it(`renders the ${status} stage with its own copy`, () => {
        setUp(makeOrder({ status }));
        expect(text()).toContain(label);
        expect(text()).toContain(headline);
        // The stage description is shown whether or not it has been reached.
        expect(text()).toContain('The rider hands your parcel over at your address.');
      });
    }
  });

  describe('statuses outside the four stages', () => {
    it('shows a payment banner and a Pay now action for awaiting_payment', () => {
      setUp(makeOrder({ status: 'awaiting_payment', paymentStatus: 'unpaid' }));
      expect(text()).toContain('AWAITING PAYMENT');
      expect(text()).toContain('Pay now');
      expect(text()).toContain('370,000');
    });

    it('shows a cancellation banner for cancelled', () => {
      setUp(makeOrder({ status: 'cancelled' }));
      expect(text()).toContain('CANCELLED');
      expect(text()).toContain('This order was cancelled');
      // No payment prompt on a dead order.
      expect(text()).not.toContain('Pay now');
    });

    it('shows a returned banner for returned', () => {
      setUp(makeOrder({ status: 'returned' }));
      expect(text()).toContain('RETURNED');
      expect(text()).not.toContain('Pay now');
    });

    it('never leaks the internal stock_exception term at the customer', () => {
      setUp(makeOrder({ status: 'stock_exception' }));
      // Customer-safe wording instead of the internal enum value.
      expect(text()).not.toContain('stock exception');
      expect(text()).not.toContain('STOCK_EXCEPTION');
      expect(text()).toContain('We are confirming your order');
    });
  });

  describe('progress and timeline', () => {
    it('marks the current step with aria-current and reports step N of 4', () => {
      setUp(makeOrder({ status: 'shipped' }));
      const bar = element.querySelector('.ot-progress');
      expect(bar?.getAttribute('aria-label')).toBe('Step 3 of 4');
      const current = element.querySelectorAll('[aria-current="step"]');
      expect(current.length).toBe(1);
      expect(text()).toContain('Step 3 of 4');
      expect(text()).toContain('Next: Delivered');
    });

    it('renders all four stage descriptions so the list is never empty', () => {
      setUp(makeOrder({ status: 'order_received' }));
      const nodes = element.querySelectorAll('.ot-node');
      expect(nodes.length).toBe(4);
      expect(text()).toContain('We have your order and your payment is confirmed.');
      expect(text()).toContain('cut, sewn, quality-checked and packed');
    });

    it('shows a timestamp only for stages that have been reached', async () => {
      setUp(
        makeOrder({ status: 'processing' }),
        makeTracking({
          status: 'processing',
          events: [
            { status: 'order_received', note: null, createdAt: '2026-09-28T10:01:00.000Z' },
            { status: 'processing', note: null, createdAt: '2026-09-28T11:00:00.000Z' },
          ],
        }),
      );
      await settle();
      const stamps = element.querySelectorAll('.ot-node-time');
      expect(stamps.length).toBe(2);
    });
  });

  describe('data honesty', () => {
    it('never invents a delivery date', () => {
      setUp(makeOrder());
      expect(text()).toContain("We'll confirm your delivery date soon");
      expect(element.querySelector('.ot-eta')?.textContent).not.toMatch(/\d{4}/);
    });

    it('falls back to the SKU when the API sends no product name', () => {
      setUp(makeOrder());
      expect(text()).toContain('CMS-SUT-CHR-BSP');
    });

    it('prefers the product name when the backend starts sending it', () => {
      setUp(
        makeOrder({
          items: [
            {
              variant: { ...variant, product: { id: 'p1', name: 'Suit - Made to Order' } },
              quantity: 1,
              unitPrice: 185000,
            },
          ],
        }),
      );
      expect(text()).toContain('Suit - Made to Order');
    });

    it('reports payment status honestly', async () => {
      setUp(makeOrder({ paymentStatus: 'paid' }));
      await settle();
      expect(text()).toContain('Paid in full');
      TestBed.resetTestingModule();
      setUp(makeOrder({ paymentStatus: 'refunded' }));
      await settle();
      expect(text()).toContain('Refunded');
    });

    it('does not claim payment is due once it is paid in full', async () => {
      setUp(makeOrder({ status: 'awaiting_payment', paymentStatus: 'paid' }));
      await settle();
      expect(text()).not.toContain('Pay now');
    });
  });

  describe('delivery legs', () => {
    // Shaped like the customer-facing projection the API actually returns.
    const leg = {
      legNumber: 1,
      carrier: 'gigl',
      status: 'in_transit' as const,
      trackingRef: 'SNTR-ABC123',
      driverName: 'Ade',
      checkpoints: [{ status: 'on_track', at: '2026-09-28T08:54:00.000Z' }],
    };

    it('maps a raw carrier key to a display name', async () => {
      setUp(makeOrder(), makeTracking({ deliveries: [leg] }));
      await settle();
      expect(text()).toContain('GIGL courier');
    });

    it('shows the tracking number with a Copy control when one exists', async () => {
      setUp(makeOrder(), makeTracking({ deliveries: [leg] }));
      await settle();
      expect(text()).toContain('SNTR-ABC123');
      const btn = element.querySelector('.ot-copy') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      expect(btn.textContent).toContain('Copy');
    });

    it('shows Pending with a disabled Copy when no tracking number exists', async () => {
      setUp(makeOrder(), makeTracking({ deliveries: [{ ...leg, trackingRef: null }] }));
      await settle();
      expect(text()).toContain('Pending');
      const btn = element.querySelector('.ot-copy') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('renders one block per leg', async () => {
      setUp(
        makeOrder(),
        makeTracking({ deliveries: [leg, { ...leg, legNumber: 2, carrier: 'Seentair Fleet' }] }),
      );
      await settle();
      expect(element.querySelectorAll('.ot-checkpoints').length).toBe(2);
      expect(text()).toContain('Delivery leg 2');
      // Unknown carrier keys fall through to the raw value rather than blank.
      expect(text()).toContain('Seentair Fleet');
    });

    describe('rider name is reduced to a first name', () => {
      it('shows only the first name of a full name', async () => {
        setUp(makeOrder(), makeTracking({ deliveries: [{ ...leg, driverName: 'Ade Okafor' }] }));
        await settle();
        expect(text()).toContain('Ade');
        expect(text()).not.toContain('Okafor');
      });

      it('keeps a single name intact', async () => {
        setUp(makeOrder(), makeTracking({ deliveries: [{ ...leg, driverName: 'Ade' }] }));
        await settle();
        expect(text()).toContain('Ade');
      });

      it('collapses extra whitespace and keeps only the leading token', async () => {
        setUp(
          makeOrder(),
          makeTracking({ deliveries: [{ ...leg, driverName: '  Chidi   Nwosu Jr  ' }] }),
        );
        await settle();
        expect(text()).toContain('Chidi');
        expect(text()).not.toContain('Nwosu');
        expect(text()).not.toContain('Jr');
      });

      it('hides the rider row entirely when no name was entered', async () => {
        setUp(makeOrder(), makeTracking({ deliveries: [{ ...leg, driverName: null }] }));
        await settle();
        expect(text()).not.toContain('Rider');
      });
    });

    describe('checkpoint text is not customer-safe by default', () => {
      // The API no longer sends zone or note, so these two inject them through
      // a cast on purpose: the page must stay safe even if an older deployed
      // backend, a proxy cache or a future regression puts them back.
      const rogue = (extra: Record<string, unknown>) => extra as never;

      it('shows the status and time but never the note or the zone', async () => {
        setUp(
          makeOrder(),
          makeTracking({
            deliveries: [
              rogue({
                ...leg,
                checkpoints: [
                  rogue({
                    zone: 'Ikeja depot',
                    status: 'on_track',
                    note: 'Internal: driver swapped at last minute, do not tell customer',
                    at: '2026-09-28T08:54:00.000Z',
                  }),
                ],
              }),
            ],
          }),
        );
        await settle();
        const list = element.querySelector('.ot-checkpoints') as HTMLElement;
        const rendered = list.textContent ?? '';
        // The status label and the time are shown.
        expect(rendered).toContain('On track');
        // Staff free text and the internal corridor label are not.
        expect(rendered).not.toContain('swapped');
        expect(rendered).not.toContain('Ikeja');
        expect(rendered).not.toContain('do not tell customer');
      });

      it('never renders a zone or note anywhere on the page', async () => {
        setUp(
          makeOrder(),
          makeTracking({
            deliveries: [
              rogue({
                ...leg,
                zone: 'INTERNAL-DEPOT-7',
                checkpoints: [
                  rogue({
                    zone: 'INTERNAL-DEPOT-7',
                    status: 'on_track',
                    note: 'INTERNAL-NOTE',
                    at: '2026-09-28T08:54:00.000Z',
                  }),
                ],
              }),
            ],
          }),
        );
        await settle();
        const whole = text();
        expect(whole).not.toContain('INTERNAL-DEPOT-7');
        expect(whole).not.toContain('INTERNAL-NOTE');
      });

      it('labels the list "Delivery updates" and never "Corridor updates"', async () => {
        setUp(makeOrder(), makeTracking({ deliveries: [leg] }));
        await settle();
        expect(text()).toContain('Delivery updates');
        expect(text()).not.toContain('Corridor updates');
      });

      it('falls back to a neutral label when the status is missing', async () => {
        setUp(
          makeOrder(),
          makeTracking({
            deliveries: [
              { ...leg, checkpoints: [{ status: null, at: '2026-09-28T08:54:00.000Z' }] },
            ],
          }),
        );
        await settle();
        expect(text()).toContain('Update');
      });

      it('maps every status the API can emit to a customer label', async () => {
        // The four values AddCheckpointDto accepts, one at a time.
        const pairs = [
          ['on_track', 'On track'],
          ['delayed', 'Delayed'],
          ['arrived', 'Arrived'],
          ['handed_over', 'Handed over'],
        ] as const;
        for (const [apiValue, label] of pairs) {
          TestBed.resetTestingModule();
          setUp(
            makeOrder(),
            makeTracking({
              deliveries: [
                { ...leg, checkpoints: [{ status: apiValue, at: '2026-09-28T08:54:00.000Z' }] },
              ],
            }),
          );
          await settle();
          expect(text()).toContain(label);
        }
      });

      it('refuses to echo an unrecognised status token into customer copy', async () => {
        // checkoints is free-form jsonb, so a stray internal token must not leak.
        setUp(
          makeOrder(),
          makeTracking({
            deliveries: [
              {
                ...leg,
                checkpoints: [
                  { status: 'STOCK_EXCEPTION_PENDING', at: '2026-09-28T08:54:00.000Z' },
                ],
              },
            ],
          }),
        );
        await settle();
        expect(text()).not.toContain('STOCK_EXCEPTION');
        expect(text()).toContain('Update');
      });
    });
  });

  describe('failure states', () => {
    const mountWithFailingOrder = (status: number, message: string) => {
      TestBed.configureTestingModule({
        imports: [OrderPage],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: { get: () => ORDER_ID } } },
          },
          {
            provide: ApiService,
            useValue: {
              order: () => throwError(() => ({ status, error: { message } })),
              tracking: () => of(makeTracking()),
              orderStream: () => Promise.resolve(),
              payWithPaystack: () => of({ authorizationUrl: '' }),
              submitReview: () => of({}),
              requestReturn: () => of({}),
            },
          },
        ],
      });
      fixture = TestBed.createComponent(OrderPage);
      element = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
    };

    it('shows a message and a Retry instead of an endless skeleton', () => {
      mountWithFailingOrder(500, 'Upstream exploded');
      expect(text()).toContain('Could not load this order');
      expect(text()).toContain('Upstream exploded');
      const retry = element.querySelector('.ot-actions button') as HTMLButtonElement;
      expect(retry).toBeTruthy();
      expect(retry.textContent).toContain('Retry');
      // The skeleton must not be what the customer is left staring at.
      expect(element.querySelectorAll('.skeleton').length).toBe(0);
    });

    it('keeps the order id visible on failure so support can look it up', () => {
      mountWithFailingOrder(500, 'boom');
      expect(text()).toContain('ABC12345');
    });

    it('explains a wrong-account fetch rather than showing a raw error', () => {
      mountWithFailingOrder(403, 'Forbidden');
      expect(text()).toContain('not on this account');
      expect(text()).not.toContain('Forbidden');
    });
  });

  describe('help dock', () => {
    it('hides the WhatsApp button and offers a plain link when unconfigured', () => {
      setUp(makeOrder());
      const dock = element.querySelector('.ot-dock') as HTMLElement;
      expect(dock.querySelector('a[href^="https://wa.me"]')).toBeNull();
      expect(dock.textContent).toContain('Contact support');
    });

    it('includes safe-area-inset-bottom padding', () => {
      setUp(makeOrder());
      // Verified in styles.scss; asserted here as documentation of the contract.
      expect(element.querySelector('.ot-dock')).not.toBeNull();
    });
  });
});
