import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeConfirmService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { AccountRow, TierRow } from './wholesale-format';
import { WholesaleAdminPage } from './wholesale.page';

const tier: TierRow = { id: 't1', name: 'Silver', discountPercent: 15, ruleDescription: null };
const account = (over: Partial<AccountRow> = {}): AccountRow => ({
  id: 'a1',
  status: 'pending',
  createdAt: '2026-09-15T15:27:00',
  user: { name: 'Adaeze O.', email: 'a@x' },
  tier: null,
  businessName: 'Aba Threads',
  buyerType: 'retailer',
  businessPhone: null,
  city: 'Aba',
  state: 'Abia',
  openingVolume: 40,
  ...over,
});

describe('WholesaleAdminPage', () => {
  let fixture: ComponentFixture<WholesaleAdminPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (
    accounts: unknown,
    access: Record<string, string> = { wholesale_orders: 'full', catalogue: 'full' },
  ): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'wholesaleAccounts',
      'wholesaleAccount',
      'reviewWholesaleAccount',
      'tiers',
      'createTier',
      'updateTier',
      'deleteTier',
      'createApproval',
    ]);
    api.wholesaleAccounts.and.returnValue(accounts as never);
    api.tiers.and.returnValue(of([tier]) as never);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(AccessService).me.set({
      name: 'T',
      email: 't@x',
      role: 'r',
      totpEnabled: false,
      access,
    });
    fixture = TestBed.createComponent(WholesaleAdminPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('lists accounts in the shared table with the status from the shared mapping', () => {
    mount(
      of([
        account(),
        account({ id: 'a2', status: 'approved', tier: { id: 't1', name: 'Silver' } }),
      ]),
    );
    const rows = el().querySelector('se-table')!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Aba Threads');
    expect(rows[0].querySelector('se-status')).not.toBeNull();
    expect(rows[1].textContent).toContain('Silver');
    expect(el().querySelector('h1')!.textContent).toBe('Wholesale');
  });

  it('shows a failed load as an error, never as "no applications yet"', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    expect(el().querySelector('.se-banner--danger')!.textContent).toContain(
      'Database is unreachable.',
    );
    expect(el().textContent).not.toContain('No applications yet');
  });

  it('asks before approving, naming the tier, and sends nothing when declined', async () => {
    mount(of([account()]));
    const page = fixture.componentInstance;
    page.tierChoice['a1'] = 't1';
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
    await page.decide(account(), 'approved');
    const asked = ask.calls.mostRecent().args[0];
    expect(asked.title).toBe('Approve Aba Threads as a wholesale buyer?');
    expect(asked.consequence).toContain('Silver (15% off)');
    expect(asked.confirmLabel).toBe('Approve account');
    expect(api.reviewWholesaleAccount).not.toHaveBeenCalled();
  });

  it('applies a discount only after confirmation, with the approval id in the body', async () => {
    mount(of([account()]));
    const page = fixture.componentInstance;
    page.openEditTier(tier);
    page.tierForm.discountPercent = 20;
    page.tierApprovals = { t1: 'req-1' };
    spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(true);
    api.updateTier.and.returnValue(of({}));
    await page.applyDiscount(tier);
    expect(api.updateTier).toHaveBeenCalledWith('t1', {
      discountPercent: 20,
      approvalRequestId: 'req-1',
    });
  });

  it('shows no decision or tier buttons to a view-only role', () => {
    mount(of([account()]), { wholesale_orders: 'view', catalogue: 'view' });
    expect(el().querySelector('.se-table__actions button')).toBeNull();
    expect(el().textContent).not.toContain('Add tier');
  });
});
