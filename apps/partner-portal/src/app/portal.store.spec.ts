import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { PortalStore } from './portal.store';
import { dashboard } from './testing';

describe('PortalStore', () => {
  let store: PortalStore;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'dashboard',
      'distributions',
      'me',
      'inventorySummary',
      'products',
      'messages',
    ]);
    api.dashboard.and.returnValue(of(dashboard()));
    api.distributions.and.returnValue(
      of([
        {
          period: '2026-Q3',
          totalProfit: 1_000_000,
          reinvestmentAmount: 400_000,
          dividendPool: 400_000,
          reserveAmount: 200_000,
          myDividend: 100_000,
          founderAmount: 240_000,
          partnerBreakdown: [{ partnerId: 'p1', amount: 100_000 }],
        },
      ]),
    );
    api.me.and.returnValue(
      of({
        id: 'u1',
        email: 'partner@seentair.test',
        name: 'Test Partner',
        role: 'partner_investor',
        totpEnabled: true,
      }),
    );
    api.inventorySummary.and.returnValue(of([]));
    api.products.and.returnValue(of({ data: [], total: 0 }));
    api.messages.and.returnValue(of({ data: [], total: 0 }));

    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    store = TestBed.inject(PortalStore);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('takes the reporting period from the dashboard payload, not the browser clock', () => {
    expect(store.periodLabel()).toBe('—');

    store.load(true);

    expect(store.periodLabel()).toBe('2026-Q3');
  });

  it('loads declared distributions from the dedicated endpoint', () => {
    store.load(true);

    expect(api.distributions).toHaveBeenCalledOnceWith('p1');
    expect(store.distributions()?.length).toBe(1);
    expect(store.distributions()?.[0].reserveAmount).toBe(200_000);
  });

  it('does not swallow a dashboard failure into an empty portfolio', () => {
    api.dashboard.and.returnValue(throwError(() => new Error('unreachable')));

    store.load(true);

    expect(store.loadError()).toBeTruthy();
    expect(store.loadErrorKind()).toBe('generic');
    expect(store.distributions()).toBeNull();
  });

  it('turns an unlinked partner account into an actionable setup message', () => {
    api.dashboard.and.returnValue(
      throwError(() => ({ error: { message: 'No partner record for this account' } })),
    );

    store.load(true);

    expect(store.loadErrorKind()).toBe('setup');
    expect(store.loadError()).toContain('administrator needs to add you as a partner');
    expect(store.loadError()).not.toContain('No partner record');
  });
});
