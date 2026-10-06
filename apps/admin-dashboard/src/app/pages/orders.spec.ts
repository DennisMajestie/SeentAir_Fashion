import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SeConfirmService, SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AdminOrder, ApiService } from '../api.service';
import { OrderDetailPage } from './order-detail.page';
import { nextStep, orderRef } from './order-format';
import { OrdersPage } from './orders.page';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

const order = (over: Partial<AdminOrder> = {}): AdminOrder => ({
  id: '8626acab-28dd-473f-b587-42ff7ab8865d',
  channel: 'retail',
  status: 'order_received',
  paymentStatus: 'paid',
  totalAmount: 9000,
  createdAt: '2026-09-15T15:27:00',
  customer: { id: 'c1', name: 'Adaeze O.' },
  items: [
    {
      id: 'l1',
      quantity: 1,
      unitPrice: 9000,
      variant: { id: 'v1', sku: 'TEE-BLK-M', size: 'M', colour: 'black' },
    },
  ],
  ...over,
});

describe('order steps', () => {
  it('offers the one next fulfilment step for a paid order', () => {
    expect(nextStep(order())!.label).toBe('Mark as processing');
    expect(nextStep(order({ status: 'processing' }))!.status).toBe('shipped');
    expect(nextStep(order({ status: 'shipped' }))!.status).toBe('delivered');
  });

  it('offers nothing for an unpaid order: full payment comes first', () => {
    expect(nextStep(order({ paymentStatus: 'unpaid' }))).toBeNull();
  });

  it('offers nothing once an order is finished, cancelled or on a stock exception', () => {
    for (const status of ['delivered', 'cancelled', 'returned', 'stock_exception']) {
      expect(nextStep(order({ status })))
        .withContext(status)
        .toBeNull();
    }
  });

  it('writes the reference the way staff say it', () => {
    expect(orderRef('8626acab-28dd-473f-b587-42ff7ab8865d')).toBe('#8626ACAB');
  });
});

describe('OrdersPage', () => {
  let fixture: ComponentFixture<OrdersPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (orders: unknown): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['orders', 'advanceOrder']);
    api.orders.and.callFake(((_c?: string, _l?: number, status?: string) =>
      status ? of({ data: [], total: 0 }) : orders) as never);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    fixture = TestBed.createComponent(OrdersPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('lists orders in the shared table with status and payment from the shared mapping', () => {
    mount(
      of({
        data: [
          order(),
          order({ id: 'bbbbbbbb-1', paymentStatus: 'unpaid', status: 'awaiting_payment' }),
        ],
        total: 2,
      }),
    );
    const rows = el().querySelectorAll('se-table tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('#8626ACAB');
    expect(rows[0].textContent).toContain('Order received');
    expect(rows[0].textContent).toContain('₦9,000');
    expect(rows[1].textContent).toContain('Awaiting payment');
    expect(el().querySelector('h1')!.textContent).toBe('Orders');
  });

  it('shows a failed load as an error with a retry, never as "no orders"', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    const banner = el().querySelector('.se-banner--danger')!;
    expect(banner.textContent).toContain('Orders could not be loaded');
    expect(banner.textContent).toContain('Database is unreachable.');
    expect(el().textContent).not.toContain('No orders yet');
  });

  it('says so plainly when there really are no orders', () => {
    mount(of({ data: [], total: 0 }));
    expect(el().querySelector('.se-empty__heading')!.textContent).toBe('No orders yet');
  });

  it('offers the next step only on the rows it applies to', () => {
    mount(of({ data: [order(), order({ id: 'cccccccc-1', status: 'delivered' })], total: 2 }));
    const rows = el().querySelectorAll('se-table tbody tr');
    expect(rows[0].querySelector('.se-table__actions button')!.textContent).toContain(
      'Mark as processing',
    );
    expect(rows[1].querySelector('.se-table__actions button')).toBeNull();
  });

  it('asks before moving an order forward, stating that it cannot go back', async () => {
    mount(of({ data: [order()], total: 1 }));
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
    await fixture.componentInstance.advance(order());
    const asked = ask.calls.mostRecent().args[0];
    expect(asked.title).toBe('Mark order #8626ACAB as processing?');
    expect(asked.consequence).toContain('cannot be moved back');
    expect(asked.confirmLabel).toBe('Mark as processing');
    // Declined: nothing is sent.
    expect(api.advanceOrder).not.toHaveBeenCalled();
  });

  it('opens an order on its own page', () => {
    mount(of({ data: [order()], total: 1 }));
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    el().querySelector<HTMLButtonElement>('.se-table__rowlink')!.click();
    expect(navigate).toHaveBeenCalledWith(['/orders', order().id]);
  });
});

