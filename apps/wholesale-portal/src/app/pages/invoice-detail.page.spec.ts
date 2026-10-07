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
    const dt = Array.from(el().querySelectorAll('dt')).find((d) => d.textContent?.trim() === label);
    return dt?.nextElementSibling?.textContent?.trim() ?? null;
  };
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === label);

  async function boot(
    data: Invoice[] | 'fail' = [invoice()],
    payResult: { authorizationUrl: string } | 'fail' = { authorizationUrl: '' },
  ): Promise<void> {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['invoices', 'me', 'payWithPaystack']);
    api.invoices.and.returnValue(
      data === 'fail' ? throwError(() => new Error('down')) : of({ data, total: data.length }),
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
    const badges = Array.from(el().querySelectorAll('se-status')).map((b) => b.textContent?.trim());
    expect(badges).toEqual(['Order received', 'Unpaid']);
    expect(el().querySelector('.se-page__meta, [sePageMeta]')?.textContent).toContain(
      'Pro-forma invoice',
    );
  });

  it('lists the lines and totals in the configured currency', async () => {
    await boot();
    const row = el().querySelector('se-table tbody tr')!;
    expect(row.textContent).toContain('SE-TEE-BLK-L');
    expect(row.textContent).toContain('₦30,000.00');
    expect(kv('Total payable')).toBe('₦120,000.00');
    expect(text()).not.toContain('NaN');
  });

  describe('payment', () => {
    it('states the no-part-payment rule while payment is outstanding', async () => {
      await boot();
      expect(el().querySelector('.se-banner--warning')).not.toBeNull();
      expect(text()).toContain('full payment upfront');
      expect(text()).toContain('no part-payments');
    });

    it('keeps the finance desk reachable for buyers paying by transfer', async () => {
      await boot();
      expect(el().querySelector('a[href="tel:+23418887400"]')).not.toBeNull();
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
      expect(el().querySelector('.se-banner--danger')!.textContent).toContain(
        'Paystack unavailable',
      );
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
      expect(button('Print')).toBeDefined();
      expect(el().querySelector('.se-banner--warning')).toBeNull();
      expect(text()).toContain('Commercial tax invoice');
      expect(kv('Total settled')).toBe('₦120,000.00');
      expect(text()).toContain('via paystack');
    });
  });

  it('shows the empty state with a way back when the order id does not resolve', async () => {
    await boot([]);
    expect(el().querySelector('se-empty-state')!.textContent).toContain('Invoice not found');
    expect(el().querySelector('se-banner')).toBeNull();
  });

  it('shows a retryable error, not the empty state, when the load fails', async () => {
    await boot('fail');
    expect(el().querySelector('se-empty-state')).toBeNull();
    expect(el().querySelector('.se-banner--danger')!.textContent).toContain('Try again');
    api.invoices.and.returnValue(of({ data: [invoice()], total: 1 }));
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(el().querySelector('se-table')).not.toBeNull();
  });
});
