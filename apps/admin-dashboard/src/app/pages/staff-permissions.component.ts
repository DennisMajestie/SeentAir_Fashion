import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  NgZone,
  PLATFORM_ID,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { gsap } from 'gsap';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeIconComponent,
  SeSkeletonComponent,
  SeToastService,
  SeConfirmService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import {
  HIGH_IMPACT_MODULES,
  PERMISSION_GROUPS,
  PERMISSION_MODULES,
  PERMISSION_ROLES,
  PermissionGroupId,
  PermissionModuleConfig,
  PermissionRoleConfig,
  humanizePermissionKey,
} from './staff-permissions.config';
import {
  PermissionChange,
  RolePermissionsSnapshot,
  draftForRole,
  permissionChanges,
  permissionSet,
  roleHasChanges,
} from './staff-permissions.state';

type EditorView = 'edit' | 'compare';
type PermissionGroup = {
  id: PermissionGroupId;
  label: string;
  modules: string[];
};
type RoleChanges = {
  role: RolePermissionsSnapshot;
  label: string;
  changes: PermissionChange[];
};

const STAFF_ROLE_ORDER = [
  'business_owner_admin',
  'management',
  'sales',
  'inventory',
  'production',
  'finance_accounting',
];
const EXTERNAL_ROLE_ORDER = ['partner_investor', 'wholesaler', 'customer'];
const LEVEL_MARKS: Record<string, string> = {
  none: '–',
  own: 'O',
  view: 'V',
  approve: 'A',
  full: 'F',
};
const LEVEL_MEANINGS: Record<string, string> = {
  none: 'cannot see it',
  own: 'only their own records',
  view: 'can look, not change',
  approve: 'view and approve requests',
  full: 'view, create, change, delete',
};

function roleConfig(role: string): PermissionRoleConfig {
  return (
    PERMISSION_ROLES[role] ?? {
      label: humanizePermissionKey(role),
      initials: role.split('_').map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase(),
      description: 'Role returned by the permissions API.',
      group: 'external',
      readOnly: true,
    }
  );
}

function moduleConfig(module: string): PermissionModuleConfig | null {
  return PERMISSION_MODULES[module] ?? null;
}

function serverMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const body = (error as { error?: { message?: unknown } }).error;
    if (typeof body?.message === 'string') return body.message;
  }
  return 'The permission change could not be saved.';
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

