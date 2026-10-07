import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeConfirmService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { StaffAdminPage } from './staff.page';

const user = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'u1',
  name: 'Chidi N.',
  email: 'chidi@seentair.test',
  status: 'active',
  totpEnabled: true,
  role: { name: 'sales' },
  ...over,
});

const matrix = [
  {
    id: 'r1',
    name: 'sales',
    permissions: [
      { module: 'retail_orders', accessLevel: 'full' },
      { module: 'staff_access', accessLevel: 'view' },
    ],
  },
];

describe('StaffAdminPage', () => {
  let fixture: ComponentFixture<StaffAdminPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (users: unknown, level = 'full'): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'users',
      'rolesMatrix',
      'updateRolePermissions',
      'createUser',
      'changeRole',
    ]);
    api.users.and.returnValue(users as never);
    api.rolesMatrix.and.returnValue(of(matrix));
    api.updateRolePermissions.and.returnValue(of({}));
    api.changeRole.and.returnValue(of({}));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(AccessService).me.set({
      name: 'Tester',
      email: 't@seentair.test',
      role: 'business_owner_admin',
      totpEnabled: false,
      access: { staff_access: level },
    });
    fixture = TestBed.createComponent(StaffAdminPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('lists accounts in the shared table and the matrix with a labelled select per module', () => {
    mount(
      of({ data: [user(), user({ id: 'u2', name: 'Ngozi A.', status: 'disabled' })], total: 2 }),
    );
    const rows = el().querySelectorAll('se-table tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Chidi N.');
    expect(rows[0].textContent).toContain('Sales');
    expect(el().querySelector('h1')!.textContent).toBe('Staff');
    const selects = el().querySelectorAll('.matrix select');
    expect(selects.length).toBe(2);
    expect(selects[0].getAttribute('aria-labelledby')).toBe('module-retail_orders');
  });

  it('shows a failed load as an error with a retry, never as "no staff"', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    const banner = el().querySelector('.se-banner--danger')!;
    expect(banner.textContent).toContain('Staff accounts could not be loaded');
    expect(el().textContent).not.toContain('No staff accounts yet');
  });

  it('confirms a permission change with its consequence and does nothing when declined', async () => {
    mount(of({ data: [user()], total: 1 }));
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
    await fixture.componentInstance.saveMatrix();
    expect(ask.calls.mostRecent().args[0].title).toBe('Change what sales may do?');
    expect(ask.calls.mostRecent().args[0].consequence).toContain('Everyone with the sales role');
    expect(api.updateRolePermissions).not.toHaveBeenCalled();
  });

  it('sends the edited levels once confirmed', async () => {
    mount(of({ data: [user()], total: 1 }));
    spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(true);
    fixture.componentInstance.setLevel('retail_orders', 'view');
    await fixture.componentInstance.saveMatrix();
    expect(api.updateRolePermissions).toHaveBeenCalledWith('sales', [
      { module: 'retail_orders', accessLevel: 'view' },
      { module: 'staff_access', accessLevel: 'view' },
    ]);
  });

  it('confirms a role change naming the person and both roles', async () => {
    mount(of({ data: [user()], total: 1 }));
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
    fixture.componentInstance.openChange(user() as never);
    fixture.componentInstance.newRole = 'management';
    await fixture.componentInstance.changeRole();
    expect(ask.calls.mostRecent().args[0].title).toBe("Change Chidi N.'s role to management?");
    expect(api.changeRole).not.toHaveBeenCalled();
  });

  it('keeps the add form open with the message under the field when the API refuses', () => {
    mount(of({ data: [], total: 0 }));
    api.createUser.and.returnValue(
      throwError(() => ({ error: { message: 'Email already in use.' } })),
    );
    const page = fixture.componentInstance;
    page.openAdd();
    page.nu = {
      name: 'Ada',
      email: 'ada@seentair.test',
      phone: '',
      password: 'longenough1',
      role: 'sales',
    };
    page.create();
    expect(page.adding()).toBeTrue();
    expect(page.addErrors()['email']).toBe('Email already in use.');
  });

  it('shows no write actions to a role with view access', () => {
    mount(of({ data: [user()], total: 1 }), 'view');
    const labels = [...el().querySelectorAll('button')].map((b) => b.textContent!.trim());
    expect(labels).not.toContain('Add staff member');
    expect(labels).not.toContain('Change role');
    expect(labels).not.toContain('Save permissions');
  });
});
