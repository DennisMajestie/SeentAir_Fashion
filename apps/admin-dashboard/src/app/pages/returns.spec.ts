import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeConfirmService, SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService, Me, ReturnRequest } from '../api.service';
import { ReturnsPage } from './returns.page';

const ret = (over: Partial<ReturnRequest> = {}): ReturnRequest => ({
  id: 'a1b2c3d4-0000-0000-0000-000000000000',
  status: 'requested',
  reason: 'Wrong size',
  quantity: 2,
  requestedAt: '2026-10-06T09:00:00',
  returnDeadline: '2099-10-07T09:00:00',
  variant: { sku: 'SFT-TEE-BLK-M' },
  order: { id: '8626acab-28dd-473f-b587-42ff7ab8865d' },
  refundAmount: 9000,
  ...over,
});

describe('ReturnsPage', () => {
  let fixture: ComponentFixture<ReturnsPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (returns: unknown, level = 'full'): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['returns', 'resolveReturnWithEvidence']);
    api.returns.and.returnValue(returns as never);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    TestBed.inject(AccessService).me.set({ access: { returns: level } } as unknown as Me);
    fixture = TestBed.createComponent(ReturnsPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('renders returns through the shared table', () => {
    mount(of({ data: [ret()], total: 1 }));
    const table = el().querySelector('se-table')!;
    expect(table.textContent).toContain('RET-A1B2C3');
    expect(table.textContent).toContain('SFT-TEE-BLK-M');
    expect(table.textContent).toContain('Return requested');
  });

  it('shows an error with a retry when the load fails, not an empty list', () => {
    mount(throwError(() => ({ error: { message: 'Database unavailable' } })));
    expect(el().textContent).toContain('Database unavailable');
    expect(el().textContent).not.toContain('No returns yet');
  });

  it('asks before restocking, naming the units and refund, and does nothing when declined', async () => {
    mount(of({ data: [ret()], total: 1 }));
    const confirm = TestBed.inject(SeConfirmService);
    const ask = spyOn(confirm, 'ask').and.resolveTo(false);
    const page = fixture.componentInstance;
    page.open(ret());
    page.note = 'Tags intact';
    await page.resolve('restocked');
    const asked = ask.calls.mostRecent().args[0];
    expect(asked.title).toBe('Restock return RET-A1B2C3?');
    expect(asked.consequence).toContain('2 units of SFT-TEE-BLK-M go back into sellable stock');
    expect(asked.consequence).toContain('cannot be undone');
    expect(asked.confirmLabel).toBe('Restock item');
    expect(api.resolveReturnWithEvidence).not.toHaveBeenCalled();
  });

  it('keeps the inspection note required and says so under the field', async () => {
    mount(of({ data: [ret()], total: 1 }));
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask');
    fixture.componentInstance.open(ret());
    await fixture.componentInstance.resolve('damaged');
    expect(ask).not.toHaveBeenCalled();
    expect(fixture.componentInstance.noteError()).toContain('inspected');
  });

  it('hides the resolve actions from a role without full access to returns', () => {
    mount(of({ data: [ret()], total: 1 }), 'view');
    fixture.componentInstance.open(ret());
    fixture.detectChanges();
    expect(fixture.componentInstance.canAct()).toBeFalse();
    expect(el().textContent).not.toContain('Restock item');
    expect(el().textContent).not.toContain('Write off as damaged');
  });
});