describe('OrderDetailPage', () => {
  let fixture: ComponentFixture<OrderDetailPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (loaded: unknown): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'order',
      'orderTracking',
      'advanceOrder',
      'fulfilOrder',
      'refundStockException',
      'allocateStockException',
    ]);
    api.order.and.returnValue(loaded as never);
    api.orderTracking.and.returnValue(
      of({
        events: [
          { status: 'order_received', note: 'Paid in full', createdAt: '2026-09-15T15:27:00' },
        ],
      }) as never,
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: order().id }) } },
        },
      ],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    fixture = TestBed.createComponent(OrderDetailPage);
    fixture.detectChanges();
  };
  afterEach(() => {
    fixture?.destroy();
    document.querySelectorAll('dialog.se-dialog').forEach((d) => d.remove());
  });

  it('puts both statuses beside the title and the next step as the one primary action', () => {
    mount(of(order()));
    expect(el().querySelector('h1')!.textContent).toBe('Order #8626ACAB');
    expect(
      [...el().querySelectorAll('.se-page__heading .se-badge')].map((b) => b.textContent!.trim()),
    ).toEqual(['Order received', 'Paid']);
    const primary = el().querySelectorAll('.se-page__actions .se-btn--primary');
    expect(primary.length).toBe(1);
    expect(primary[0].textContent!.trim()).toBe('Mark as processing');
  });

  it('shows the items, the facts and the history', () => {
    mount(of(order()));
    expect(el().querySelector('se-table')!.textContent).toContain('TEE-BLK-M');
    expect(el().querySelector('.se-detail__aside')!.textContent).toContain('Adaeze O.');
    expect(el().querySelector('.se-activity__entry')!.textContent).toContain(
      'Order received: Paid in full',
    );
  });

  it('explains why an unpaid order cannot move, and offers no step', () => {
    mount(of(order({ paymentStatus: 'unpaid', status: 'awaiting_payment' })));
    expect(el().querySelector('.se-banner--info')!.textContent).toContain('Awaiting payment');
    expect(el().querySelector('.se-page__actions .se-btn--primary')).toBeNull();
  });

  it('offers allocate and refund on a stock exception, and names the short lines', () => {
    const short = order({ status: 'stock_exception' });
    short.items![0].shortfall = 1;
    mount(of(short));
    expect(el().querySelector('.se-banner--warning')!.textContent).toContain(
      'TEE-BLK-M is short 1 of 1.',
    );
    const actions = [...el().querySelectorAll('.se-page__actions button')].map((b) =>
      b.textContent!.trim(),
    );
    expect(actions).toContain('Allocate stock');
    expect(actions).toContain('Refund');
  });

  it('confirms a refund as destructive, stating the amount and that it cannot be undone', async () => {
    mount(of(order({ status: 'stock_exception' })));
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
    await fixture.componentInstance.refund(order({ status: 'stock_exception' }));
    const asked = ask.calls.mostRecent().args[0];
    expect(asked.danger).toBeTrue();
    expect(asked.consequence).toContain('₦9,000');
    expect(asked.consequence).toContain('cannot be undone');
    expect(asked.confirmLabel).toBe('Record refund');
    expect(api.refundStockException).not.toHaveBeenCalled();
  });

  it('will not save half an address, and says which parts are missing', () => {
    mount(of(order()));
    const page = fixture.componentInstance;
    page.openAddress(order());
    page.address.line = '12 Faulks Road';
    page.saveAddress();
    expect(api.fulfilOrder).not.toHaveBeenCalled();
    expect(page.addressError('city')).toBe('Enter the city or LGA.');
    expect(page.addressError('line')).toBe('');
  });

  it('says the order does not exist instead of showing an empty page', () => {
    mount(throwError(() => ({ status: 404 })));
    expect(el().querySelector('.se-empty__heading')!.textContent).toBe('This order does not exist');
  });

  it('shows a load failure as an error with a retry', () => {
    mount(throwError(() => ({ status: 500, error: { message: 'Database is unreachable.' } })));
    expect(el().querySelector('.se-banner--danger')!.textContent).toContain(
      'The order could not be loaded',
    );
  });
});