@Component({
  selector: 'app-staff-permissions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeBannerComponent, SeButtonDirective, SeIconComponent, SeSkeletonComponent],
  template: `
    <section class="sd-permissions" aria-labelledby="sd-permissions-title">
      <header class="sd-permissions__header">
        <div>
          <h2 id="sd-permissions-title">What each role can do</h2>
          <p>Pick a role to change what it can do. Changes stay in draft until you review and save, and apply to everyone in that role.</p>
        </div>
        <div class="sd-segment" role="group" aria-label="Permission views">
          <button type="button" [attr.aria-pressed]="view() === 'edit'" (click)="setView('edit')">Edit a role</button>
          <button type="button" [attr.aria-pressed]="view() === 'compare'" (click)="setView('compare')">Compare roles</button>
        </div>
      </header>

      @if (!canView()) {
        <se-banner tone="danger" title="Team access is restricted">
          Your role does not have view access to staff settings.
        </se-banner>
      } @else if (loading()) {
        <div class="sd-loading" aria-busy="true">
          <se-skeleton shape="table" [rows]="7" [columns]="4" />
        </div>
      } @else if (loadError()) {
        <se-banner tone="danger" title="Roles could not be loaded" actionLabel="Retry" (action)="loadRoles()">
          {{ loadError() }}
        </se-banner>
      } @else {
        @if (unknownRoles().length || unknownModules().length) {
          <p class="sd-mapping-note" role="status">
            Unmapped API permissions are shown with humanized names:
            {{ unknownRoles().join(', ') }} {{ unknownModules().join(', ') }}
          </p>
        }
        @if (refreshNotice()) {
          <se-banner tone="info" actionLabel="Reload roles" (action)="reloadRoles()">
            Roles may have changed. Reload when you are ready.
          </se-banner>
        }

        <div class="sd-layout" [class.sd-layout--compare]="view() === 'compare'">
          <aside class="sd-role-list" aria-label="Staff roles">
            <section class="sd-role-group" aria-labelledby="sd-staff-roles-heading">
              <h3 id="sd-staff-roles-heading">Staff roles</h3>
              @for (role of staffRoles(); track role.name) {
                <button
                  type="button"
                  class="sd-role-item"
                  [class.sd-role-item--current]="role.name === selectedRole()"
                  [attr.aria-current]="role.name === selectedRole() ? 'true' : null"
                  (click)="selectRole(role.name)"
                >
                  <span class="sd-avatar" aria-hidden="true">{{ roleConfig(role.name).initials }}</span>
                  <span class="sd-role-item__copy">
                    <strong>{{ roleConfig(role.name).label }}</strong>
                    @if (role.memberCount !== undefined) {
                      <span>{{ role.memberCount }} {{ role.memberCount === 1 ? 'person' : 'people' }}</span>
                    }
                  </span>
                  @if (roleConfig(role.name).readOnly) {
                    <se-icon name="lock" label="Read-only role" />
                  }
                  @if (changesForRole(role.name).length > 0) {
                    <span class="sd-dirty-count">{{ changesForRole(role.name).length }}</span>
                  }
                </button>
              }
            </section>
            <section class="sd-role-group" aria-labelledby="sd-external-roles-heading">
              <h3 id="sd-external-roles-heading">External roles</h3>
              @for (role of externalRoles(); track role.name) {
                <button
                  type="button"
                  class="sd-role-item"
                  [class.sd-role-item--current]="role.name === selectedRole()"
                  [attr.aria-current]="role.name === selectedRole() ? 'true' : null"
                  (click)="selectRole(role.name)"
                >
                  <span class="sd-avatar" aria-hidden="true">{{ roleConfig(role.name).initials }}</span>
                  <span class="sd-role-item__copy">
                    <strong>{{ roleConfig(role.name).label }}</strong>
                    @if (role.memberCount !== undefined) {
                      <span>{{ role.memberCount }} {{ role.memberCount === 1 ? 'person' : 'people' }}</span>
                    }
                  </span>
                  <se-icon name="lock" label="Read-only role" />
                  @if (changesForRole(role.name).length > 0) {
                    <span class="sd-dirty-count">{{ changesForRole(role.name).length }}</span>
                  }
                </button>
              }
            </section>
          </aside>

          <div class="sd-panel" #panel>
            @if (view() === 'edit' && selectedRoleRow(); as role) {
              <header class="sd-role-header">
                <span class="sd-avatar sd-avatar--large" aria-hidden="true">{{ roleConfig(role.name).initials }}</span>
                <div class="sd-role-header__copy">
                  <h3>{{ roleConfig(role.name).label }}</h3>
                  <p>{{ roleConfig(role.name).description }}</p>
                  <div class="sd-role-meta">
                    @if (role.memberCount !== undefined) {
                      <span>{{ role.memberCount }} {{ role.memberCount === 1 ? 'person' : 'people' }}</span>
                    }
                    <span>access to {{ areasWithAccess(role.name) }} of {{ modules().length }} areas</span>
                  </div>
                </div>
              </header>

              @if (isReadOnly(role.name)) {
                <se-banner tone="warning" class="sd-readonly-banner">
                  @if (role.name === 'business_owner_admin') {
                    The business owner role cannot be edited, so you can never lock yourself out.
                  } @else if (!canManage()) {
                    You have view-only access to team settings.
                  } @else {
                    This role is managed by the system and is read-only here.
                  }
                </se-banner>
              }

              <label class="sd-search">
                <span class="sd-sr-only">Search permission areas</span>
                <se-icon name="search" />
                <input
                  type="search"
                  placeholder="Search areas, for example orders or stock"
                  [value]="query()"
                  (input)="query.set($any($event.target).value)"
                />
              </label>

              <div class="sd-legend" aria-label="Access level legend">
                @for (level of levels(); track level) {
                  <span class="sd-legend-item">
                    <span class="sd-level-mark" [attr.data-level]="level">{{ levelMark(level) }}</span>
                    <strong>{{ levelShortLabel(level) }}</strong>
                    <span>{{ levelMeaning(level) }}</span>
                  </span>
                }
              </div>

              @for (group of groupedModules(); track group.id) {
                <section class="sd-module-group" [attr.aria-labelledby]="'sd-group-' + group.id">
                  <div class="sd-group-heading">
                    <h4 [id]="'sd-group-' + group.id">{{ group.label }}</h4>
                    @if (!isReadOnly(role.name) && group.modules.length > 0) {
                      <label class="sd-set-all">
                        <span class="sd-sr-only">Set all visible {{ group.label }} areas to</span>
                        <select [value]="''" (change)="setGroupAccess(group, $any($event.target).value)">
                          <option value="" disabled>Set all to…</option>
                          <option value="none">No access</option>
                          <option value="view">View only</option>
                        </select>
                      </label>
                    }
                  </div>
                  @for (module of group.modules; track module) {
                    @let config = moduleConfig(module);
                    <article
                      class="sd-area"
                      [class.sd-area--changed]="isChanged(role.name, module)"
                      [class.sd-area--high-impact]="isHighImpact(role.name, module)"
                      [attr.data-module]="module"
                    >
                      <div class="sd-area__copy">
                        <h5>{{ moduleLabel(module) }}</h5>
                        <p>{{ config?.description ?? 'Additional permission area returned by the API.' }}</p>
                        @if (isChanged(role.name, module)) {
                          <span class="sd-was">Was {{ levelShortLabel(savedLevel(role.name, module)) }}</span>
                          <button type="button" class="sd-undo-link" (click)="undoModule(role.name, module)">Undo</button>
                        }
                        @if (isHighImpact(role.name, module)) {
                          <span class="sd-impact">High impact: can change money, people or approvals</span>
                        }
                      </div>
                      <div
                        class="sd-levels"
                        role="radiogroup"
                        [attr.aria-label]="moduleLabel(module) + ' access for ' + roleConfig(role.name).label"
                        (keydown)="onLevelKeydown($event, role.name, module)"
                      >
                        @for (level of levels(); track level) {
                          <button
                            type="button"
                            role="radio"
                            class="sd-level"
                            [class.sd-level--selected]="draftLevel(role.name, module) === level"
                            [class.sd-level--unsupported]="!levelSupported(module, level)"
                            [attr.aria-checked]="draftLevel(role.name, module) === level"
                            [attr.aria-disabled]="isReadOnly(role.name) || !levelSupported(module, level)"
                            [attr.title]="levelSupported(module, level) ? null : 'Not used for this area'"
                            [attr.tabindex]="tabIndexFor(role.name, module, level)"
                            (click)="chooseLevel(role.name, module, level)"
                          >
                            {{ levelShortLabel(level) }}
                          </button>
                        }
                      </div>
                    </article>
                  }
                </section>
              }
            } @else if (view() === 'compare') {
              <div class="sd-compare-wrap" aria-label="Role comparison table">
                <table class="sd-compare">
                  <caption class="sd-sr-only">Compare permission levels for all roles. Select a role name or cell to edit.</caption>
                  <thead>
                    <tr>
                      <th scope="col" class="sd-compare__area-head">Area</th>
                      @for (role of orderedRoles(); track role.name) {
                        <th scope="col">
                          <button type="button" (click)="editRoleAt(role.name)">{{ roleConfig(role.name).label }}</button>
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (group of groupedModules(); track group.id) {
                      <tr class="sd-compare__group"><th [attr.colspan]="orderedRoles().length + 1">{{ group.label }}</th></tr>
                      @for (module of group.modules; track module) {
                        <tr [attr.data-module]="module">
                          <th scope="row" class="sd-compare__area-head">{{ moduleLabel(module) }}</th>
                          @for (role of orderedRoles(); track role.name) {
                            <td>
                              <button
                                type="button"
                                class="sd-compare-cell"
                                [attr.aria-label]="compareCellLabel(role.name, module)"
                                (click)="editRoleAt(role.name, module)"
                              >
                                <span class="sd-level-mark" [attr.data-level]="draftLevel(role.name, module)">{{ levelMark(draftLevel(role.name, module)) }}</span>
                                {{ levelShortLabel(draftLevel(role.name, module)) }}
                                @if (isChanged(role.name, module)) { <span class="sd-unsaved-dot" aria-hidden="true"></span> }
                              </button>
                            </td>
                          }
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </div>
      }

      @if (totalChanges() > 0) {
        <aside class="sd-save-bar" aria-live="polite" #saveBar>
          @if (discardPrompt()) {
            <span>Discard {{ totalChanges() }} unsaved changes?</span>
            <button type="button" class="sd-text-button" (click)="discardPrompt.set(false)">Keep editing</button>
            <button type="button" class="sd-text-button" (click)="discardAll()">Discard</button>
          } @else {
            <span>{{ totalChanges() }} unsaved changes in {{ dirtyRoleLabels() }}</span>
            <button type="button" class="sd-text-button" (click)="discard()">Discard</button>
            <button #reviewButton seButton variant="primary" type="button" [disabled]="!canManage() || saving()" (click)="requestReview()">Review changes</button>
          }
        </aside>
      }

      <dialog #reviewDialog class="sd-review-dialog" (click)="onDialogClick($event)" (close)="onReviewClosed()">
        <div class="sd-review-dialog__body">
          <h3>Review changes</h3>
          <p>These apply to everyone in the role as soon as you save.</p>
          @for (group of reviewChanges(); track group.role.name) {
            <section class="sd-review-role">
              <h4>{{ group.label }}{{ group.role.memberCount === undefined ? ', everyone in this role' : ', affects ' + group.role.memberCount + ' people' }}</h4>
              @for (change of group.changes; track change.module) {
                <div class="sd-review-change" [class.sd-review-change--impact]="isHighImpact(group.role.name, change.module)">
                  <strong>{{ moduleLabel(change.module) }}</strong>
                  <span class="sd-level-mark" [attr.data-level]="change.before">{{ levelMark(change.before) }} {{ levelShortLabel(change.before) }}</span>
                  <span aria-hidden="true">→</span>
                  <span class="sd-level-mark" [attr.data-level]="change.after">{{ levelMark(change.after) }} {{ levelShortLabel(change.after) }}</span>
                </div>
              }
            </section>
          }
          @if (highImpactCount() > 0) {
            <p class="sd-impact-summary">{{ highImpactCount() }} high-impact changes affect money, people or approvals.</p>
          }
          <label class="sd-reason">
            <span>Reason for the change (kept in the audit log)</span>
            <textarea rows="3" maxlength="300" [value]="reason()" (input)="reason.set($any($event.target).value)"></textarea>
            <span class="sd-reason__count" aria-live="polite">{{ reason().length }} / 300</span>
          </label>
          @if (saveProgress()) { <p class="sd-save-progress" role="status">Saving {{ roleLabel(saveProgress()!) }}…</p> }
          @for (failure of saveErrors(); track failure.role) {
            <div class="sd-save-error" role="alert">
              <span>{{ failure.message }}</span>
              @if (failure.conflict) {
                <button type="button" class="sd-text-button" (click)="reloadRoles()">Reload</button>
              } @else {
                <button type="button" class="sd-text-button" (click)="retrySave()">Retry</button>
              }
            </div>
          }
        </div>
        <div class="sd-review-dialog__actions">
          <button seButton type="button" (click)="closeReview()">Keep editing</button>
          <button seButton variant="primary" type="button" [disabled]="!reasonValid() || saving()" (click)="saveChanges()">
            {{ saving() ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      </dialog>
    </section>
  `,
})
export class StaffPermissionsComponent {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private animationContext?: gsap.Context;
  private entrancePlayed = false;
  private returningToReview = false;

