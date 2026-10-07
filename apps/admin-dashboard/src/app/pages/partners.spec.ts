import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeConfirmService, SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { PartnersAdminPage } from './partners.page';
import {
  DEFAULT_SHARE_CONFIG,
  allocatedEquity,
  covenantSentence,
  sharesFor,
} from './partners-format';

const partner = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  equityPercentage: 12.5,
  investedAmount: 2_500_000,
  user: { id: 'u1', name: 'Emeka A.', email: 'emeka@seentair.test' },
  ...over,
});
const distribution = {
  id: 'd1',
  period: '2026-Q3',
  totalProfit: 1_000_000,
  reinvestmentAmount: 400_000,
  dividendPool: 400_000,
  reserveAmount: 200_000,
  perPartnerBreakdown: { founderCeo: 240_000, partners: [{ name: 'Emeka A.', amount: 50_000 }] },
};
const dashboard = {
  config: DEFAULT_SHARE_CONFIG,
  businessOverview: { totalIncome: 9_000_000, profitLoss: {} },
  investmentInformation: {
    investedAmount: 2_500_000,
    equityPercentage: 12.5,
    shares: 125_000,
    totalShares: 1_000_000,
  },
  inventoryVisibility: { finishedGoodsUnits: 320 },
  profitSharing: [
    { period: '2026-Q3', totalProfit: 1_000_000, dividendPool: 400_000, myDividend: 50_000 },
  ],
};

describe('partners format', () => {
  it('derives shares and allocation from configuration, not literals', () => {
    expect(sharesFor(12.5, 1_000_000)).toBe(125_000);
    expect(allocatedEquity([partner(), partner({ equityPercentage: 7.5 })])).toBe(20);
    expect(covenantSentence({ ...DEFAULT_SHARE_CONFIG, partnersSharePct: 45 })).toContain(
      '45% partners',
    );
  });
});

describe('PartnersAdminPage', () => {
  let fixture: ComponentFixture<PartnersAdminPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (partners: unknown, level: 'view' | 'full' = 'full'): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'partners',
      'partnerDistributions',
      'partnerDashboard',
      'users',
      'createPartner',
      'createApproval',
      'createDistribution',
    ]);
    api.partners.and.returnValue(partners as never);
    api.partnerDistributions.and.returnValue(of([distribution]));
    api.partnerDashboard.and.returnValue(of(dashboard));
    api.users.and.returnValue(
      of({
        data: [
          {
            id: 'u9',
            name: 'Ifeoma K.',
            email: 'ifeoma@seentair.test',
            role: { name: 'partner_investor' },
          },
          {
            id: 'u1',
            name: 'Emeka A.',
            email: 'emeka@seentair.test',
            role: { name: 'partner_investor' },
          },
          { id: 'u2', name: 'Chidi N.', email: 'chidi@seentair.test', role: { name: 'sales' } },
        ],
        total: 3,
      }),
    );
    api.createApproval.and.returnValue(of({ id: 'aaaaaaaa-1111' }));
    api.createDistribution.and.returnValue(of({}));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    TestBed.inject(AccessService).me.set({
      name: 'Tester',
      email: 't@seentair.test',
      role: 'business_owner_admin',
      totpEnabled: false,
      access: { partners: level },
    });
    fixture = TestBed.createComponent(PartnersAdminPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('lists partners with shares and money from configuration, and the distributions', () => {
    mount(of([partner()]));
    const rows = el().querySelectorAll('se-table tbody tr');
    expect(rows[0].textContent).toContain('Emeka A.');
    expect(rows[0].textContent).toContain('125,000');
    expect(rows[0].textContent).toContain('₦2,500,000');
    expect(el().textContent).toContain('2026-Q3');
    expect(el().querySelector('.se-metric-grid')!.textContent).toContain('12.5%');
    expect(el().querySelector('h1')!.textContent).toBe('Partners');
  });

  it('shows a failed load as an error, never as "no partners"', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    expect(el().querySelector('.se-banner--danger')!.textContent).toContain(
      'Database is unreachable.',
    );
    expect(el().textContent).not.toContain('No partners yet');
  });

  it('offers only accounts with the partner role that are not partners yet', () => {
    mount(of([partner()]));
    fixture.componentInstance.openAdd();
    fixture.detectChanges();
    const options = [...el().querySelectorAll('select[name="userId"] option')].map((o) =>
      o.textContent!.trim(),
    );
    expect(options.some((o) => o.startsWith('Ifeoma K.'))).toBeTrue();
    expect(options.some((o) => o.startsWith('Emeka A.'))).toBeFalse();
    expect(options.some((o) => o.startsWith('Chidi N.'))).toBeFalse();
  });

  it('refuses equity beyond what is left of the partners’ share before calling the API', () => {
    mount(of([partner({ equityPercentage: 35 })]));
    const page = fixture.componentInstance;
    page.openAdd();
    page.np = { userId: 'u9', equityPercentage: 10, investedAmount: 100 };
    page.createPartner();
    expect(api.createPartner).not.toHaveBeenCalled();
    expect(page.addErrors()['equity']).toContain('5%');
  });

  it('declares a distribution only with an approval id, after a confirmation', async () => {
    mount(of([partner()]));
    const page = fixture.componentInstance;
    const confirm = TestBed.inject(SeConfirmService);
    spyOn(confirm, 'ask').and.resolveTo(true);
    page.openDistribution();
    page.nd = { period: '2026-Q4', totalProfit: 800_000, approvalRequestId: '' };
    await page.declare();
    expect(api.createDistribution).not.toHaveBeenCalled();
    page.requestApproval();
    expect(api.createApproval).toHaveBeenCalledWith('fund_movement', {
      purpose: 'profit distribution 2026-Q4',
      totalProfit: 800_000,
    });
    await page.declare();
    expect(confirm.ask).toHaveBeenCalled();
    expect(api.createDistribution).toHaveBeenCalledWith({
      period: '2026-Q4',
      totalProfit: 800_000,
      approvalRequestId: 'aaaaaaaa-1111',
    });
  });

  it('shows the partner view as aggregates only, with no customer data', () => {
    mount(of([partner()]));
    fixture.componentInstance.viewAs(partner() as never);
    fixture.detectChanges();
    const drawer = el().querySelector('se-drawer')!;
    expect(drawer.textContent).toContain('₦9,000,000');
    expect(drawer.textContent).toContain('₦50,000.00');
    expect(drawer.textContent).toContain('No customer data');
  });

  it('shows no write actions to a role with view access', () => {
    mount(of([partner()]), 'view');
    expect(el().textContent).not.toContain('Add partner');
    expect(el().textContent).not.toContain('Declare distribution');
  });
});
