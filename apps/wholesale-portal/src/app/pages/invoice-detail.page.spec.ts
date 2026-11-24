import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { SeConfirmService, SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';

import { ApiService, Invoice } from '../api.service';
import { InvoiceDetailPage } from './invoice-detail.page';

const ORDER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    orderId: ORDER_ID,
    createdAt: '2026-03-04T10:00:00Z',
    status: 'order_received',
    paymentStatus: 'unpaid',
    totalAmount: 120000,
    items: [{ sku: 'SE-TEE-BLK-L', quantity: 4, unitPrice: 30000, lineTotal: 120000 }],
    payments: [],
    ...overrides,
  };
}

const paidInvoice = (): Invoice =>
  invoice({
    status: 'processing',
    paymentStatus: 'paid',
    payments: [{ id: 'pay-1', method: 'paystack', amount: 120000, date: '2026-03-05T09:00:00Z' }],
  });

describe('InvoiceDetailPage', () => {
  let fixture: ComponentFixture<InvoiceDetailPage>;
  let api: jasmine.SpyObj<ApiService>;
  let confirm: jasmine.SpyObj<SeConfirmService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => (el().textContent ?? '').replace(/\s+/g, ' ');
  const kv = (label: string): string | null => {
    const row = el().querySelector(`[data-kv="${label}"]`);
    if (!row) return null;
    const spans = row.querySelectorAll('span');
    return spans[spans.length - 1]?.textContent?.trim() ?? null;
  };
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(el().querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
    );

  async function boot(
    data: Invoice[] | 'fail' = [invoice()],
    payResult: { authorizationUrl: string } | 'fail' = { authorizationUrl: '' },
  ): Promise<void> {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'invoices',
      'invoiceById',
      'me',
      'payWithPaystack',
    ]);
    api.invoices.and.returnValue(
      data === 'fail' ? throwError(() => new Error('down')) : of({ data, total: data.length }),
    );
    api.invoiceById.and.returnValue(
      data === 'fail'
        ? throwError(() => new Error('down'))
        : of(data.find((i) => i.orderId === ORDER_ID) ?? null),
    );
    api.me.and.returnValue(
      of({ id: 'u1', email: 'b@test', role: 'wholesaler', name: 'Test Buyer' }),
    );
    api.payWithPaystack.and.returnValue(
      payResult === 'fail'
        ? throwError(() => ({ error: { message: 'Paystack unavailable' } }))
        : of(payResult),
    );
    confirm = jasmine.createSpyObj<SeConfirmService>('SeConfirmService', ['ask', 'askWithReason']);
    confirm.ask.and.resolveTo(true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: SeConfirmService, useValue: confirm },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: ORDER_ID }) } },
        },
      ],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    fixture = TestBed.createComponent(InvoiceDetailPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  }

  afterEach(() => fixture?.destroy());

  it('titles the page with the order reference and both statuses beside it', async () => {
    await boot();
    expect(el().querySelector('h1')!.textContent).toContain('#AAAAAAAA');
    const badges = Array.from(el().querySelectorAll('.status-pill')).map((b) =>
      b.textContent?.trim(),
    );
    expect(badges).toEqual(['Order received', 'Unpaid']);
    expect(el().querySelector('.meta-line')?.textContent).toContain('Pro-forma invoice');
  });

  it('lists the lines and totals in the configured currency', async () => {
    await boot();
    const line = el().querySelector('.line-item')!;
    expect(line.textContent).toContain('SE-TEE-BLK-L');
    expect(line.textContent).toContain('₦30,000.00');
    expect(kv('Total payable')).toBe('₦120,000.00');
    expect(text()).not.toContain('NaN');
  });

  describe('payment', () => {
    it('states the no-part-payment rule while payment is outstanding', async () => {
      await boot();
      expect(el().querySelector('.pay-banner')).not.toBeNull();
      expect(text()).toContain('full payment upfront');
      expect(text()).toContain('no part-payments');
    });

    it('points transfer payers to support without inventing a phone number', async () => {
      await boot();
      expect(text()).toContain('Contact Seentair support');
      expect(el().querySelector('a[href^="tel:"]')).toBeNull();
    });

    it('charges the invoice total after the buyer confirms the amount', async () => {
      await boot([invoice()], { authorizationUrl: '' });
      button('Pay now')!.click();
      await settle();
      expect(confirm.ask).toHaveBeenCalledWith(
        jasmine.objectContaining({ confirmLabel: 'Pay ₦120,000.00' }),
      );
      expect(api.payWithPaystack).toHaveBeenCalledWith(ORDER_ID, 120000);
    });

    it('does nothing when the buyer cancels the confirmation', async () => {
      await boot();
      confirm.ask.and.resolveTo(false);
      button('Pay now')!.click();
      await settle();
      expect(api.payWithPaystack).not.toHaveBeenCalled();
    });

    it('reports a failed handoff instead of pretending it worked', async () => {
      await boot([invoice()], 'fail');
      button('Pay now')!.click();
      await settle();
      expect(el().querySelector('.pay-error')!.textContent).toContain('Paystack unavailable');
      expect(fixture.componentInstance.paying()).toBeFalse();
    });

    it('refuses to navigate to an empty checkout URL', async () => {
      await boot([invoice()], { authorizationUrl: '' });
      button('Pay now')!.click();
      await settle();
      expect(text()).toContain('Nothing has been charged');
      expect(fixture.componentInstance.paying()).toBeFalse();
    });

    it('offers no payment action once settled, and names the settlement', async () => {
      await boot([paidInvoice()]);
      expect(button('Pay now')).toBeUndefined();
      expect(button('Print invoice')).toBeDefined();
      expect(text()).not.toContain('Awaiting 100% Upfront Settlement');
      expect(text()).toContain('Commercial tax invoice');
      expect(kv('Total settled')).toBe('₦120,000.00');
      expect(text()).toContain('via paystack');
    });
  });

  it('never offers payment on a cancelled order, and says why', async () => {
    await boot([invoice({ status: 'cancelled', paymentStatus: 'unpaid' })]);
    expect(button('Pay now')).toBeUndefined();
    expect(text()).not.toContain('Awaiting 100% Upfront Settlement');
    expect(text()).toContain('This order is cancelled, so nothing is payable.');
    expect(kv('Total')).toBe('₦120,000.00');
    await fixture.componentInstance.payNow(
      invoice({ status: 'cancelled', paymentStatus: 'unpaid' }),
    );
    expect(api.payWithPaystack).not.toHaveBeenCalled();
  });

  it('shows the empty state with a way back when the order id does not resolve', async () => {
    await boot([]);
    expect(el().querySelector('.empty-state')!.textContent).toContain('Invoice not found');
    expect(el().querySelector('.pay-banner')).toBeNull();
  });

  it('shows a retryable error, not the empty state, when the load fails', async () => {
    await boot('fail');
    expect(el().querySelector('.empty-state')).toBeNull();
    expect(el().querySelector('.load-error')!.textContent).toContain('Try again');
    api.invoices.and.returnValue(of({ data: [invoice()], total: 1 }));
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(el().querySelector('.line-item')).not.toBeNull();
  });
});