  @ViewChild('reviewDialog') private reviewDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('reviewButton') private reviewButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('panel') private panel?: ElementRef<HTMLElement>;
  @ViewChild('saveBar') private saveBar?: ElementRef<HTMLElement>;

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly matrix = signal<RolePermissionsSnapshot[]>([]);
  readonly drafts = signal<Record<string, Record<string, string>>>({});
  readonly view = signal<EditorView>('edit');
  readonly selectedRole = signal('');
  readonly query = signal('');
  readonly reason = signal('');
  readonly saving = signal(false);
  readonly saveProgress = signal('');
  readonly refreshNotice = signal(false);
  readonly discardPrompt = signal(false);
  readonly groupUndo = signal<{ role: string; group: PermissionGroupId; before: Record<string, string> } | null>(null);
  readonly saveErrors = signal<Array<{ role: string; message: string; conflict: boolean }>>([]);
  readonly canView = computed(() => this.access.can('staff_access', 'view'));
  readonly canManage = computed(() => this.access.can('staff_access', 'full'));

  readonly orderedRoles = computed(() => {
    const roles = this.matrix();
    const order = [...STAFF_ROLE_ORDER, ...EXTERNAL_ROLE_ORDER];
    return [...roles].sort((a, b) => {
      const ai = order.indexOf(a.name);
      const bi = order.indexOf(b.name);
      return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi) || a.name.localeCompare(b.name);
    });
  });
  readonly staffRoles = computed(() => this.orderedRoles().filter((role) => roleConfig(role.name).group === 'staff'));
  readonly externalRoles = computed(() => this.orderedRoles().filter((role) => roleConfig(role.name).group === 'external'));
  readonly selectedRoleRow = computed(() => this.matrix().find((role) => role.name === this.selectedRole()));
  readonly levels = computed(() => this.selectedRoleRow()?.accessLevels ?? []);
  readonly unknownRoles = computed(() => this.matrix().map((role) => role.name).filter((name) => !PERMISSION_ROLES[name]));
  readonly modules = computed(() => {
    const names = new Set(this.matrix().flatMap((role) => role.permissions.map((permission) => permission.module)));
    return [...names].sort((a, b) => {
      const aGroup = this.groupId(a);
      const bGroup = this.groupId(b);
      const aIndex = PERMISSION_GROUPS.findIndex((group) => group.id === aGroup);
      const bIndex = PERMISSION_GROUPS.findIndex((group) => group.id === bGroup);
      return aIndex - bIndex || a.localeCompare(b);
    });
  });
  readonly unknownModules = computed(() => this.modules().filter((module) => !PERMISSION_MODULES[module]));
  readonly groupedModules = computed(() => {
    const query = this.query().trim().toLowerCase();
    const groups: PermissionGroup[] = PERMISSION_GROUPS.map((group) => ({
      ...group,
      modules: this.modules().filter((module) => {
        const config = moduleConfig(module);
        const groupId = config?.group ?? 'other';
        const matches = !query || `${this.moduleLabel(module)} ${config?.description ?? ''}`.toLowerCase().includes(query);
        return groupId === group.id && matches;
      }),
    }));
    const other = this.modules().filter((module) => {
      const config = moduleConfig(module);
      const matches = !query || `${this.moduleLabel(module)} ${config?.description ?? ''}`.toLowerCase().includes(query);
      return !config && matches;
    });
    if (other.length) groups.push({ id: 'other', label: 'Other', modules: other });
    return groups.filter((group) => group.modules.length > 0);
  });
  readonly dirtyRoles = computed(() => this.matrix().filter((role) => this.hasChanges(role.name)));
  readonly totalChanges = computed(() => this.dirtyRoles().reduce((sum, role) => sum + this.changesForRole(role.name).length, 0));
  readonly reviewChanges = computed<RoleChanges[]>(() => this.dirtyRoles().map((role) => ({
    role,
    label: roleConfig(role.name).label,
    changes: this.changesForRole(role.name),
  })));
  readonly highImpactCount = computed(() => this.reviewChanges().reduce(
    (sum, group) => sum + group.changes.filter((change) => this.isHighImpact(group.role.name, change.module)).length,
    0,
  ));
  readonly reasonValid = computed(() => this.reason().trim().length >= 5 && this.reason().length <= 300);

  constructor() {
    if (this.canView()) void this.loadRoles();
    afterNextRender(() => this.playEntrance(), { injector: this.injector });
    this.destroyRef.onDestroy(() => {
      this.animationContext?.revert();
    });
  }

  async loadRoles(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const rows = await firstValueFrom(this.api.rolesMatrix());
      this.matrix.set(rows);
      const currentDrafts = this.drafts();
      const drafts: Record<string, Record<string, string>> = {};
      for (const role of rows) {
        drafts[role.name] = this.hasChanges(role.name)
          ? currentDrafts[role.name]!
          : draftForRole(role, this.modulesFrom(rows));
      }
      this.drafts.set(drafts);
      this.selectedRole.set(rows.some((role) => role.name === this.selectedRole()) ? this.selectedRole() : rows[0]?.name ?? '');
      this.loading.set(false);
      this.refreshNotice.set(false);
      if (this.unknownRoles().length || this.unknownModules().length) {
        console.warn('Unmapped role permission keys', { roles: this.unknownRoles(), modules: this.unknownModules() });
      }
    } catch (error) {
      this.loading.set(false);
      this.loadError.set(serverMessage(error));
    }
  }

  readonly moduleGroupsForCompare = this.groupedModules;

  setView(view: EditorView): void {
    this.view.set(view);
  }

  selectRole(name: string): void {
    this.selectedRole.set(name);
  }

  roleLabel(role: string): string {
    return roleConfig(role).label;
  }

  moduleLabel(module: string): string {
    return moduleConfig(module)?.label ?? humanizePermissionKey(module);
  }

  moduleConfig(module: string): PermissionModuleConfig | null {
    return moduleConfig(module);
  }

  levelMark(level: string): string {
    return LEVEL_MARKS[level] ?? '?';
  }

  levelShortLabel(level: string): string {
    const index = this.levels().indexOf(level);
    return index >= 0 ? ['None', 'Own', 'View', 'Approve', 'Full'][index] ?? level : humanizePermissionKey(level);
  }

  levelMeaning(level: string): string {
    return LEVEL_MEANINGS[level] ?? 'Access level returned by the API';
  }

  roleConfig(role: string): PermissionRoleConfig {
    return roleConfig(role);
  }

  roleCount(role: string): number | undefined {
    return this.matrix().find((row) => row.name === role)?.memberCount;
  }

  isReadOnly(roleName: string): boolean {
    return roleConfig(roleName).readOnly || !this.canManage();
  }

  draftLevel(roleName: string, module: string): string {
    return this.drafts()[roleName]?.[module] ?? this.savedLevel(roleName, module);
  }

  savedLevel(roleName: string, module: string): string {
    return this.matrix().find((role) => role.name === roleName)?.permissions.find((permission) => permission.module === module)?.accessLevel ?? 'none';
  }

  changesForRole(roleName: string): PermissionChange[] {
    const role = this.matrix().find((item) => item.name === roleName);
    const draft = this.drafts()[roleName];
    return role && draft ? permissionChanges(role, draft, this.modules()) : [];
  }

  hasChanges(roleName: string): boolean {
    const role = this.matrix().find((item) => item.name === roleName);
    return !!role && roleHasChanges(role, this.drafts()[roleName], this.modules());
  }

  areasWithAccess(roleName: string): number {
    return this.modules().filter((module) => this.draftLevel(roleName, module) !== 'none').length;
  }

  dirtyRoleLabels(): string {
    return this.dirtyRoles().map((role) => roleConfig(role.name).label).join(', ');
  }

  levelSupported(module: string, level: string): boolean {
    const config = moduleConfig(module);
    if (!config) return true;
    if (level === 'own') return config.ownSupported;
    if (level === 'approve') return config.approveSupported;
    return true;
  }

  isChanged(roleName: string, module: string): boolean {
    return this.draftLevel(roleName, module) !== this.savedLevel(roleName, module);
  }

  isHighImpact(roleName: string, module: string): boolean {
    return HIGH_IMPACT_MODULES.has(module) && ['approve', 'full'].includes(this.draftLevel(roleName, module));
  }

  chooseLevel(roleName: string, module: string, level: string): void {
    if (this.saving() || this.isReadOnly(roleName) || !this.levelSupported(module, level)) return;
    const previous = this.draftLevel(roleName, module);
    if (previous === level) return;
    this.updateDraft(roleName, module, level);
    this.flashRow(module);
  }

  onLevelKeydown(event: KeyboardEvent, roleName: string, module: string): void {
    const levels = this.levels();
    const at = levels.indexOf(this.draftLevel(roleName, module));
    const delta = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    for (let offset = 1; offset <= levels.length; offset += 1) {
      const candidate = levels[(at + delta * offset + levels.length) % levels.length];
      if (candidate && this.levelSupported(module, candidate) && !this.isReadOnly(roleName)) {
        this.chooseLevel(roleName, module, candidate);
        requestAnimationFrame(() => {
          const button = this.panel?.nativeElement.querySelector<HTMLButtonElement>(
            `[data-module="${CSS.escape(module)}"] [role="radio"][aria-checked="true"]`,
          );
          button?.focus();
        });
        return;
      }
    }
  }

  tabIndexFor(roleName: string, module: string, level: string): number {
    const selected = this.draftLevel(roleName, module);
    return level === selected || (!this.levelSupported(module, level) && level === 'own') ? 0 : -1;
  }

  compareCellLabel(roleName: string, module: string): string {
    const level = this.draftLevel(roleName, module);
    const unsaved = this.isChanged(roleName, module) ? ', unsaved change' : '';
    return `${this.moduleLabel(module)} for ${roleConfig(roleName).label}: ${this.levelShortLabel(level)}${unsaved}`;
  }

  editRoleAt(roleName: string, module?: string): void {
    this.view.set('edit');
    this.selectedRole.set(roleName);
    if (!module) return;
    afterNextRender(() => {
      const row = this.panel?.nativeElement.querySelector<HTMLElement>(`[data-module="${CSS.escape(module)}"]`);
      if (!row) return;
      row.scrollIntoView({ behavior: this.reducedMotion() ? 'instant' : 'smooth', block: 'center' });
      if (!this.reducedMotion()) {
        this.zone.runOutsideAngular(() => gsap.fromTo(row, { outlineColor: 'transparent' }, { outlineColor: 'var(--se-color-accent)', outlineWidth: 2, outlineStyle: 'solid', duration: 0.6, clearProps: 'outline' }));
      }
    });
  }

  setGroupAccess(group: PermissionGroup, level: string): void {
    const roleName = this.selectedRole();
    if (!level || this.isReadOnly(roleName) || this.saving()) return;
    const modules = group.modules.filter((module) => this.visibleModule(module));
    const before = Object.fromEntries(modules.map((module) => [module, this.draftLevel(roleName, module)]));
    for (const module of modules) this.updateDraft(roleName, module, level);
    this.groupUndo.set({ role: roleName, group: group.id, before });
  }

  undoGroup(groupId: PermissionGroupId): void {
    const undo = this.groupUndo();
    if (!undo || undo.role !== this.selectedRole() || undo.group !== groupId) return;
    for (const [module, level] of Object.entries(undo.before)) this.updateDraft(undo.role, module, level);
    this.groupUndo.set(null);
  }

  undoModule(roleName: string, module: string): void {
    this.updateDraft(roleName, module, this.savedLevel(roleName, module));
  }

  discard(): void {
    if (this.totalChanges() >= 5) {
      this.discardPrompt.set(true);
      return;
    }
    this.discardAll();
  }

  discardAll(): void {
    const next = { ...this.drafts() };
    for (const role of this.matrix()) next[role.name] = draftForRole(role, this.modules());
    this.drafts.set(next);
    this.discardPrompt.set(false);
    this.groupUndo.set(null);
  }

  requestReview(): void {
    if (!this.canManage() || this.totalChanges() === 0) return;
    this.reason.set('');
    this.saveErrors.set([]);
    this.reviewDialog?.nativeElement.showModal();
  }

  closeReview(): void {
    if (this.reviewDialog?.nativeElement.open && !this.saving()) this.reviewDialog.nativeElement.close();
  }

  onDialogClick(event: MouseEvent): void {
    if (event.target === this.reviewDialog?.nativeElement) this.closeReview();
  }

  onReviewClosed(): void {
    if (!this.returningToReview) this.reviewButton?.nativeElement.focus();
    this.returningToReview = false;
  }

  async saveChanges(): Promise<void> {
    if (!this.reasonValid() || !this.canManage() || this.saving()) return;
    this.saving.set(true);
    this.saveErrors.set([]);
    const failures: Array<{ role: string; message: string; conflict: boolean }> = [];
    for (const role of this.dirtyRoles()) {
      const draft = this.drafts()[role.name];
      if (!draft) continue;
      this.saveProgress.set(role.name);
      try {
        const saved = await firstValueFrom(this.api.updateRolePermissions(
          role.name,
          permissionSet(draft, this.modules()),
          { baseVersion: role.version, reason: this.reason().trim() },
        ));
        this.matrix.update((current) => current.map((item) => item.name === role.name ? saved : item));
        this.drafts.update((current) => {
          const next = { ...current };
          delete next[role.name];
          next[role.name] = draftForRole(saved, this.modules());
          return next;
        });
      } catch (error) {
        failures.push({ role: role.name, message: serverMessage(error), conflict: errorStatus(error) === 409 });
      }
    }
    this.saveProgress.set('');
    this.saving.set(false);
    this.saveErrors.set(failures);
    if (failures.length === 0) {
      this.reviewDialog?.nativeElement.close();
      this.toast.show('Saved. Recorded in the audit log.');
    }
  }

  retrySave(): void {
    this.saveErrors.set([]);
    void this.saveChanges();
  }

  async reloadRoles(): Promise<void> {
    this.saveErrors.set([]);
    await this.loadRoles();
  }

  async canDeactivate(): Promise<boolean> {
    if (!this.totalChanges()) return true;
    return this.confirm.ask({
      title: 'Leave with unsaved permission changes?',
      consequence: 'Your draft changes will be lost if you leave this page.',
      confirmLabel: 'Leave page',
      danger: true,
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.totalChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  @HostListener('window:focus')
  async onWindowFocus(): Promise<void> {
    if (this.totalChanges()) {
      this.refreshNotice.set(true);
      return;
    }
    if (!this.loading()) await this.loadRoles();
  }

  private updateDraft(roleName: string, module: string, level: string): void {
    const beforeWasDirty = this.totalChanges() > 0;
    this.drafts.update((current) => ({ ...current, [roleName]: { ...current[roleName], [module]: level } }));
    const afterIsDirty = this.totalChanges() > 0;
    this.animateDirtyBar(beforeWasDirty, afterIsDirty);
  }

  private visibleModule(module: string): boolean {
    const config = moduleConfig(module);
    const query = this.query().trim().toLowerCase();
    return !query || `${this.moduleLabel(module)} ${config?.description ?? ''}`.toLowerCase().includes(query);
  }

  private groupId(module: string): PermissionGroupId {
    return moduleConfig(module)?.group ?? 'other';
  }

  private modulesFrom(rows: RolePermissionsSnapshot[]): string[] {
    return [...new Set(rows.flatMap((role) => role.permissions.map((permission) => permission.module)))];
  }

  private reducedMotion(): boolean {
    return !this.isBrowser || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private playEntrance(): void {
    if (!this.isBrowser || this.entrancePlayed || this.reducedMotion()) return;
    this.entrancePlayed = true;
    this.zone.runOutsideAngular(() => {
      const root = this.panel?.nativeElement;
      if (!root) return;
      this.animationContext = gsap.context(() => {
        gsap.from(root.querySelectorAll('.sd-area'), { y: 12, opacity: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out' });
      }, root);
    });
  }

  private flashRow(module: string): void {
    if (this.reducedMotion()) return;
    const row = this.panel?.nativeElement.querySelector<HTMLElement>(`[data-module="${CSS.escape(module)}"]`);
    if (!row) return;
    this.zone.runOutsideAngular(() => gsap.fromTo(row, { outline: '2px solid var(--se-color-accent)' }, { outline: '2px solid transparent', duration: 0.6, clearProps: 'outline' }));
  }

  private animateDirtyBar(wasDirty: boolean, isDirty: boolean): void {
    if (this.reducedMotion() || wasDirty === isDirty) return;
    afterNextRender(() => {
      const bar = this.saveBar?.nativeElement;
      if (!bar) return;
      this.zone.runOutsideAngular(() => gsap.fromTo(bar, { y: isDirty ? 16 : 0, opacity: isDirty ? 0 : 1 }, { y: 0, opacity: 1, duration: 0.2, ease: 'power2.out' }));
    });
  }
}