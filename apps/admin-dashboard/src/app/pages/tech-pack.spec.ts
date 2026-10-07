import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { SeConfirmService, SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { TechPackDetailPage } from './tech-pack-detail.page';
import { countOf, measurementTable } from './tech-pack-format';
import { TechPackPage } from './tech-pack.page';

const products = {
  data: [
    {
      id: 'p1',
      name: 'Silk tee',
      category: 'tops',
      basePrice: 9000,
      variants: [
        { id: 'v1', sku: 'TEE-BLK-M', size: 'M', colour: 'black', priceOverride: null },
        { id: 'v2', sku: 'TEE-BLK-L', size: 'L', colour: 'black', priceOverride: 9500 },
      ],
    },
  ],
  total: 1,
};
const pack = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'tp1',
  variantId: 'v1',
  status: 'draft',
  revision: 2,
  silhouette: 'relaxed tee',
  targetYieldUnits: 120,
  cuttingEfficiencyPct: 86,
  dxfUrl: null,
  gradedMeasurements: { S: { chest: 52 }, M: { chest: 54, body_length: 70 } },
  stitchProtocol: '12 stitches per inch',
  laydownProtocol: null,
  ...over,
});
const signIn = (level: string): void =>
  TestBed.inject(AccessService).me.set({
    name: 'Ada',
    email: 'ada@example.com',
    role: 'manager',
    totpEnabled: true,
    access: { catalogue: level },
  });

describe('tech pack format', () => {
  it('turns measurements keyed by size into one row per point of measure', () => {
    const table = measurementTable(pack()['gradedMeasurements']);
    expect(table.sizes).toEqual(['S', 'M']);
    expect(table.rows).toEqual([
      { id: 'chest', S: '52', M: '54' },
      { id: 'body_length', S: '–', M: '70' },
    ]);
  });

  it('writes counts properly', () => {
    expect(countOf(1, 'revision')).toBe('1 revision');
    expect(countOf(3, 'revision')).toBe('3 revisions');
  });
});

describe('TechPackPage', () => {
  let fixture: ComponentFixture<TechPackPage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (packs: unknown): void => {
    const api = jasmine.createSpyObj<ApiService>('ApiService', ['products', 'techPacks']);
    api.products.and.returnValue(of(products) as never);
    api.techPacks.and.returnValue(packs as never);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(TechPackPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('lists every variant in the shared table with the state of its tech pack', () => {
    mount(of([pack({ status: 'approved' })]));
    const rows = el().querySelectorAll('se-table tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('TEE-BLK-M');
    expect(rows[0].textContent).toContain('Approved');
    expect(rows[1].textContent).toContain('No tech pack');
    expect(el().querySelector('h1')!.textContent).toBe('Tech packs');
  });

  it('shows a failed load as an error with a retry, never as an empty list', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    const banner = el().querySelector('.se-banner--danger')!;
    expect(banner.textContent).toContain('Tech packs could not be loaded');
    expect(banner.textContent).toContain('Database is unreachable.');
    expect(el().textContent).not.toContain('No variants yet');
  });

  it('opens a variant on its own page', () => {
    mount(of([pack()]));
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    el().querySelector<HTMLButtonElement>('.se-table__rowlink')!.click();
    expect(navigate).toHaveBeenCalledWith(['/tech-pack', 'v1']);
  });
});

describe('TechPackDetailPage', () => {
  let fixture: ComponentFixture<TechPackDetailPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const actions = (): string[] =>
    [...el().querySelectorAll('.se-page__actions button, .se-card button')].map((b) =>
      b.textContent!.trim(),
    );

  const mount = (packs: unknown, level = 'full'): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'products',
      'techPacks',
      'techPackRevisions',
      'batches',
      'batchCost',
      'createTechPack',
      'updateTechPack',
      'approveTechPack',
    ]);
    api.products.and.returnValue(of(products) as never);
    api.techPacks.and.returnValue(packs as never);
    api.techPackRevisions.and.returnValue(
      of([{ id: 'r1', revision: 1, createdAt: '2026-09-15T15:27:00', snapshot: {} }]) as never,
    );
    api.batches.and.returnValue(of({ data: [], stages: [] }) as never);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'v1' }) } },
        },
      ],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    signIn(level);
    fixture = TestBed.createComponent(TechPackDetailPage);
    fixture.detectChanges();
  };
  afterEach(() => {
    fixture?.destroy();
    document.querySelectorAll('dialog.se-dialog').forEach((d) => d.remove());
  });

  it('shows the pack with its status, measurements and revisions, and one primary action', () => {
    mount(of([pack()]));
    expect(el().querySelector('h1')!.textContent).toBe('Tech pack TEE-BLK-M');
    expect(el().querySelector('.se-page__heading .se-badge')!.textContent!.trim()).toBe('Draft');
    expect(el().querySelector('se-table')!.textContent).toContain('body_length');
    expect(el().querySelector('.se-detail__aside')!.textContent).toContain('1 revision');
    expect(el().querySelector('.se-detail__aside')!.textContent).toContain('₦9,000');
    const primary = el().querySelectorAll('.se-page__actions .se-btn--primary');
    expect(primary.length).toBe(1);
    expect(primary[0].textContent!.trim()).toBe('Approve tech pack');
  });

  it('asks before approving, and does nothing when declined', async () => {
    mount(of([pack()]));
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
    await fixture.componentInstance.approve();
    const asked = ask.calls.mostRecent().args[0];
    expect(asked.title).toBe('Approve tech pack for TEE-BLK-M?');
    expect(asked.consequence).toContain('shop-floor reference');
    expect(asked.consequence).toContain('audit log');
    expect(asked.confirmLabel).toBe('Approve tech pack');
    expect(api.approveTechPack).not.toHaveBeenCalled();
  });

  it('asks before saving over an approved pack, because that returns it to draft', async () => {
    mount(of([pack({ status: 'approved' })]));
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
    const page = fixture.componentInstance;
    page.openSpec();
    page.saveSpec();
    await fixture.whenStable();
    expect(ask.calls.mostRecent().args[0].consequence).toContain('returns to draft');
    expect(api.updateTechPack).not.toHaveBeenCalled();
  });

  it('will not save measurements that are not valid JSON, and says so under the field', () => {
    mount(of([pack()]));
    const page = fixture.componentInstance;
    page.openMeasures();
    page.measuresJson = '{"S": {chest: 52}';
    page.saveMeasures();
    expect(api.updateTechPack).not.toHaveBeenCalled();
    expect(page.measuresError()).toContain('not valid JSON');
  });

  it('leaves out the write actions for a role that can only view the catalogue', () => {
    mount(of([pack()]), 'view');
    expect(actions()).toEqual([]);
  });

  it('offers approval but not editing to a role with approve access', () => {
    mount(of([pack()]), 'approve');
    expect(actions()).toEqual(['Approve tech pack']);
  });

  it('offers to create the pack when the variant has none', () => {
    mount(of([]));
    expect(el().querySelector('.se-empty__heading')!.textContent).toBe(
      'No tech pack for this variant yet',
    );
    expect(actions()).toEqual(['Create tech pack']);
  });

  it('shows a load failure as an error with a retry', () => {
    mount(throwError(() => ({ status: 500, error: { message: 'Database is unreachable.' } })));
    expect(el().querySelector('.se-banner--danger')!.textContent).toContain(
      'The tech pack could not be loaded',
    );
  });
});
