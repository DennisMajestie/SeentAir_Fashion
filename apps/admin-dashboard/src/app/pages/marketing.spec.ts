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
  spend: 0,
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
      'campaignRoi',
      'loyaltyAccounts',
      'adjustLoyalty',
    ]);
    api.campaigns.and.returnValue(campaigns as never);
    api.dashboard.and.returnValue(
      of({
        marketingSourcePerformance: [{ source: 'instagram', orders: 12, revenue: 90000 }],
      }) as never,
    );
    api.campaignRoi.and.returnValue(
      of({ campaigns: [], attributedRevenue: 0, unattributedRevenue: 0, spend: 0, roi: null }) as never,
    );
    api.loyaltyAccounts.and.returnValue(
      of([
        { customerId: 'u1', points: 24, lifetimePoints: 64 },
        { customerId: 'u2', points: 8, lifetimePoints: 8 },
      ]) as never,
    );
    api.adjustLoyalty.and.returnValue(of({}) as never);
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

  it('shows attributed orders, revenue and ROI per campaign, and overall ROI', () => {
    mount(of([campaign({ id: 'c1', spend: 40000 })]));
    api.campaignRoi.and.returnValue(
      of({
        campaigns: [
          { id: 'c1', name: 'Harmattan drop', orders: 6, revenue: 180000, roi: 350 },
        ],
        attributedRevenue: 180000,
        unattributedRevenue: 25000,
        spend: 40000,
        roi: 350,
      }) as never,
    );

    (fixture.componentInstance as unknown as { load: () => void }).load();
    fixture.detectChanges();

    const row = el().querySelector('se-table tbody tr')!;
    expect(row.textContent).toContain('6');
    expect(row.textContent).toContain('₦180,000');
    expect(row.textContent).toContain('350%');
    const cards = [...el().querySelectorAll('.se-metric__label')].map((n) =>
      n.textContent!.trim(),
    );
    expect(cards).toContain('Overall ROI');
    expect(cards).toContain('Campaign spend');
    expect(cards).toContain('Unattributed revenue');
  });

  it('marks a campaign with no spend as "no spend yet" instead of a fake ROI', () => {
    mount(of([campaign({ spend: 0 })]));
    api.campaignRoi.and.returnValue(
      of({
        campaigns: [{ id: 'c1', name: 'Harmattan drop', orders: 0, revenue: 0, roi: null }],
        attributedRevenue: 0,
        unattributedRevenue: 0,
        spend: 0,
        roi: null,
      }) as never,
    );

    (fixture.componentInstance as unknown as { load: () => void }).load();
    fixture.detectChanges();

    expect(el().querySelector('se-table tbody tr')!.textContent).toContain('No spend yet');
    expect(el().textContent).not.toContain('Overall ROI');
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

  it('sends the spend entered in the drawer with the new campaign', () => {
    mount(of([]));
    const page = fixture.componentInstance;
    page.form.name = 'Boost';
    page.form.startDate = '2026-01-01';
    page.form.endDate = '2026-01-31';
    page.form.spend = 25000;
    api.createCampaign.and.returnValue(of({}) as never);

    page.create();

    expect(api.createCampaign).toHaveBeenCalledWith(
      jasmine.objectContaining({ name: 'Boost', spend: 25000 }),
    );
  });

  it('shows loyalty balances and sends manual adjustments with a reason', () => {
    mount(of([]));
    expect(el().textContent).toContain('Loyalty points outstanding');
    expect(el().textContent).toContain('32');
    expect(el().textContent).toContain('Loyalty members');

    const page = fixture.componentInstance;
    page.loyaltyForm.customerId = 'u1';
    page.loyaltyForm.points = -4;
    page.loyaltyForm.note = 'Goodwill';
    page.loyaltyForm.approvalRequestId = 'appr-1';
    page.adjustLoyalty();

    expect(api.adjustLoyalty).toHaveBeenCalledWith('u1', -4, 'Goodwill', 'appr-1');
  });

  it('offers no add button to a role without full marketing access', () => {
    mount(of([campaign()]), 'view');
    expect(el().textContent).not.toContain('Add campaign');
  });
});
