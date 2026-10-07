import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { AdminOrder, ApiService } from '../api.service';
import { MessagesPage, threadsFrom } from './messages.page';

const order = (over: Partial<AdminOrder> = {}): AdminOrder => ({
  id: '8626acab-28dd-473f-b587-42ff7ab8865d',
  channel: 'retail',
  status: 'order_received',
  paymentStatus: 'paid',
  totalAmount: 9000,
  createdAt: '2026-09-15T15:27:00',
  customer: { id: 'c1', name: 'Adaeze O.' },
  ...over,
});

describe('threadsFrom', () => {
  it('groups orders by customer, newest first, and skips guest orders', () => {
    const threads = threadsFrom([
      order(),
      order({ id: 'b', createdAt: '2026-10-01T10:00:00', totalAmount: 4000 }),
      order({
        id: 'c',
        customer: { id: 'c2', name: 'Ngozi A.' },
        createdAt: '2026-09-20T10:00:00',
      }),
      order({ id: 'd', customer: null, guestName: 'Guest' }),
    ]);
    expect(threads.map((t) => t.name)).toEqual(['Adaeze O.', 'Ngozi A.']);
    expect(threads[0].orders.map((o) => o.id)).toEqual([
      'b',
      '8626acab-28dd-473f-b587-42ff7ab8865d',
    ]);
    expect(threads[0].lifetimeValue).toBe(13000);
    expect(threads[0].lastOrderAt).toBe('2026-10-01T10:00:00');
  });
});

describe('MessagesPage', () => {
  let fixture: ComponentFixture<MessagesPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (orders: unknown, level: 'view' | 'full' = 'full'): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['orders', 'returns', 'sendNotification']);
    api.orders.and.returnValue(orders as never);
    api.returns.and.returnValue(
      of({ data: [{ id: 'r1', status: 'requested', reason: '' }] as never, total: 1 }),
    );
    api.sendNotification.and.returnValue(of({}));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    TestBed.inject(AccessService).me.set({
      name: 'Tester',
      email: 't@seentair.test',
      role: 'business_owner_admin',
      totpEnabled: false,
      access: { communication: level },
    });
    fixture = TestBed.createComponent(MessagesPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('lists customers with their lifetime value and latest order status', () => {
    mount(
      of({
        data: [order(), order({ id: 'b', status: 'shipped', paymentStatus: 'unpaid' })],
        total: 2,
      }),
    );
    const rows = el().querySelectorAll('se-table tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Adaeze O.');
    expect(rows[0].textContent).toContain('₦18,000');
    expect(el().querySelector('.se-metric-grid')!.textContent).toContain('Returns requested');
    expect(el().querySelector('h1')!.textContent).toBe('Messages');
  });

  it('shows a failed load as an error, never as "no customers"', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    expect(el().querySelector('.se-banner--danger')!.textContent).toContain(
      'Database is unreachable.',
    );
    expect(el().textContent).not.toContain('No customers yet');
  });

  it('sends the update as an in-platform notification on the chosen order', () => {
    mount(of({ data: [order()], total: 1 }));
    const page = fixture.componentInstance;
    page.open(page.threads()[0]);
    page.send(page.threads()[0]);
    expect(api.sendNotification).not.toHaveBeenCalled();
    expect(page.draftError()).toContain('Write the update');
    page.applyMacro('Your order is on its way.');
    page.send(page.threads()[0]);
    expect(api.sendNotification).toHaveBeenCalledWith({
      recipientId: 'c1',
      channel: 'in_platform',
      type: 'order_update',
      message: 'Your order is on its way.',
      relatedOrderId: '8626acab-28dd-473f-b587-42ff7ab8865d',
    });
    expect(page.drawerOpen()).toBeFalse();
  });

  it('lets a view-only role read activity but not send', () => {
    mount(of({ data: [order()], total: 1 }), 'view');
    const page = fixture.componentInstance;
    page.open(page.threads()[0]);
    fixture.detectChanges();
    const drawer = el().querySelector('se-drawer')!;
    expect(drawer.textContent).toContain('#8626ACAB');
    expect(drawer.querySelector('form')).toBeNull();
    expect(drawer.textContent).not.toContain('Send update');
  });
});
