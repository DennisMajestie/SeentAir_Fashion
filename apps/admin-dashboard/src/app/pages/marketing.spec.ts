import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { CampaignRow, campaignRun } from './marketing-format';
import { MarketingAdminPage } from './marketing.page';

const campaign = (over: Partial<CampaignRow> = {}): CampaignRow => ({
  id: 'c1',
  name: 'Harmattan drop',
  type: 'visibility_boost',
  channel: 'instagram',
  discountPercent: 10,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  ...over,
});

describe('campaign run', () => {
  it('reads live, upcoming and ended from the dates alone', () => {
    const today = new Date('2026-06-15T12:00:00Z');
    expect(campaignRun(campaign(), today)).toBe('live');
    expect(campaignRun(campaign({ startDate: '2026-07-01' }), today)).toBe('upcoming');
    expect(campaignRun(campaign({ endDate: '2026-06-01' }), today)).toBe('ended');
  });
});

describe('MarketingAdminPage', () => {
  let fixture: ComponentFixture<MarketingAdminPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (campaigns: unknown, marketing = 'full'): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'campaigns',
      'createCampaign',
      'dashboard',
    ]);
    api.campaigns.and.returnValue(campaigns as never);
    api.dashboard.and.returnValue(
      of({
        marketingSourcePerformance: [{ source: 'instagram', orders: 12, revenue: 90000 }],
      }) as never,
    );
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    TestBed.inject(AccessService).me.set({
      name: 'T',
      email: 't@x',
      role: 'r',
      totpEnabled: false,
      access: { marketing },
    });
    fixture = TestBed.createComponent(MarketingAdminPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('lists campaigns in the shared table with the type in words and a run badge', () => {
    mount(of([campaign()]));
    const row = el().querySelector('se-table tbody tr')!;
    expect(row.textContent).toContain('Harmattan drop');
    expect(row.textContent).toContain('Visibility boost');
    expect(row.textContent).toContain('10%');
    expect(row.querySelector('se-badge')).not.toBeNull();
    expect(el().textContent).toContain('Orders from Instagram');
    expect(el().textContent).toContain('₦90,000');
  });

  it('shows a failed load as an error, never as "no campaigns yet"', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    expect(el().querySelector('.se-banner--danger')!.textContent).toContain(
      'Database is unreachable.',
    );
    expect(el().textContent).not.toContain('No campaigns yet');
  });

  it('validates on submit and sends nothing until the dates are filled', () => {
    mount(of([]));
    fixture.componentInstance.openAdd();
    fixture.componentInstance.create();
    expect(fixture.componentInstance.errors()['name']).toBeTruthy();
    expect(fixture.componentInstance.errors()['startDate']).toBeTruthy();
    expect(api.createCampaign).not.toHaveBeenCalled();
  });

  it('offers no add button to a role without full marketing access', () => {
    mount(of([campaign()]), 'view');
    expect(el().textContent).not.toContain('Add campaign');
  });
});
