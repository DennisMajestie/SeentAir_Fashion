import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SeConfirmService } from '@seentair/ui';
import { Observable, of, throwError } from 'rxjs';
import { ApiService } from '../api.service';
import { FloorKioskPage } from './floor-kiosk.page';
import { STAGES, batch, signIn } from './production.spec';

describe('FloorKioskPage', () => {
  let fixture: ComponentFixture<FloorKioskPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const mount = (batches: Observable<unknown>, level = 'full'): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'batches',
      'auditLog',
      'qcRejections',
      'batchScans',
      'batchTelemetry',
      'batch',
      'moveBatch',
      'recordBatchScan',
    ]);
    api.batches.and.returnValue(batches as never);
    api.auditLog.and.returnValue(of({ data: [], total: 0 }));
    api.qcRejections.and.returnValue(of([{ quantity: 2 }]));
    api.batchScans.and.returnValue(of([{ scannedQty: 10 }]));
    api.batchTelemetry.and.returnValue(of([]));
    api.batch.and.returnValue(of({ barcode: 'SE-0001' }));
    api.moveBatch.and.returnValue(of({}));
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    signIn(level);
    fixture = TestBed.createComponent(FloorKioskPage);
    fixture.detectChanges();
  };
  const one = (): Observable<unknown> => of({ data: [batch()], stages: STAGES });
  afterEach(() => fixture?.destroy());

  it('shows the batch at the station with the shared stage status and its jobs', () => {
    mount(one());
    expect(el().querySelector('h1')!.textContent).toBe('Floor kiosk');
    expect(el().querySelector('se-status')!.textContent).toContain('Sewing');
    const jobs = [...el().querySelectorAll('.kiosk-actions button')].map((b) =>
      b.textContent!.trim(),
    );
    expect(jobs).toEqual([
      'Move to Finishing',
      'Report defect',
      'Log scan',
      'Record machine reading',
      'Register label',
    ]);
    expect(el().textContent).toContain('SE-0001');
  });

  it('shows a failed load as an error with a retry, never as "no batches"', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    const banner = el().querySelector('.se-banner--danger')!;
    expect(banner.textContent).toContain('Batches could not be loaded');
    expect(banner.textContent).toContain('Database is unreachable.');
    expect(el().textContent).not.toContain('No batches yet');
  });

  it('asks before moving the batch on, and does nothing when declined', async () => {
    mount(one());
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
    await fixture.componentInstance.advance();
    expect(ask.calls.mostRecent().args[0].title).toBe('Move batch #AAAAAAAA to Finishing?');
    expect(ask.calls.mostRecent().args[0].consequence).toContain('40 units of TEE-BLK-M');
    expect(api.moveBatch).not.toHaveBeenCalled();
  });

  it('shows the batch but none of the jobs to a role that can only view', () => {
    mount(one(), 'view');
    expect(el().querySelector('.kiosk-actions')).toBeNull();
    expect(el().textContent).not.toContain('Report defect');
    expect(el().textContent).toContain('Units in batch');
  });

  it('refuses a scan with no checkpoint, and says why', () => {
    mount(one());
    fixture.componentInstance.openScan();
    fixture.componentInstance.logScan(batch());
    fixture.detectChanges();
    expect(api.recordBatchScan).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Enter the checkpoint the batch was scanned at.');
  });
});
