import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilter,
  SeFilterBarComponent,
  SeInputDirective,
  SePageComponent,
  SeRowAction,
  SeSkeletonComponent,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { urlFilters } from '../url-filters';

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  totpEnabled: boolean;
  role: { name: string };
}

interface RoleRow {
  id: string;
  name: string;
  permissions: Array<{ module: string; accessLevel: string }>;
}

const ROLES = [
  'business_owner_admin',
  'management',
  'sales',
  'inventory',
  'production',
  'finance_accounting',
  'logistics',
  'marketing',
  'partner_investor',
];
const ACCESS_LEVELS = ['none', 'own', 'view', 'approve', 'full'];
/** Modules in the order staff think of them; anything new goes at the end. */
const MODULE_ORDER = [
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

export function roleLabel(role: string): string {
  const words = role.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Staff accounts and what each role may do. Accounts are a table; adding one
 * and changing a role are drawers; the permission matrix (role x module x
 * level) is a grid of selects in a card. Every write needs full access on
 * staff_access, which the API checks as well (principle #6).
 */
@Component({
  selector: 'app-staff',
  imports: [
    FormsModule,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeCellDirective,
    SeDrawerComponent,
    SeFieldComponent,
    SeFilterBarComponent,
    SeInputDirective,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Staff">
      @if (canManage) {
        <button seButton sePageActions variant="primary" type="button" (click)="openAdd()">
          Add staff member
        </button>
      }

      <se-table
        caption="Staff accounts"
        [columns]="columns"
        [rows]="rows()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [actions]="actions"
        [emptyHeading]="filtering() ? 'No staff match these filters' : 'No staff accounts yet'"
        [emptyText]="
          filtering()
            ? 'Remove a filter, or clear them all to see every account.'
            : 'Add the first staff member to give someone access.'
        "
      >
        <se-filter-bar
          seTableToolbar
          searchLabel="Search staff"
          searchPlaceholder="Name, email or role"
          [(query)]="query"
          [filters]="filters"
          [(value)]="filterValue"
          [summary]="summary()"
        />
        <ng-template seCell="status" let-row>
          <se-status kind="account" [value]="row.status" />
        </ng-template>
        <ng-template seCell="totp" let-row>{{ row.totpEnabled ? 'On' : 'Off' }}</ng-template>
      </se-table>

      <se-card title="Permissions by role">
        @if (matrixError()) {
          <se-banner
            tone="danger"
            title="Permissions could not be loaded"
            actionLabel="Try again"
            (action)="loadMatrix()"
          >
            {{ matrixError() }}
          </se-banner>
        } @else if (matrixLoading()) {
          <div aria-busy="true"><se-skeleton shape="table" [rows]="6" [columns]="3" /></div>
        } @else {
          <form class="se-form" (ngSubmit)="saveMatrix()">
            <se-field label="Role" hint="Choose a role to see and change what it may do">
              <select
                seInput
                name="matrixRole"
                [ngModel]="matrixRole()"
                (ngModelChange)="pickRole($event)"
              >
                @for (r of matrix(); track r.id) {
                  <option [value]="r.name">{{ roleLabel(r.name) }}</option>
                }
              </select>
            </se-field>
            <table class="matrix">
              <caption>
                Access level per module for
                {{
                  roleLabel(matrixRole())
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Module</th>
                  <th scope="col">Access level</th>
                </tr>
              </thead>
              <tbody>
                @for (m of modules(); track m) {
                  <tr>
                    <th scope="row" [id]="'module-' + m">{{ roleLabel(m) }}</th>
                    <td>
                      <select
                        seInput
                        [name]="'level-' + m"
                        [attr.aria-labelledby]="'module-' + m"
                        [disabled]="!canManage"
                        [ngModel]="edit()[m]"
                        (ngModelChange)="setLevel(m, $event)"
                      >
                        @for (level of levels; track level) {
                          <option
                            [value]="level"
                            [disabled]="m === 'staff_access' && level === 'none'"
                          >
                            {{ roleLabel(level) }}
                          </option>
                        }
                      </select>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            @if (canManage) {
              <div class="se-form__actions">
                <button seButton variant="primary" type="submit" [loading]="savingMatrix()">
                  Save permissions
                </button>
              </div>
            }
          </form>
        }
      </se-card>

      @if (canManage) {
        <se-drawer title="Add staff member" [(open)]="adding">
          <form class="se-form" id="add-staff" (ngSubmit)="create()">
            <se-field label="Full name" [error]="addErrors()['name']">
              <input seInput name="name" [(ngModel)]="nu.name" autocomplete="off" />
            </se-field>
            <se-field label="Email" [error]="addErrors()['email']">
              <input seInput name="email" type="email" [(ngModel)]="nu.email" autocomplete="off" />
            </se-field>
            <se-field label="Phone" optional>
              <input seInput name="phone" type="tel" [(ngModel)]="nu.phone" autocomplete="off" />
            </se-field>
            <se-field
              label="Temporary password"
              hint="Share it securely; they change it with Forgot password"
              [error]="addErrors()['password']"
            >
              <input
                seInput
                name="password"
                type="password"
                [(ngModel)]="nu.password"
                autocomplete="new-password"
              />
            </se-field>
            <se-field label="Role">
              <select seInput name="role" [(ngModel)]="nu.role">
                @for (r of roles; track r) {
                  <option [value]="r">{{ roleLabel(r) }}</option>
                }
              </select>
            </se-field>
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="adding.set(false)">Cancel</button>
            <button seButton variant="primary" type="submit" form="add-staff" [loading]="saving()">
              Add staff member
            </button>
          </ng-container>
        </se-drawer>

        <se-drawer title="Change role" [(open)]="changing">
          @if (target(); as u) {
            <form class="se-form" id="change-role" (ngSubmit)="changeRole()">
              <p>{{ u.name }} is currently {{ roleLabel(u.role.name) }}.</p>
              <se-field label="New role">
                <select seInput name="newRole" [(ngModel)]="newRole">
                  @for (r of roles; track r) {
                    <option [value]="r">{{ roleLabel(r) }}</option>
                  }
                </select>
              </se-field>
            </form>
          }
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="changing.set(false)">Cancel</button>
            <button
              seButton
              variant="primary"
              type="submit"
              form="change-role"
              [loading]="saving()"
            >
              Change role
            </button>
          </ng-container>
        </se-drawer>
      }
    </se-page>
  `,
  styles: [
    `
      .matrix {
        width: 100%;
        border-collapse: collapse;
      }
      .matrix caption {
        text-align: left;
        padding-block: var(--se-space-2);
        color: var(--se-color-text-muted);
      }
      .matrix th,
      .matrix td {
        text-align: left;
        padding: var(--se-space-1) var(--se-space-3);
        border-bottom: 1px solid var(--se-color-border);
      }
      .matrix th[scope='row'] {
        font-weight: 400;
      }
      .matrix td .se-input {
        max-width: 14rem;
      }
    `,
  ],
})
export class StaffAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);

  /** Adding, changing a role and editing permissions all need full access. */
  readonly canManage = this.access.can('staff_access', 'full');

  readonly users = signal<UserRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);

  readonly roles = ROLES;
  readonly levels = ACCESS_LEVELS;
  readonly roleLabel = roleLabel;

  // ---- filters ----
  private readonly urlState = urlFilters(['role']);
  readonly query = this.urlState.query;
  readonly filterValue = this.urlState.value;
  readonly filters: SeFilter[] = [
    { key: 'role', label: 'Role', options: ROLES.map((r) => ({ value: r, label: roleLabel(r) })) },
  ];
  readonly filtering = computed(
    () => !!this.query().trim() || Object.keys(this.filterValue()).length > 0,
  );
  readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const role = this.filterValue()['role'];
    return this.users().filter((u) => {
      // Customers and wholesale buyers have accounts too; they are not staff.
      if (!ROLES.includes(u.role.name)) return false;
      if (role && u.role.name !== role) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.name.includes(q)
      );
    });
  });
  readonly summary = computed(() => {
    const n = this.rows().length;
    return `${n} ${n === 1 ? 'account' : 'accounts'}`;
  });

  readonly columns: SeColumn<UserRow>[] = [
    { key: 'name', header: 'Name', sortable: true, value: (u) => u.name },
    { key: 'email', header: 'Email', value: (u) => u.email },
    { key: 'role', header: 'Role', sortable: true, value: (u) => roleLabel(u.role.name) },
    { key: 'status', header: 'Status', value: (u) => u.status },
    { key: 'totp', header: 'Two-factor', value: (u) => u.totpEnabled },
  ];
  readonly actions: SeRowAction<UserRow>[] = [
    { label: 'Change role', hidden: () => !this.canManage, run: (u) => this.openChange(u) },
  ];

  // ---- add drawer ----
  readonly adding = signal(false);
  readonly addErrors = signal<Record<string, string | undefined>>({});
  nu = { name: '', email: '', phone: '', password: '', role: 'sales' };

  // ---- change-role drawer ----
  readonly changing = signal(false);
  readonly target = signal<UserRow | null>(null);
  newRole = 'sales';

  // ---- permission matrix ----
  readonly matrix = signal<RoleRow[]>([]);
  readonly matrixLoading = signal(true);
  readonly matrixError = signal('');
  readonly matrixRole = signal('');
  readonly edit = signal<Record<string, string>>({});
  readonly savingMatrix = signal(false);
  readonly modules = computed(() => {
    const seen = new Set<string>();
    for (const r of this.matrix()) for (const p of r.permissions) seen.add(p.module);
    return [...seen].sort((a, b) => {
      const ia = MODULE_ORDER.indexOf(a);
      const ib = MODULE_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  });

  ngOnInit(): void {
    this.load();
    this.loadMatrix();
  }

  load(): void {
    this.api.users().subscribe({
      next: (res) => {
        this.users.set(res.data as unknown as UserRow[]);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (this.users().length === 0) {
          this.error.set(err?.error?.message ?? 'The server did not respond.');
        }
      },
    });
  }

  loadMatrix(): void {
    this.api.rolesMatrix().subscribe({
      next: (rows) => {
        this.matrix.set(rows as RoleRow[]);
        this.matrixLoading.set(false);
        this.matrixError.set('');
        this.pickRole(this.matrixRole() || rows[0]?.name || '');
      },
      error: (err) => {
        this.matrixLoading.set(false);
        this.matrixError.set(err?.error?.message ?? 'The server did not respond.');
      },
    });
  }

  pickRole(name: string): void {
    const role = this.matrix().find((r) => r.name === name);
    if (!role) return;
    this.matrixRole.set(role.name);
    const next: Record<string, string> = {};
    for (const p of role.permissions) next[p.module] = p.accessLevel;
    // A role that could not see staff access could lock everyone out.
    if (!next['staff_access']) next['staff_access'] = 'view';
    this.edit.set(next);
  }

  setLevel(module: string, level: string): void {
    if (module === 'staff_access' && level === 'none') return;
    this.edit.update((e) => ({ ...e, [module]: level }));
  }

  async saveMatrix(): Promise<void> {
    const role = this.matrixRole();
    if (!role) return;
    const permissions = Object.entries(this.edit()).map(([module, accessLevel]) => ({
      module,
      accessLevel,
    }));
    const ok = await this.confirm.ask({
      title: `Change what ${roleLabel(role).toLowerCase()} may do?`,
      consequence: `Everyone with the ${roleLabel(role).toLowerCase()} role gets these access levels on their next request. The change is written to the audit log; you can change the levels again at any time.`,
      confirmLabel: 'Save permissions',
    });
    if (!ok) return;
    this.savingMatrix.set(true);
    this.api.updateRolePermissions(role, permissions).subscribe({
      next: () => {
        this.savingMatrix.set(false);
        this.toast.show(`Permissions saved for ${roleLabel(role).toLowerCase()}`);
      },
      error: (err) => {
        this.savingMatrix.set(false);
        this.toast.show(err?.error?.message ?? 'Permissions could not be saved', {
          tone: 'danger',
          action: { label: 'Try again', run: () => void this.saveMatrix() },
        });
      },
    });
  }

  openAdd(): void {
    this.nu = { name: '', email: '', phone: '', password: '', role: 'sales' };
    this.addErrors.set({});
    this.adding.set(true);
  }

  create(): void {
    const errors: Record<string, string> = {};
    if (!this.nu.name.trim()) errors['name'] = 'Enter their full name.';
    if (!/^\S+@\S+\.\S+$/.test(this.nu.email.trim()))
      errors['email'] = 'Enter a valid email address.';
    if (this.nu.password.length < 8) errors['password'] = 'Use at least 8 characters.';
    this.addErrors.set(errors);
    if (Object.keys(errors).length > 0) return;
    this.saving.set(true);
    this.api
      .createUser({
        name: this.nu.name,
        email: this.nu.email,
        phone: this.nu.phone || undefined,
        password: this.nu.password,
        role: this.nu.role,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.adding.set(false);
          this.toast.show(`${this.nu.name} added. Share the temporary password securely.`);
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.addErrors.set({ email: err?.error?.message ?? 'The account could not be created.' });
        },
      });
  }

  openChange(u: UserRow): void {
    this.target.set(u);
    this.newRole = u.role.name;
    this.changing.set(true);
  }

  async changeRole(): Promise<void> {
    const u = this.target();
    if (!u || this.newRole === u.role.name) {
      this.changing.set(false);
      return;
    }
    const ok = await this.confirm.ask({
      title: `Change ${u.name}'s role to ${roleLabel(this.newRole).toLowerCase()}?`,
      consequence: `${u.name} loses ${roleLabel(u.role.name).toLowerCase()} access and gains ${roleLabel(this.newRole).toLowerCase()} access on their next request. The change is written to the audit log; the role can be changed again.`,
      confirmLabel: 'Change role',
    });
    if (!ok) return;
    this.saving.set(true);
    this.api.changeRole(u.id, this.newRole).subscribe({
      next: () => {
        this.saving.set(false);
        this.changing.set(false);
        this.toast.show(`${u.name} is now ${roleLabel(this.newRole).toLowerCase()}`);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.show(err?.error?.message ?? `${u.name}'s role could not be changed`, {
          tone: 'danger',
          action: { label: 'Try again', run: () => void this.changeRole() },
        });
      },
    });
  }
}
