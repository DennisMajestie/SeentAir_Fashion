import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ApiService, Invoice } from '../api.service';
import { HomePage } from './home.page';

/**
 * The operations tracker derives a pipeline stage from real OrderStatus values.
 * These cover the cases that would silently mislead a buyer: a cancelled order
 * must not advance the track, an unknown status must not crash the rank lookup,
 * and an empty account must read as "nothing in flight" rather than showing a
 * filled first segment.
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

function stubApi(invoices: Invoice[]): ApiService {
  return {
    me: () => of({ name: 'Test Buyer' }),
    pricing: () => of({ moq: 20, tier: null } as never),
    invoices: () => of({ data: invoices } as never),
    notifications: () => of({ data: [] } as never),
    reorder: () => of({} as never),
  } as unknown as ApiService;
}

async function mount(invoices: Invoice[]): Promise<ComponentFixture<HomePage>> {
  await TestBed.configureTestingModule({
    imports: [HomePage],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  })
    .overrideComponent(HomePage, { set: { providers: [] } })
    .compileComponents();

  TestBed.overrideProvider(ApiService, { useValue: stubApi(invoices) });
  const fixture = TestBed.createComponent(HomePage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<HomePage>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('HomePage operations tracker', () => {
  it('reports an empty account as settled, with nothing in the pipeline', async () => {
    const f = await mount([]);
    const page = f.componentInstance;

    expect(page.opsStatus()).toBe('All settled');
    expect(page.opsHeadline()).toBe('Nothing in the pipeline');
    expect(page.pipelineStep()).toBe(-1);
    expect(page.trkLabel()).toBe('Nothing in flight');
    expect(text(f)).toContain('Nothing in the pipeline');
  });

  it('lights only the first segment when a batch is still being received', async () => {
    const f = await mount([invoice('order_received')]);
    const page = f.componentInstance;

    expect(page.pipelineStep()).toBe(0);
    // Paid fixture, so no payment warning: a live order reads as in production.
    expect(page.opsStatus()).toBe('In production');
    expect(page.trkLabel()).toContain('Received');
    expect(text(f)).toContain('Next: Processing');
  });

  it('advances the track to the furthest live stage, not the latest order', async () => {
    // A newer order_received must not drag the track back from shipped.
    const f = await mount([invoice('shipped'), invoice('order_received')]);
    expect(f.componentInstance.pipelineStep()).toBe(2);
    expect(text(f)).toContain('Next: Delivered');
  });

  it('ignores cancelled, returned and refunded orders when placing the track', async () => {
    const f = await mount([invoice('cancelled'), invoice('returned')]);
    expect(f.componentInstance.pipelineStep()).toBe(-1);
  });

  it('treats an unrecognised status as out of pipeline rather than crashing', async () => {
    const f = await mount([invoice('stock_exception')]);
    expect(() => f.componentInstance.pipelineStep()).not.toThrow();
    expect(f.componentInstance.pipelineStep()).toBe(-1);
  });

  it('raises the badge to warn when payment is outstanding', async () => {
    const f = await mount([invoice('processing', 'unpaid')]);
    const page = f.componentInstance;

    expect(page.awaitingPay()).toBe(1);
    expect(page.opsStatus()).toBe('Awaiting payment');
    expect(page.opsBadgeClass()).toBe('warn');
    expect(page.opsNext()).toContain('Settle the outstanding total');
  });

  it('raises the badge to in-transit once something ships', async () => {
    const f = await mount([invoice('shipped')]);
    const page = f.componentInstance;

    expect(page.inTransit()).toBe(1);
    expect(page.opsStatus()).toBe('In transit');
    expect(page.opsBadgeClass()).toBe('');
    expect(page.opsHeadline()).toBe('01 in transit');
  });

  it('marks a paid account clear on the awaiting-payment row', async () => {
    const f = await mount([invoice('processing', 'paid')]);
    const page = f.componentInstance;

    expect(page.awaitingPay()).toBe(0);
    const row = page.kpis().find((k) => k.label === 'Awaiting payment');
    expect(row?.value).toBe('Clear');
    expect(row?.cls).toBe('clear');
  });

  it('renders four progress segments with the right aria bounds', async () => {
    const f = await mount([invoice('shipped')]);
    const bar = (f.nativeElement as HTMLElement).querySelector('[role="progressbar"]');

    expect(bar).toBeTruthy();
    expect(bar?.querySelectorAll('.trk-seg').length).toBe(4);
    expect(bar?.getAttribute('aria-valuemin')).toBe('1');
    expect(bar?.getAttribute('aria-valuemax')).toBe('4');
    // shipped is index 2, so the exposed value is 3 of 4.
    expect(bar?.getAttribute('aria-valuenow')).toBe('3');
    expect(bar?.querySelectorAll('.trk-seg.on').length).toBe(3);
    expect(bar?.querySelectorAll('.trk-seg.current').length).toBe(1);
  });

  it('surfaces a failed invoice fetch without breaking the shell', async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    TestBed.overrideProvider(ApiService, {
      useValue: {
        me: () => throwError(() => new Error('offline')),
        pricing: () => throwError(() => new Error('offline')),
        invoices: () => throwError(() => new Error('offline')),
        notifications: () => of({ data: [] } as never),
        reorder: () => of({} as never),
      } as unknown as ApiService,
    });

    const f = TestBed.createComponent(HomePage);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();

    expect(f.componentInstance.opsStatus()).toBe('All settled');
    expect(text(f)).toContain('Operations');
  });
});
