import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ApiService, Invoice } from '../api.service';
import { InvoiceDetailPage } from './invoice-detail.page';

/**
 * The invoice is the document a buyer forwards to their finance team, so the
 * one thing that must never be wrong on it is whether it is paid.
 *
 * Payment used to be reachable only by scrolling to the settlement ledger. These
 * cover the banner that replaced that: settled reads green and needs no action,
 * unpaid reads as a demand and points at the finance desk. The no-part-payment
 * rule is spelled out here too, because a pro-forma invoice is exactly where a
 * buyer looks for permission to pay a third of it now and the rest later.
 */
const ORDER_ID = 'a1b2c3d4-e5f6-0000-1111-222233334444';

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    orderId: ORDER_ID,
    createdAt: '2026-03-04T10:00:00Z',
    status: 'processing',
    paymentStatus: 'pending',
    totalAmount: 153000,
    items: [{ sku: 'CARGO-S', quantity: 20, unitPrice: 7650, lineTotal: 153000 }],
    payments: [],
    ...over,
  } as Invoice;
}

describe('InvoiceDetailPage', () => {
  let fixture: ComponentFixture<InvoiceDetailPage>;
  let payCalls: Array<{ id: string; amount: number }>;
  payCalls = [];

  async function boot(
    data: Invoice[] = [invoice()],
    payResult: { authorizationUrl: string } | 'fail' = { authorizationUrl: '' },
  ): Promise<void> {
    payCalls.length = 0;
    TestBed.configureTestingModule({
      imports: [InvoiceDetailPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => ORDER_ID } } } },
        {
          provide: ApiService,
          useValue: {
            invoices: () => of({ data, total: data.length }),
            me: () => of({ name: 'Test Buyer', email: 'b@test' }),
            payWithPaystack: (id: string, amount: number) => {
              payCalls.push({ id, amount });
              return payResult === 'fail'
                ? throwError(() => ({ error: { message: 'Paystack unavailable' } }))
                : of(payResult);
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(InvoiceDetailPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function bar(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.paybar');
  }

  function text(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
  }

  describe('payment banner', () => {
    it('puts payment state above the manifest, not below it', async () => {
      await boot();
      const doc = (fixture.nativeElement as HTMLElement).innerHTML;
      expect(doc.indexOf('paybar')).toBeLessThan(doc.indexOf('Itemized manifest'));
    });

    it('demands action on an unpaid invoice', async () => {
      await boot();
      expect(bar()!.classList.contains('settied')).toBe(false);
      expect(text()).toContain('Action required');
    });

    it('states the no-part-payment rule while payment is outstanding', async () => {
      await boot();
      expect(text()).toContain('no part-payments');
    });

    it('offers Pay now as a real button, not a link', async () => {
      await boot();
      const cta = bar()!.querySelector('.paybar-cta') as HTMLButtonElement;
      expect(cta.tagName).toBe('BUTTON');
      expect(cta.textContent).toContain('153,000.00');
    });

    it('keeps the finance desk reachable for buyers paying by transfer', async () => {
      await boot();
      const alt = bar()!.querySelector('.paybar-alt') as HTMLAnchorElement;
      expect(alt.getAttribute('href')).toBe('tel:+23418887400');
    });

    it('charges the invoice total, because wholesale has no part-payments', async () => {
      await boot([invoice({ totalAmount: 153000 })]);
      (bar()!.querySelector('.paybar-cta') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(payCalls).toEqual([{ id: ORDER_ID, amount: 153000 }]);
    });

    it('reports a failed handoff instead of pretending it worked', async () => {
      await boot([invoice()], 'fail');
      (bar()!.querySelector('.paybar-cta') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(text()).toContain('Paystack unavailable');
      // The button must come back, or the buyer is locked out of retrying.
      expect((bar()!.querySelector('.paybar-cta') as HTMLButtonElement).disabled).toBe(false);
    });

    it('refuses to navigate to an empty checkout URL', async () => {
      await boot([invoice()], { authorizationUrl: '' });
      (bar()!.querySelector('.paybar-cta') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(text()).toContain('no checkout URL');
    });

    it('confirms settlement in green once paid', async () => {
      await boot([
        invoice({
          paymentStatus: 'paid',
          payments: [
            { id: 'pay0000001111', method: 'bank_transfer', date: '2026-03-05T10:00:00Z' } as never,
          ],
        }),
      ]);
      expect(bar()!.classList.contains('settled')).toBe(true);
      expect(text()).toContain('Paid in full');
      expect(text()).toContain('bank transfer');
      expect(text()).not.toContain('Action required');
    });

    it('offers no action once settled', async () => {
      await boot([invoice({ paymentStatus: 'paid' })]);
      expect(bar()!.querySelector('.paybar-cta')).toBeNull();
      expect(bar()!.querySelector('.paybar-alt')).toBeNull();
    });

    it('labels an unpaid invoice pro-forma', async () => {
      await boot();
      expect(text()).toContain('Pro-forma invoice');
      expect(text()).not.toContain('Commercial tax invoice');
    });

    it('labels a settled invoice a commercial tax invoice', async () => {
      await boot([invoice({ paymentStatus: 'paid' })]);
      expect(text()).toContain('Commercial tax invoice');
      expect(text()).not.toContain('Pro-forma invoice');
    });

    it('renders no banner when the order id does not resolve', async () => {
      await boot([]);
      expect(bar()).toBeNull();
    });
  });
});
