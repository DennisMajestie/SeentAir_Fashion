import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { SeConfirmService, SeCurrencyService } from '@seentair/ui';
import { Observable, of, throwError } from 'rxjs';

import { ApiService, DeliveryLegView, WholesaleTracking } from '../api.service';
import { TrackingPage } from './tracking.page';

/**
 * The page renders only the customer-facing projection: a staff note or a
 * zone the API still sends must never reach the DOM, a missing field must
 * never print "undefined", and a lost session must redirect rather than
 * claim the order is missing.
 */
describe('Wholesale TrackingPage', () => {
  let fixture: ComponentFixture<TrackingPage>;
  let element: HTMLElement;
  let api: jasmine.SpyObj<ApiService>;
  let confirm: jasmine.SpyObj<SeConfirmService>;

  const ORDER_ID = 'b1b1b1b1-some-uuid';

  const fullLeg: DeliveryLegView = {
    legNumber: 1,
    carrier: 'gigl',
    status: 'in_transit',
    trackingRef: 'GIGL-1',
    zone: 'Lagos-Ikeja',
    driverName: 'Ade Okafor',
    checkpoints: [
      {
        zone: 'Ikeja depot',
        status: 'on_track',
        note: 'INTERNAL-NOTE-driver-swapped',
        at: '2026-09-28T08:54:00.000Z',
      },
      { status: 'delayed', at: '2026-09-29T10:00:00.000Z' },
    ],
  };

  /** What the customer-facing projection returns: no zone, no note. */
  const reducedLeg: DeliveryLegView = {
    legNumber: 1,
    carrier: 'gigl',
    status: 'in_transit',
    trackingRef: 'GIGL-1',
    driverName: 'Ade',
    checkpoints: [{ status: 'on_track', at: '2026-09-28T08:54:00.000Z' }],
  };

  const trackingWith = (leg: DeliveryLegView | null, status = 'shipped'): WholesaleTracking => ({
    status,
    deliveredAt: null,
    events: [{ status: 'order_received', createdAt: '2026-09-27T08:00:00.000Z' }],
    deliveries: leg ? [leg] : [],
  });

  const configure = (loggedIn: boolean, tracking: () => Observable<WholesaleTracking>) => {
    api = jasmine.createSpyObj<ApiService>(
      'ApiService',
      ['tracking', 'invoices', 'orderSocketStream'],
      { isLoggedIn: loggedIn },
    );
    api.tracking.and.callFake(tracking);
    api.invoices.and.returnValue(of({ data: [], total: 0 }));
    api.orderSocketStream.and.returnValue(new Promise<void>(() => undefined));
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
  };

  /** The tracking fetch runs on a queued microtask; a macrotask lets it settle. */
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  const render = async (): Promise<void> => {
    fixture = TestBed.createComponent(TrackingPage);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();
  };

  const mount = async (leg: DeliveryLegView | null, status = 'shipped'): Promise<void> => {
    configure(true, () => of(trackingWith(leg, status)));
    await render();
  };

  const text = (): string => (element.textContent ?? '').replace(/\s+/g, ' ');
  const kv = (label: string): string | null => {
    const dt = Array.from(element.querySelectorAll('dt')).find(
      (d) => d.textContent?.trim() === label,
    );
    return dt?.nextElementSibling?.textContent?.trim() ?? null;
  };

  afterEach(() => {
    localStorage.clear();
    fixture?.destroy();
  });

  it('puts the pipeline stage beside the title with one plain sentence', async () => {
    await mount(reducedLeg);
    expect(element.querySelector('h1')!.textContent!.trim()).toBe('Batch Live Tracking');
    expect(text()).toContain('#B1B1B1B1');
    expect(element.querySelector('.stage-badge')!.textContent?.trim()).toBe('STAGE 3 / SHIPPED');
    expect(text()).toContain('with the courier and on its way');
    expect(text()).toContain('within 12 hours');
    expect(text()).toContain('Custom orders are excluded from returns');
  });

  describe('against the reduced customer shape', () => {
    beforeEach(async () => mount(reducedLeg));

    it('shows the checkpoint as a timeline entry', () => {
      const entries = element.querySelectorAll('.tl-step');
      expect(entries.length).toBe(2);
      expect(entries[0].textContent).toContain('On track');
      expect(entries[0].textContent).toContain('GIGL courier');
    });

    it('never renders the word undefined or a blank value', () => {
      expect(text()).not.toContain('undefined');
      expect(text()).not.toContain('null');
    });

    it('falls back to the hub copy rather than an empty route value', () => {
      expect(kv('Route')).toBe('Aba workshop to consignee hub');
      expect(text()).toContain('Waybill: GIGL-1');
    });

    it('shows the rider first name only', () => {
      expect(kv('Rider')).toBe('Ade');
    });
  });

  describe('against the current full shape', () => {
    beforeEach(async () => mount(fullLeg));

    it('shows the leg route but never the staff note or the checkpoint zone', () => {
      expect(kv('Route')).toBe('Lagos-Ikeja');
      expect(text()).not.toContain('INTERNAL-NOTE');
      expect(text()).not.toContain('Ikeja depot');
    });

    it('reduces a full rider name to the first name', () => {
      expect(kv('Rider')).toBe('Ade');
      expect(text()).not.toContain('Okafor');
    });

    it('lists checkpoints newest first and flags a delay', () => {
      const entries = element.querySelectorAll('.tl-step');
      expect(entries[0].textContent).toContain('Delayed');
      expect(entries[1].textContent).toContain('On track');
      expect(entries[0].querySelector('.tl-warn')).not.toBeNull();
    });
  });

  describe('checkpoint label mapping', () => {
    let page: TrackingPage;
    beforeEach(async () => {
      await mount(null);
      page = fixture.componentInstance;
    });

    it('maps every status the API can emit', () => {
      expect(page.checkpointLabel({ status: 'on_track' })).toBe('On track');
      expect(page.checkpointLabel({ status: 'delayed' })).toBe('Delayed');
      expect(page.checkpointLabel({ status: 'arrived' })).toBe('Arrived');
      expect(page.checkpointLabel({ status: 'handed_over' })).toBe('Handed over');
    });

    it('refuses to echo an unknown token', () => {
      expect(page.checkpointLabel({ status: 'weird_internal_code' })).toBe('Update');
    });

    it('tolerates a checkpoint with no fields at all', () => {
      expect(page.checkpointLabel({})).toBe('Update');
      expect(page.checkpointLabel(null)).toBe('Update');
    });
  });

  it('omits the rider row when the API sends no driver', async () => {
    await mount({ ...reducedLeg, driverName: null });
    expect(kv('Rider')).toBeNull();
    expect(fixture.componentInstance.riderFirstName()).toBeNull();
  });

  it('reads as delivered once the order status says so', async () => {
    await mount({ ...reducedLeg, status: 'delivered' }, 'delivered');
    expect(element.querySelector('.stage-badge')!.textContent?.trim()).toBe(
      'STAGE 4 / DELIVERED',
    );
    expect(kv('Leg')).toBe('Handed over');
  });

  it('labels the timeline "Production & Milestone History"', async () => {
    await mount(reducedLeg);
    expect(text()).toContain('Production & Milestone History');
    expect(text()).not.toContain('Corridor');
  });

  describe('session loss is not reported as a missing order', () => {
    it('redirects to sign-in with a return url when the session is gone', async () => {
      configure(false, () => throwError(() => ({ status: 401 })));
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      await render();
      expect(navigate).toHaveBeenCalledWith(
        ['/'],
        jasmine.objectContaining({ queryParams: jasmine.objectContaining({ reason: 'session' }) }),
      );
      expect(element.querySelector('.load-error')).toBeNull();
    });

    it('still reports a genuine failure while signed in, with a retry', async () => {
      configure(true, () => throwError(() => ({ status: 500 })));
      spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      await render();
      expect(element.querySelector('.empty-state')).toBeNull();
      const banner = element.querySelector('.load-error')!;
      expect(banner.textContent).toContain('Try again');
      api.tracking.and.returnValue(of(trackingWith(reducedLeg)));
      fixture.componentInstance.retry();
      await tick();
      fixture.detectChanges();
      expect(element.querySelector('.tl-step')).not.toBeNull();
    });
  });

  /**
   * A paid batch the ledger could not fully allocate.
   *
   * The API used to report this as order_received, so a wholesale buyer who
   * had paid in full for a batch the factory could not cover was told the order
   * was received and nothing else. The stored status stays stock_exception
   * (admin wording) and the customer projection renames it to awaiting_stock.
   */
  describe('a paid order awaiting stock is not presented as received', () => {
    it('recognises the status', async () => {
      await mount(null, 'awaiting_stock');
      expect(fixture.componentInstance.awaitingStock()).toBe(true);
    });

    it('tells the buyer the order is paid but short, and needs nothing from them', async () => {
      await mount(null, 'awaiting_stock');

      expect(text()).toContain('Awaiting stock allocation');
      expect(text()).toContain('payment is confirmed');
      expect(text()).toContain('Nothing further is needed from you');
    });

    it('shows it as a warning banner, not a neutral state', async () => {
      await mount(null, 'awaiting_stock');

      expect(element.querySelector('.await-banner')).not.toBeNull();
    });

    it('never leaks the raw internal token', async () => {
      await mount(null, 'awaiting_stock');

      expect(text()).not.toContain('awaiting_stock');
      expect(text()).not.toContain('stock_exception');
    });

    it('leaves the banner off an order that is genuinely just received', async () => {
      await mount(null, 'order_received');

      expect(fixture.componentInstance.awaitingStock()).toBe(false);
      expect(text()).not.toContain('Awaiting stock allocation');
    });

    it('does not fire on an unrelated status that merely mentions stock', async () => {
      await mount(null, 'in_production');

      expect(fixture.componentInstance.awaitingStock()).toBe(false);
    });
  });
});
