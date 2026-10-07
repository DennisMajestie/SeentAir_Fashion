import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';

import { ApiService, Invoice, Pricing } from '../api.service';
import { pipelineStep, summarise } from '../wholesale-format';
import { HomePage } from './home.page';

/**
 * The account summary derives one state from real OrderStatus values. These
 * cover the cases that would mislead a buyer: a cancelled order must not
 * advance the track or count as awaiting payment, an unknown status must not
 * crash the rank lookup, and an empty account must read as "nothing in
 * flight" rather than a filled first segment.
 */

function invoice(
  status: string,
  paymentStatus = 'paid',
  createdAt = '2026-03-04T10:00:00Z',
): Invoice {
  return {
    orderId: `11111111-2222-3333-4444-55555555555${status.length}`,
    status,
    paymentStatus,
    totalAmount: 120000,
    createdAt,
    items: [{ sku: 'SE-1', quantity: 4, unitPrice: 30000, lineTotal: 120000 }],
    payments: [],
  } as unknown as Invoice;
}

describe('wholesale account summary', () => {
  it('reports an empty account as settled, with nothing in the pipeline', () => {
    expect(summarise([]).status).toBe('All settled');
    expect(pipelineStep([])).toBe(-1);
  });

  it('advances the track to the furthest live stage, not the latest order', () => {
    expect(pipelineStep([invoice('shipped'), invoice('order_received')])).toBe(2);
  });

  it('ignores cancelled, returned and refunded orders when placing the track', () => {
    expect(pipelineStep([invoice('cancelled'), invoice('returned'), invoice('refunded')])).toBe(-1);
  });

  it('treats an unrecognised status as out of pipeline rather than crashing', () => {
    expect(pipelineStep([invoice('on_hold')])).toBe(-1);
  });

  it('warns when payment is outstanding, but not for a cancelled batch', () => {
    expect(summarise([invoice('order_received', 'unpaid')]).status).toBe('Awaiting payment');
    expect(summarise([invoice('order_received', 'unpaid')]).tone).toBe('warning');
    expect(summarise([invoice('cancelled', 'unpaid')]).awaitingPayment).toBe(0);
  });

  it('moves to in transit once something ships', () => {
    expect(summarise([invoice('shipped')]).status).toBe('In transit');
  });
});

describe('HomePage', () => {
  let fixture: ComponentFixture<HomePage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (invoices: unknown): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'me',
      'pricing',
      'invoices',
      'notifications',
      'reorder',
    ]);
    api.me.and.returnValue(
      of({ id: 'u1', email: 'b@x.test', role: 'wholesaler', name: 'Test Buyer' }),
    );
    api.pricing.and.returnValue(
      of({
        moq: 20,
        tier: { name: 'Tier B', discountPercent: 20 },
        hasDiscount: true,
      } as unknown as Pricing),
    );
    api.invoices.and.returnValue(invoices as never);
    api.notifications.and.returnValue(of({ data: [], total: 0 }));
    api.reorder.and.returnValue(of({ id: 'new-order' }));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('names the buyer, their tier and the batch minimum, and lists recent orders', () => {
    mount(of({ data: [invoice('order_received'), invoice('shipped')] }));
    expect(el().querySelector('h1')!.textContent).toBe('Test Buyer');
    expect(el().querySelector('.se-page__description')!.textContent).toContain('Tier B');
    expect(el().querySelector('.se-page__description')!.textContent).toContain('20-unit minimum');
    const rows = el().querySelectorAll('se-table tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('₦120,000');
    expect(rows[0].textContent).toContain('Order received');
    expect(el().querySelector('.se-banner--warning')).toBeNull();
  });

  it('demands action when an order is unpaid, and offers the invoice', () => {
    mount(of({ data: [invoice('order_received', 'unpaid'), invoice('delivered')] }));
    const banner = el().querySelector('.se-banner--warning')!;
    expect(banner.textContent).toContain('1 of 2 orders awaiting payment');
    expect(banner.textContent).toContain('View invoices');
  });

  it('shows a failed invoice fetch as an error, never as "no orders yet"', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    expect(el().querySelector('.se-banner--danger')!.textContent).toContain(
      'Database is unreachable.',
    );
    expect(el().textContent).not.toContain('No orders yet');
    expect(el().querySelector('h1')!.textContent).toBe('Test Buyer');
  });

  it('lights the track up to the furthest live stage', () => {
    mount(of({ data: [invoice('shipped'), invoice('cancelled')] }));
    const on = el().querySelectorAll('.track__step--on');
    expect(on.length).toBe(3);
    expect(el().querySelector('.track')!.getAttribute('aria-valuenow')).toBe('3');
  });
});
