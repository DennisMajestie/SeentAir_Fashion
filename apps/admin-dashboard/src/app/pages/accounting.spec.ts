import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeConfirmService, SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { AccountingAdminPage } from './accounting.page';

const entry = {
  id: 'e1',
  type: 'expense',
  amount: 25000,
  category: 'september_payroll',
  referenceId: null,
  entryDate: '2026-09-30',
};

describe('AccountingAdminPage', () => {
  let fixture: ComponentFixture<AccountingAdminPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (ledger: unknown, accounting = 'full'): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'ledger',
      'report',
      'createApproval',
      'recordLedgerEntry',
    ]);
    api.ledger.and.returnValue(ledger as never);
    api.report.and.returnValue(of({ total: 1000, profit: 500, loss: 0 }) as never);
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
      access: { accounting },
    });
    fixture = TestBed.createComponent(AccountingAdminPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('lists ledger entries in the shared table with money through the shared formatter', () => {
    mount(of({ data: [entry], total: 1 }));
    const row = el().querySelector('se-table tbody tr')!;
    expect(row.textContent).toContain('Expense');
    expect(row.textContent).toContain('₦25,000');
    expect(el().querySelector('h1')!.textContent).toBe('Accounting');
    // Income, expenditure, investment and one net figure (profit minus loss).
    expect(el().querySelectorAll('se-metric-card').length).toBe(4);
    expect(el().querySelector('.se-metric-grid')!.textContent).toContain('Net profit');
  });

  it('shows a failed load as an error, never as "no entries yet"', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    expect(el().querySelector('.se-banner--danger')!.textContent).toContain(
      'Database is unreachable.',
    );
    expect(el().textContent).not.toContain('No entries yet');
  });

  it('asks before recording an entry, naming the approval, and sends nothing when declined', async () => {
    mount(of({ data: [], total: 0 }));
    const page = fixture.componentInstance;
    page.entry = {
      type: 'payroll',
      amount: 25000,
      category: 'September payroll',
      approvalRequestId: 'abcdef12-0000',
    };
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
    await page.record();
    const asked = ask.calls.mostRecent().args[0];
    expect(asked.title).toBe('Record payroll of ₦25,000?');
    expect(asked.consequence).toContain('approval abcdef12');
    expect(asked.confirmLabel).toBe('Record entry');
    expect(api.recordLedgerEntry).not.toHaveBeenCalled();
  });

  it('requests approval with the same payload as before, without a dialog', () => {
    mount(of({ data: [], total: 0 }));
    const page = fixture.componentInstance;
    page.entry = { type: 'tax', amount: 500, category: 'VAT', approvalRequestId: '' };
    api.createApproval.and.returnValue(of({ id: 'req-1' }));
    page.requestApproval();
    expect(api.createApproval).toHaveBeenCalledWith('fund_movement', {
      type: 'tax',
      amount: 500,
      category: 'VAT',
    });
    expect(page.entry.approvalRequestId).toBe('req-1');
  });

  it('offers no entry button to a role with view-only accounting access', () => {
    mount(of({ data: [entry], total: 1 }), 'view');
    expect(el().textContent).not.toContain('Record entry');
    expect(el().textContent).toContain('Export CSV');
  });
});
