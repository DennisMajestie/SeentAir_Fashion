import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SeCurrencyService, SeToastService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { ApiService, Invoice } from '../api.service';
import { OrdersPage } from './orders.page';

/**
 * The log must agree with Home (same helpers, same figures), the actions must
 * follow the payment state, the filters must never hide orders silently, and
 * a failed load must look like a failure rather than an empty account.
 */
function invoice(
  id: string,
  status: string,
  paymentStatus = 'paid',
  createdAt = '2026-03-04T10:00:00Z',
): Invoice {
  return {
    orderId: `${id}-2222-3333-4444-555555555555`,
    status,
    paymentStatus,
    totalAmount: 120000,
    createdAt,
    items: [
      { sku: `SKU-${id}`, quantity: 4, unitPrice: 20000, lineTotal: 80000 },
      { sku: 'SE-COMMON', quantity: 2, unitPrice: 20000, lineTotal: 40000 },
    ],
    payments:
      paymentStatus === 'paid'
        ? [{ id: 'p', method: 'bank_transfer', amount: 120000, date: createdAt }]
        : [],
  };
}

describe('OrdersPage', () => {
  let fixture: ComponentFixture<OrdersPage>;
  let component: OrdersPage;
  let api: jasmine.SpyObj<ApiService>;
  let router: Router;
  let toast: SeToastService;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const rows = (): HTMLElement[] => Array.from(el().querySelectorAll('se-table tbody tr'));
  const action = (row: Element, label: string): HTMLButtonElement | null =>
    row.querySelector(`button[aria-label^="${label}:"]`);

  const mount = (invoices: unknown): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['invoices', 'reorder']);
    api.invoices.and.returnValue(invoices as never);
    api.reorder.and.returnValue(of({ id: 'new-order-0000' }));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    toast = TestBed.inject(SeToastService);
    fixture = TestBed.createComponent(OrdersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  describe('the log', () => {
    it('renders one row per order with ref, units, total, status and payment', () => {
      mount(
        of({
          data: [invoice('aaaaaaaa', 'order_received', 'unpaid'), invoice('bbbbbbbb', 'shipped')],
        }),
      );
      expect(rows().length).toBe(2);
      const first = rows()[0].textContent ?? '';
      expect(first).toContain('#AAAAAAAA');
      expect(first).toContain('6');
      expect(first).toContain('₦120,000');
      expect(rows()[0].querySelector('se-status[kind="order"]')).not.toBeNull();
      expect(rows()[0].querySelector('se-status[kind="payment"]')).not.toBeNull();
      expect(el().textContent).not.toContain('2222-3333');
    });

    it('describes the account the same way Home does', () => {
      mount(of({ data: [invoice('a', 'order_received', 'unpaid'), invoice('b', 'shipped')] }));
      const description = el().querySelector('.se-page__description')!.textContent ?? '';
      expect(description).toContain('2 orders');
      expect(description).toContain('2 open');
      expect(description).toContain('1 in transit');
      expect(description).toContain('Awaiting payment');
    });

    it('opens the invoice when a row is activated', () => {
      mount(of({ data: [invoice('a', 'shipped')] }));
      component.openInvoice(component.invoices()[0]);
      expect(router.navigate).toHaveBeenCalledWith([
        '/orders',
        'a-2222-3333-4444-555555555555',
        'invoice',
      ]);
    });
  });

  describe('payment state drives the actions', () => {
    it('offers Pay now only while an open order is unpaid', () => {
      mount(
        of({
          data: [
            invoice('a', 'order_received', 'unpaid'),
            invoice('b', 'shipped'),
            invoice('c', 'cancelled', 'unpaid'),
          ],
        }),
      );
      expect(action(rows()[0], 'Pay now')).not.toBeNull();
      expect(action(rows()[1], 'Pay now')).toBeNull();
      expect(action(rows()[2], 'Pay now')).toBeNull();
      for (const row of rows()) {
        expect(action(row, 'View invoice')).not.toBeNull();
        expect(action(row, 'Track')).not.toBeNull();
        expect(action(row, 'Reorder batch')).not.toBeNull();
      }
    });

    it('routes Pay now and Track to the invoice and tracking pages', () => {
      mount(of({ data: [invoice('a', 'order_received', 'unpaid')] }));
      action(rows()[0], 'Pay now')!.click();
      expect(router.navigate).toHaveBeenCalledWith([
        '/orders',
        'a-2222-3333-4444-555555555555',
        'invoice',
      ]);
      action(rows()[0], 'Track')!.click();
      expect(router.navigate).toHaveBeenCalledWith([
        '/orders',
        'a-2222-3333-4444-555555555555',
        'tracking',
      ]);
    });

    it('reorders through the API with the order id, then reloads', () => {
      mount(of({ data: [invoice('a', 'delivered')] }));
      const show = spyOn(toast, 'show');
      action(rows()[0], 'Reorder batch')!.click();
      expect(api.reorder).toHaveBeenCalledWith('a-2222-3333-4444-555555555555');
      expect(api.invoices).toHaveBeenCalledTimes(2);
      expect(show.calls.mostRecent().args[0]).toContain('#NEW-ORD');
    });

    it('toasts a failed reorder with Try again', () => {
      mount(of({ data: [invoice('a', 'delivered')] }));
      const show = spyOn(toast, 'show');
      api.reorder.and.returnValue(throwError(() => ({ error: { message: 'Tier changed' } })));
      action(rows()[0], 'Reorder batch')!.click();
      const [msg, opts] = show.calls.mostRecent().args;
      expect(msg).toBe('Tier changed');
      expect(opts?.tone).toBe('danger');
      expect(opts?.action?.label).toBe('Try again');
    });
  });

  describe('payment banner', () => {
    it('demands action when an open order is unpaid, pointing at the oldest', () => {
      mount(
        of({
          data: [
            invoice('a', 'order_received', 'unpaid', '2026-03-05T10:00:00Z'),
            invoice('b', 'order_received', 'unpaid', '2026-03-01T10:00:00Z'),
            invoice('c', 'shipped'),
          ],
        }),
      );
      const banner = el().querySelector('.se-banner--warning')!;
      expect(banner.textContent).toContain('2 of 3 orders awaiting payment');
      expect(banner.textContent).toContain('full payment upfront');
      (banner.querySelector('button') as HTMLButtonElement).click();
      expect(router.navigate).toHaveBeenCalledWith([
        '/orders',
        'b-2222-3333-4444-555555555555',
        'invoice',
      ]);
    });

    it('stays hidden when nothing is owed, or the unpaid order is cancelled', () => {
      mount(of({ data: [invoice('a', 'shipped'), invoice('b', 'cancelled', 'unpaid')] }));
      expect(el().querySelector('.se-banner--warning')).toBeNull();
    });
  });

  describe('filters never hide orders silently', () => {
    const three = () =>
      of({
        data: [
          invoice('aaaa', 'order_received', 'unpaid'),
          invoice('bbbb', 'shipped'),
          invoice('cccc', 'delivered'),
        ],
      });

    it('filters by payment and by open/closed status', () => {
      mount(three());
      component.filterValue.set({ payment: 'unpaid' });
      expect(component.filtered().map((i) => i.orderId.slice(0, 4))).toEqual(['aaaa']);
      component.filterValue.set({ status: 'closed' });
      expect(component.filtered().map((i) => i.orderId.slice(0, 4))).toEqual(['cccc']);
      component.filterValue.set({ status: 'open', payment: 'paid' });
      expect(component.filtered().map((i) => i.orderId.slice(0, 4))).toEqual(['bbbb']);
    });

    it('searches by order ref (with or without the hash) and by SKU', () => {
      mount(three());
      component.query.set('#BBBB');
      expect(component.filtered().length).toBe(1);
      component.query.set('sku-cccc');
      expect(component.filtered().length).toBe(1);
      component.query.set('se-common');
      expect(component.filtered().length).toBe(3);
    });

    it('reports a filtered-to-nothing state with a clear action, distinct from no orders', () => {
      mount(three());
      component.query.set('nothing-matches');
      fixture.detectChanges();
      expect(el().querySelector('se-empty-state')!.textContent).toContain('No orders match');
      expect(el().querySelector('.se-filter-bar, se-filter-bar')!.textContent).toContain(
        '0 of 3 orders',
      );
      (el().querySelector('se-empty-state button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(component.query()).toBe('');
      expect(rows().length).toBe(3);
    });
  });

  describe('load states', () => {
    it('shows the empty state with a catalogue action for a new account', () => {
      mount(of({ data: [], total: 0 }));
      expect(el().querySelector('se-empty-state')!.textContent).toContain('No orders yet');
      expect(el().querySelector('.se-banner--danger')).toBeNull();
      (el().querySelector('se-empty-state button') as HTMLButtonElement).click();
      expect(router.navigate).toHaveBeenCalledWith(['/catalogue']);
      expect(
        (el().querySelector('se-page button[type="button"]') as HTMLButtonElement).disabled,
      ).toBeTrue();
    });

    it('shows a failure with Try again, never the empty state', () => {
      mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
      expect(el().querySelector('se-empty-state')).toBeNull();
      const banner = el().querySelector('.se-banner--danger')!;
      expect(banner.textContent).toContain('Database is unreachable.');
      api.invoices.and.returnValue(of({ data: [invoice('a', 'shipped')], total: 1 }));
      (banner.querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(rows().length).toBe(1);
      expect(el().querySelector('.se-banner--danger')).toBeNull();
    });
  });

  describe('csv export', () => {
    it('writes a header row and one row per invoice line', async () => {
      mount(of({ data: [invoice('a', 'shipped'), invoice('b', 'delivered')] }));
      let blob: Blob | null = null;
      spyOn(URL, 'createObjectURL').and.callFake((b: Blob | MediaSource) => {
        blob = b as Blob;
        return 'blob:test';
      });
      spyOn(URL, 'revokeObjectURL');
      spyOn(HTMLAnchorElement.prototype, 'click');
      component.exportCsv();
      const lines = (await blob!.text()).trim().split('\n');
      expect(lines.length).toBe(5);
      expect(lines[0]).toContain('"order_id","created_at","status","payment_status","sku"');
      expect(lines[1]).toContain('"SKU-a"');
    });
  });
});
