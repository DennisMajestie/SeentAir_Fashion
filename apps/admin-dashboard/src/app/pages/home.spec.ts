import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService, Dashboard } from '../api.service';
import { HomePage } from './home.page';

const DASHBOARD: Dashboard = {
  salesToday: { orders: 6, revenue: 30000 },
  profitLoss: { income: 2777000, expenditure: 250000, net: 2527000 },
  salesByChannel: [],
  marketingSourcePerformance: [],
  production: [
    { stage: 'Sewing', batches: 2 },
    { stage: 'Completed', batches: 5 },
  ],
  inventory: {
    finishedGoodsUnits: 1148,
    lowStockMaterialCount: 1,
    lowStockMaterials: [{ name: 'Cotton fabric', currentQuantity: 40, reorderThreshold: 50 }],
  },
  pendingApprovals: 3,
  range: { key: 'today', from: '', to: '' },
  metrics: { revenue: 30000, priorRevenue: 24000, openOrders: 4, priorOpenOrders: 2 },
  series: [
    { label: '08:00', revenue: 30000, orders: 6 },
    { label: '09:00', revenue: 0, orders: 0 },
  ],
  statusBreakdown: [{ status: 'delivered', count: 6 }],
  trends: { approvals: [], lowStock: [] },
} as unknown as Dashboard;

const ALL = [
  'manufacturing',
  'raw_materials',
  'catalogue',
  'inventory',
  'retail_orders',
  'wholesale_orders',
  'custom_orders',
  'payments',
  'returns',
  'accounting',
  'logistics',
  'marketing',
  'analytics',
  'partners',
  'staff_access',
  'approvals_audit',
  'communication',
];
const OWNER = Object.fromEntries(ALL.map((m) => [m, 'full']));
const INVENTORY = {
  analytics: 'view',
  catalogue: 'view',
  inventory: 'full',
  logistics: 'view',
  manufacturing: 'view',
  raw_materials: 'full',
  retail_orders: 'view',
  returns: 'view',
  wholesale_orders: 'view',
};

describe('HomePage', () => {
  let fixture: ComponentFixture<HomePage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const labels = (): string[] =>
    [...el().querySelectorAll('.se-metric__label')].map((n) => n.textContent!.trim());
  const card = (label: string): string =>
    [...el().querySelectorAll('se-metric-card')]
      .find((c) => c.querySelector('.se-metric__label')!.textContent!.trim() === label)!
      .textContent!.replace(/\s+/g, ' ')
      .trim();

  const mount = (access: Record<string, string>, dashboard: unknown = of(DASHBOARD)): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'dashboard',
      'lowStock',
      'bestSellers',
      'pendingApprovals',
      'auditLog',
      'batches',
      'returns',
      'deliveries',
      'products',
    ]);
    api.dashboard.and.returnValue(dashboard as never);
    api.lowStock.and.returnValue(
      of({
        materials: [
          { id: 'm1', name: 'Cotton fabric', unit: 'm', currentQuantity: 40, reorderThreshold: 50 },
        ],
        variants: [{ variantId: 'v1', currentQuantity: 5 }],
        variantThreshold: 10,
      }),
    );
    api.bestSellers.and.returnValue(of([]));
    api.pendingApprovals.and.returnValue(
      of([
        {
          id: 'a1',
          actionType: 'price_change',
          status: 'pending',
          payload: null,
          requestedBy: { name: 'Test Sales' },
          createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        },
      ]),
    );
    api.auditLog.and.returnValue(of({ data: [], total: 0 }));
    api.batches.and.returnValue(
      of({
        data: [],
        stages: [
          'Production Planned',
          'Cutting',
          'Sewing',
          'Finishing',
          'Quality Control',
          'Completed',
        ],
      }),
    );
    api.returns.and.returnValue(of({ data: [], total: 0 }));
    api.deliveries.and.returnValue(of({ data: [], total: 0 }));
    api.products.and.returnValue(of({ data: [], total: 0 }));
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
      access,
    });
    fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  describe('for the owner', () => {
    it('answers the five questions, in order, each as one linked card', () => {
      mount(OWNER);
      expect(labels()).toEqual([
        'Sales today',
        'Profit and loss',
        'Low stock',
        'In production',
        'Awaiting approval',
      ]);
      const links = [...el().querySelectorAll<HTMLAnchorElement>('a.se-metric-link')].map((a) =>
        a.getAttribute('href'),
      );
      expect(links).toEqual(['/orders', '/accounting', '/inventory', '/production', '/approvals']);
    });

    it('shows sales against the day before', () => {
      mount(OWNER);
      expect(card('Sales today')).toContain('₦30,000');
      expect(card('Sales today')).toContain('25.0%');
      expect(card('Sales today')).toContain('vs yesterday');
    });

    it('says profit and loss is to date, not for the period', () => {
      mount(OWNER);
      expect(card('Profit and loss')).toContain('₦2,527,000');
      expect(card('Profit and loss')).toContain('To date: ₦2,777,000 in, ₦250,000 out');
    });

    it('counts low stock across materials and product sizes', () => {
      mount(OWNER);
      expect(card('Low stock')).toContain('2');
      expect(card('Low stock')).toContain('1 material, 1 product size');
    });

    it('does not count finished batches as in production', () => {
      mount(OWNER);
      expect(card('In production')).toContain('2 batches');
      expect(card('In production')).toContain('Most are at sewing');
    });

    it('says how long the oldest approval has waited', () => {
      mount(OWNER);
      expect(card('Awaiting approval')).toContain('3');
      expect(card('Awaiting approval')).toContain('Oldest raised 2 days ago');
    });
  });

  describe('for the Inventory role', () => {
    it('shows stock and production, and no money at all', () => {
      mount(INVENTORY);
      expect(labels()).toEqual(['Open orders', 'Low stock', 'In production', 'Returns waiting']);
      expect(el().textContent).not.toContain('Profit and loss');
      expect(el().textContent).not.toContain('₦');
      expect(el().querySelector('se-line-chart')).toBeNull();
    });

    it('does not ask the API for what the role cannot see', () => {
      mount(INVENTORY);
      expect(api.pendingApprovals).not.toHaveBeenCalled();
      expect(api.auditLog).not.toHaveBeenCalled();
      expect(api.lowStock).toHaveBeenCalled();
    });
  });

  it('shows a failed load as an error with a retry, not as zeros', () => {
    mount(
      OWNER,
      throwError(() => ({ error: { message: 'Database is unreachable.' } })),
    );
    expect(el().querySelector('.se-banner--danger')!.textContent).toContain(
      'The summary could not be loaded',
    );
    expect(el().querySelector('se-metric-card')).toBeNull();
  });

  it('refuses a custom range that ends before it starts', () => {
    mount(OWNER);
    const page = fixture.componentInstance;
    page.setRange('custom');
    page.from = '2026-10-06';
    page.to = '2026-10-01';
    api.dashboard.calls.reset();
    page.load();
    expect(page.rangeError()).toBe('The To date is before the From date.');
    expect(api.dashboard).not.toHaveBeenCalled();
  });
});
