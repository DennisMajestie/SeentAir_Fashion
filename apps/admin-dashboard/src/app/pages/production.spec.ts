import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeConfirmService, SeCurrencyService } from '@seentair/ui';
import { Observable, of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService, Batch } from '../api.service';
import { QcRejectDrawer } from './production-drawers';
import { moveCopy, nextStage, qcErrors, emptyQc } from './production-format';
import { ProductionPage } from './production.page';

export const STAGES = ['planned', 'cutting', 'sewing', 'finishing', 'qc', 'completed'];
export const batch = (over: Partial<Batch> = {}): Batch => ({
  id: 'aaaaaaaa-28dd-473f-b587-42ff7ab8865d',
  quantity: 40,
  stage: 'sewing',
  variant: { sku: 'TEE-BLK-M' },
  plannedDate: '2026-10-01',
  ...over,
});
export const signIn = (level: string): void =>
  TestBed.inject(AccessService).me.set({
    name: 'Ngozi A.',
    email: 'ngozi@seentair.test',
    role: 'production_manager',
    totpEnabled: false,
    access: { manufacturing: level },
  });

describe('production format', () => {
  it('finds the next stage and stops at the last one', () => {
    expect(nextStage(STAGES, 'sewing')).toBe('finishing');
    expect(nextStage(STAGES, 'completed')).toBeNull();
  });

  it('says that completing a batch adds its units to stock', () => {
    expect(moveCopy(batch({ stage: 'qc' }), 'completed', STAGES).consequence).toContain(
      'added to stock',
    );
    expect(moveCopy(batch(), 'finishing', STAGES).title).toBe('Move batch #AAAAAAAA to Finishing?');
  });

  it('refuses a QC reject with no reason or more units than the batch has', () => {
    const errors = qcErrors({ ...emptyQc(), quantity: 41 }, batch());
    expect(errors.quantity).toBe('This batch has only 40 units.');
    expect(errors.reason).toBe('Say what was wrong with the units.');
  });
});

