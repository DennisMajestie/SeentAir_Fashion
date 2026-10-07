import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeConfirmService, SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService, Approval } from '../api.service';
import { ApprovalsPage } from './approvals.page';
import { priceChange } from './approvals-format';

const approval = (over: Partial<Approval> = {}): Approval => ({
  id: 'ab12cd34-0000-4000-8000-000000000000',
  actionType: 'price_change',
  status: 'pending',
  payload: { product: 'Lagos tee', from: 9000, to: 10500 },
  requestedBy: { name: 'Adaeze O.' },
  createdAt: '2026-10-06T09:00:00',
  ...over,
});

describe('price change decoding', () => {
  it('works out the change and the timed-sale end', () => {
    const pc = priceChange(approval())!;
    expect(pc.deltaPct).toBe('16.7');
    expect(pc.saleEndsAt).toBeNull();
    const sale = priceChange(
      approval({ payload: { from: 100, to: 80, kind: 'sale', saleEndsAt: '2026-10-10' } }),
    )!;
    expect(sale.saleEndsAt).toBe('2026-10-10');
    expect(priceChange(approval({ actionType: 'purchasing' }))).toBeNull();
  });
});

describe('ApprovalsPage', () => {
  let fixture: ComponentFixture<ApprovalsPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (pending: unknown, level = 'approve'): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'pendingApprovals',
      'approvalsHistory',
      'decideApproval',
      'decideApprovalWithJustification',
    ]);
    api.pendingApprovals.and.returnValue(pending as never);
    api.approvalsHistory.and.returnValue(
      of({ data: [approval({ id: 'h1', status: 'rejected' })], total: 1 }),
    );
    api.decideApproval.and.returnValue(of({}));
    api.decideApprovalWithJustification.and.returnValue(of({}));
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
      role: 'management',
      totpEnabled: false,
      access: { approvals_audit: level },
    });
    fixture = TestBed.createComponent(ApprovalsPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('shows each pending request with its price figures, and the history in the shared table', () => {
    mount(of([approval()]));
    const text = el().textContent!;
    expect(text).toContain('Price change AB12CD34');
    expect(text).toContain('Adaeze O.');
    expect(text).toContain('₦9,000');
    expect(text).toContain('₦10,500');
    expect(text).toContain('16.7% increase');
    expect(el().querySelectorAll('se-table tbody tr').length).toBe(1);
    expect(el().querySelector('se-table tbody tr')!.textContent).toContain('Rejected');
    expect(el().querySelector('h1')!.textContent).toBe('Approvals');
  });

  it('shows a failed load as an error with a retry, never as "nothing waiting"', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    const banner = el().querySelector('.se-banner--danger')!;
    expect(banner.textContent).toContain('Approvals could not be loaded');
    expect(banner.textContent).toContain('Database is unreachable.');
    expect(el().textContent).not.toContain('Every request has been decided');
  });

  it('asks before approving, naming the audit log, and does nothing when declined', async () => {
    mount(of([approval()]));
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
    await fixture.componentInstance.approve(approval());
    expect(ask.calls.mostRecent().args[0].title).toBe('Approve price change AB12CD34?');
    expect(ask.calls.mostRecent().args[0].consequence).toContain('audit log');
    expect(ask.calls.mostRecent().args[0].consequence).toContain('cannot be withdrawn');
    expect(api.decideApprovalWithJustification).not.toHaveBeenCalled();
  });

  it('approves without a justification, so the server never sees an empty reason', async () => {
    mount(of([approval()]));
    spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(true);
    await fixture.componentInstance.approve(approval());
    expect(api.decideApproval).toHaveBeenCalledWith(approval().id, 'approved');
    expect(api.decideApprovalWithJustification).not.toHaveBeenCalled();
  });

  it('requires a reason to reject and sends it as the justification', async () => {
    mount(of([approval()]));
    const ask = spyOn(TestBed.inject(SeConfirmService), 'askWithReason').and.resolveTo(
      'Margin too thin',
    );
    await fixture.componentInstance.reject(approval());
    const options = ask.calls.mostRecent().args[0];
    expect(options.reasonLabel).toBe('Reason for rejection');
    expect(options.danger).toBeTrue();
    expect(api.decideApprovalWithJustification).toHaveBeenCalledWith(
      approval().id,
      'rejected',
      'Margin too thin',
    );
  });

  it('shows no decision buttons to a role that can only view', () => {
    mount(of([approval()]), 'view');
    const labels = [...el().querySelectorAll('button')].map((b) => b.textContent!.trim());
    expect(labels).not.toContain('Approve');
    expect(labels).not.toContain('Reject');
  });
});
