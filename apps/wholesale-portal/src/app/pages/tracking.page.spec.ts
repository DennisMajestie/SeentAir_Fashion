import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ApiService, DeliveryLegView, WholesaleTracking } from '../api.service';
import { TrackingPage } from './tracking.page';

/**
 * The wholesale tracking page has to keep working across BOTH API shapes: the
 * projection that still sends zone/note, and the customer-facing one that omits
 * them. These tests pin that, so the page is safe to ship either side of the
 * backend change - in either order.
 */
describe('Wholesale TrackingPage', () => {
  let fixture: ComponentFixture<TrackingPage>;
  let element: HTMLElement;

  const ORDER_ID = 'b-some-uuid';

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

  const trackingWith = (leg: DeliveryLegView | null): WholesaleTracking =>
    ({
      status: 'shipped',
      deliveredAt: null,
      events: [],
      deliveries: leg ? [leg] : [],
    }) as WholesaleTracking;

  const mount = (leg: DeliveryLegView | null) => {
    TestBed.configureTestingModule({
      imports: [TrackingPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => ORDER_ID } } },
        },
        {
          provide: ApiService,
          useValue: {
            tracking: () => of(trackingWith(leg)),
            invoices: () => of({ data: [], total: 0 }),
            orderStream: () => Promise.resolve(),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(TrackingPage);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  /**
   * Tracking is fetched inside a queueMicrotask so a burst of notifications
   * cannot stampede the API. detectChanges() is synchronous, so the microtask
   * has to be flushed and the view re-checked before data is on screen.
   */
  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  };

  const text = () => element.textContent ?? '';

  afterEach(() => TestBed.resetTestingModule());

  describe('renders correctly against the reduced customer shape', () => {
    beforeEach(async () => {
      mount(reducedLeg);
      await settle();
    });

    it('shows the checkpoint status', () => {
      expect(text()).toContain('On track');
    });

    it('never renders the note', () => {
      expect(text()).not.toContain('INTERNAL-NOTE');
    });

    it('never renders the word undefined or a blank value', () => {
      expect(text()).not.toContain('undefined');
      expect(text()).not.toContain('null');
    });

    it('falls back to the hub copy rather than an empty route cell', () => {
      expect(text()).toContain('Aba workshop');
    });

    it('shows the rider first name only', () => {
      expect(text()).toContain('Rider');
    });
  });

  describe('renders correctly against the current full shape', () => {
    beforeEach(async () => {
      mount(fullLeg);
      await settle();
    });

    it('still does not show the staff note or the zone', () => {
      expect(text()).toContain('On track');
      expect(text()).not.toContain('INTERNAL-NOTE');
      expect(text()).not.toContain('Ikeja depot');
      expect(text()).not.toContain('undefined');
    });

    it('reduces a full rider name to the first name', () => {
      expect(text()).toContain('Ade');
      expect(text()).not.toContain('Okafor');
    });
  });

  describe('checkpoint label mapping', () => {
    // Pure function of the status token: no tracking data needed, so the
    // component is mounted once and the method called directly.
    let page: TrackingPage;

    beforeEach(() => {
      mount(null);
      page = fixture.componentInstance;
    });

    it('maps every status the API can emit', () => {
      expect(page.checkpointLabel({ status: 'on_track' })).toBe('On track');
      expect(page.checkpointLabel({ status: 'delayed' })).toBe('Delayed');
      expect(page.checkpointLabel({ status: 'arrived' })).toBe('Arrived');
      expect(page.checkpointLabel({ status: 'handed_over' })).toBe('Handed over');
    });

    it('refuses to echo an unknown token', () => {
      expect(page.checkpointLabel({ status: 'STOCK_EXCEPTION_PENDING' })).toBe('Update');
      expect(page.checkpointLabel({ status: null })).toBe('Update');
      expect(page.checkpointLabel({ status: '' })).toBe('Update');
    });

    it('tolerates a checkpoint with no fields at all', () => {
      expect(page.checkpointLabel({})).toBe('Update');
    });
  });

  describe('rider name', () => {
    it('returns the first token, or null when absent', async () => {
      mount(fullLeg);
      await settle();
      const page = fixture.componentInstance;
      expect(page.riderFirstName()).toBe('Ade');

      TestBed.resetTestingModule();
      mount({ ...fullLeg, driverName: null });
      await settle();
      expect(fixture.componentInstance.riderFirstName()).toBeNull();

      TestBed.resetTestingModule();
      mount({ ...fullLeg, driverName: '   ' });
      await settle();
      expect(fixture.componentInstance.riderFirstName()).toBeNull();
    });
  });

  describe('leg zone', () => {
    it('returns null when the field is absent, so no blank cell renders', async () => {
      mount(reducedLeg);
      await settle();
      expect(fixture.componentInstance.legZone()).toBeNull();
    });

    it('returns the zone when the API still sends one', async () => {
      mount(fullLeg);
      await settle();
      expect(fixture.componentInstance.legZone()).toBe('Lagos-Ikeja');
    });
  });

  it('labels the section "Delivery updates", never "Corridor updates"', async () => {
    mount(fullLeg);
    await settle();
    expect(text()).toContain('Delivery updates');
    expect(text()).not.toContain('Corridor updates');
  });

  /**
   * A lost session and a missing order are indistinguishable from the client:
   * tracking() answers both with 404 on purpose, so an unauthenticated caller
   * cannot probe which order ids exist. Rendering "not found" for what is
   * really an expired session sends people hunting for a broken order -- and it
   * is not a rare edge case, it is what a SameSite=Lax refresh cookie produces
   * on every page reload (COOKIE_SECURE=false in a deployed env). So a signed-out
   * visitor is sent to sign in and back to the order they were reading.
   */
  describe('session loss is not reported as a missing order', () => {
    /**
     * The real Router is kept (the template's routerLink needs
     * createUrlTree) and only `navigate` is spied on.
     */
    const mountSession = (loggedIn: boolean, trackingResult: () => Observable<WholesaleTracking>) => {
      TestBed.configureTestingModule({
        imports: [TrackingPage],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: { get: () => ORDER_ID } } },
          },
          {
            provide: ApiService,
            useValue: {
              isLoggedIn: loggedIn,
              tracking: trackingResult,
              invoices: () => of({ data: [], total: 0 }),
              orderStream: () => Promise.resolve(),
            },
          },
        ],
      });
      const router = TestBed.inject(Router);
      const navigate = spyOn(router, 'navigate').and.resolveTo(true);
      fixture = TestBed.createComponent(TrackingPage);
      element = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      return { navigate, router };
    };

    it('redirects to sign-in with a return url when the session is gone', async () => {
      const { navigate, router } = mountSession(false, () => throwError(() => ({ status: 404 })));
      await settle();

      expect(navigate).toHaveBeenCalledWith(['/'], {
        queryParams: { returnUrl: router.url, reason: 'session' },
      });
    });

    it('does not claim the order is missing', async () => {
      mountSession(false, () => throwError(() => ({ status: 404 })));
      await settle();

      expect(text()).not.toContain('not found');
      expect(fixture.componentInstance.failed()).toBe(false);
    });

    it('still reports a genuine failure while signed in', async () => {
      // Signed in and still 404 -> the order really is missing, and the page
      // must say so rather than bouncing the user to login.
      const { navigate } = mountSession(true, () => throwError(() => ({ status: 404 })));
      await settle();

      expect(navigate).not.toHaveBeenCalled();
      expect(fixture.componentInstance.failed()).toBe(true);
    });
  });
});