describe('ProductionPage', () => {
  let fixture: ComponentFixture<ProductionPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const mount = (batches: Observable<unknown>, level = 'full'): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'batches',
      'products',
      'batchCost',
      'qcRejections',
      'moveBatch',
      'createApproval',
      'createBatch',
      'wip',
      'planning',
    ]);
    api.batches.and.returnValue(batches as never);
    api.wip.and.returnValue(
      of({ stages: [], totalUnits: 0, activeBatches: 0, materials: [] }) as never,
    );
    api.planning.and.returnValue(of({ windowDays: 30, variants: [] }) as never);
    api.products.and.returnValue(of({ data: [], total: 0 }) as never);
    api.batchCost.and.returnValue(of({ totalCost: 45000 }));
    api.qcRejections.and.returnValue(of([{ quantity: 2 }]));
    api.moveBatch.and.returnValue(of({}));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    signIn(level);
    fixture = TestBed.createComponent(ProductionPage);
    fixture.detectChanges();
  };
  const two = (): Observable<unknown> =>
    of({ data: [batch(), batch({ id: 'bbbbbbbb-1', stage: 'qc' })], stages: STAGES });
  afterEach(() => fixture?.destroy());

  it('lists batches in the shared table with the stage from the shared mapping', () => {
    mount(two());
    const rows = ([...el().querySelectorAll('se-table')][0] as HTMLElement).querySelectorAll(
      'tbody tr',
    );
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('#AAAAAAAA');
    expect(rows[0].querySelector('se-status')!.textContent).toContain('Sewing');
    expect(rows[1].querySelector('se-status')!.textContent).toContain('Quality check');
    expect(rows[0].textContent).toContain('₦45,000');
    expect(el().querySelector('h1')!.textContent).toBe('Production');
  });

  it('reads work in progress from the server snapshot, per stage and material', () => {
    mount(two());
    api.wip.and.returnValue(
      of({
        stages: [
          { stage: 'planned', batches: 2, units: 120 },
          { stage: 'cutting', batches: 1, units: 40 },
          { stage: 'sewing', batches: 3, units: 95 },
        ],
        totalUnits: 255,
        activeBatches: 6,
        materials: [
          { materialId: 'm1', materialName: 'Ankara cotton', unit: 'yards', quantity: 30 },
          { materialId: 'm2', materialName: 'Thread', unit: 'rolls', quantity: 12 },
        ],
      }) as never,
    );
    fixture.componentInstance.load();
    fixture.detectChanges();

    const cards = [...el().querySelectorAll('se-metric-card')];
    expect(cards[0].textContent).toContain('255');
    expect(cards[0].textContent).toContain('Cutting 40');
    expect(cards[0].textContent).toContain('in 6 batches');
    expect(cards[1].textContent).toContain('Materials issued to WIP');
    expect(cards[1].textContent).toContain('2');
    expect(cards[1].textContent).toContain('Ankara cotton 30 yards');
    expect(cards[1].textContent).toContain('+1 more');
  });

  it('falls back to the listed batches and says so when the WIP snapshot fails', () => {
    mount(two());
    api.wip.and.returnValue(throwError(() => ({ status: 500 })) as never);
    fixture.componentInstance.load();
    fixture.detectChanges();

    const cards = [...el().querySelectorAll('se-metric-card')];
    // Both listed batches are still in production: 40 + 40 units.
    expect(cards[0].textContent).toContain('80');
    expect(cards[0].textContent).toContain('Listed only');
  });

  it('plans a batch straight from a planning suggestion, prefilled with the units', () => {
    mount(two());
    api.planning.and.returnValue(
      of({
        windowDays: 30,
        variants: [
          {
            variantId: 'v-1',
            sku: 'TEE-BLK-M',
            productName: 'Black Tee',
            soldLastWindow: 50,
            openOrderUnits: 12,
            stockOnHand: 8,
            inProduction: 30,
            suggested: 24,
          },
        ],
      }) as never,
    );
    fixture.componentInstance.load();
    fixture.detectChanges();

    const tables = [...el().querySelectorAll('se-table')];
    const plan = tables.find((t) => t.textContent!.includes('Planning suggestions'))!;
    expect(plan.textContent).toContain('TEE-BLK-M');
    expect(plan.textContent).toContain('24');

    fixture.componentInstance.planFrom({
      variantId: 'v-1',
      sku: 'TEE-BLK-M',
      productName: 'Black Tee',
      soldLastWindow: 50,
      openOrderUnits: 12,
      stockOnHand: 8,
      inProduction: 30,
      suggested: 24,
    });
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.nb.variantId).toBe('v-1');
    expect(page.nb.quantity).toBe(24);
    expect(page.starting()).toBe(true);
  });

  it('shows an empty plan without demand instead of a broken table', () => {
    mount(two());
    const plan = [...el().querySelectorAll('se-table')].find((t) =>
      t.textContent!.includes('Planning suggestions'),
    )!;
    expect(plan.textContent).toContain('No suggestions right now');
    expect(plan.textContent).not.toContain('Plan batch');
  });

  it('shows a failed load as an error with a retry, never as "no batches"', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    const banner = el().querySelector('.se-banner--danger')!;
    expect(banner.textContent).toContain('Batches could not be loaded');
    expect(banner.textContent).toContain('Database is unreachable.');
    expect(el().textContent).not.toContain('No batches yet');
  });

  it('asks before moving a batch, and does nothing when declined', async () => {
    mount(two());
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
    await fixture.componentInstance.move(batch());
    expect(ask.calls.mostRecent().args[0].title).toBe('Move batch #AAAAAAAA to Finishing?');
    expect(ask.calls.mostRecent().args[0].consequence).toContain('audit log');
    expect(api.moveBatch).not.toHaveBeenCalled();

    ask.and.resolveTo(true);
    await fixture.componentInstance.move(batch());
    expect(api.moveBatch).toHaveBeenCalledWith(batch().id, 'finishing');
  });

  it('does not offer the write actions to a role that can only view', () => {
    mount(two(), 'view');
    const buttons = [...el().querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(buttons.some((text) => /Start batch|Move to/.test(text))).toBeFalse();
    expect(el().querySelector('se-drawer')).toBeNull();
    const batchesTable = [...el().querySelectorAll('se-table')][0] as HTMLElement;
    expect(batchesTable.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('refuses to start a batch with nothing filled in, and says why', () => {
    mount(two());
    expect(el().textContent).toContain('Start batch');
    fixture.componentInstance.openStart();
    fixture.componentInstance.createBatch();
    fixture.detectChanges();
    expect(api.createBatch).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Choose the variant to make.');
    expect(document.body.textContent).toContain(
      'A batch can only start once management has approved it.',
    );
  });
});

describe('QcRejectDrawer', () => {
  it('needs a reason, then asks before burning units and does nothing when declined', async () => {
    const api = jasmine.createSpyObj<ApiService>('ApiService', ['recordQcRejection']);
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    const fixture = TestBed.createComponent(QcRejectDrawer);
    fixture.componentRef.setInput('batch', batch());
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const drawer = fixture.componentInstance;
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);

    await drawer.submit();
    expect(drawer.errors().reason).toBe('Say what was wrong with the units.');
    expect(ask).not.toHaveBeenCalled();

    drawer.form.reason = 'Crooked seam';
    drawer.form.quantity = 3;
    await drawer.submit();
    expect(ask.calls.mostRecent().args[0].title).toBe('Burn 3 units from batch #AAAAAAAA?');
    expect(ask.calls.mostRecent().args[0].consequence).toContain('cannot be undone');
    expect(api.recordQcRejection).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
