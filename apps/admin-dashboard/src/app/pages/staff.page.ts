import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, AuditEntry } from '../api.service';

interface UserRow { id: string; name: string; email: string; phone?: string | null; status: string; totpEnabled: boolean; role: { name: string }; }

const ROLES = [
  'business_owner_admin', 'management', 'sales', 'inventory',
  'production', 'finance_accounting', 'partner_investor', 'wholesaler', 'customer',
];

/** A16 — Staff directory & access control matrix. Approved Stitch layout:
    headcount tiles, searchable directory with role/2FA chips, and a
    role-inspector rail with the role-change action. Access stays enforced
    server-side (RBAC principle #6). */
@Component({
  selector: 'app-staff-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Admin · Access control</p>
        <h1>Staff directory & access roles</h1>
        <p class="ops-sub">Manage staff and operational clearance levels — least privilege by default.</p>
      </div>
      <div class="ops-actions">
        <button class="cta small" type="button" (click)="showInvite.set(!showInvite())">{{ showInvite() ? 'Close' : '★ Invite new staff member' }}</button>
      </div>
    </div>

    <div class="kpi-bar">
      <div class="kpi"><span class="kpi-label">Total headcount</span><span class="kpi-value">{{ users().length }}</span><span class="kpi-sub">accounts enrolled</span></div>
      <div class="kpi"><span class="kpi-label">Active</span><span class="kpi-value">{{ activeCount() }}</span><span class="kpi-sub">{{ users().length - activeCount() }} inactive/suspended</span></div>
      <div class="kpi"><span class="kpi-label">2FA enforced</span><span class="kpi-value">{{ totpCount() }}<small>/{{ users().length }}</small></span><span class="kpi-sub">with 2FA on</span></div>
      <div class="kpi"><span class="kpi-label">Roles in use</span><span class="kpi-value">{{ rolesInUse() }}</span><span class="kpi-sub">of {{ roles.length }} set up</span></div>
    </div>

    <p class="rule-strip">START SAFE // new staff start view-only and you give them more access as needed. Turn on 2FA for every account (Security page).</p>

    @if (showInvite()) {
      <section class="panel">
        <div class="panel-head"><h2>Invite new staff member</h2></div>
        <form class="form-grid" (ngSubmit)="create()">
          <label>Name <input [(ngModel)]="nu.name" name="uname" required /></label>
          <label>Email <input type="email" [(ngModel)]="nu.email" name="uemail" required /></label>
          <label>Phone <input [(ngModel)]="nu.phone" name="uphone" /></label>
          <label>Temporary password <input [(ngModel)]="nu.password" name="upass" required minlength="8" /></label>
          <label>Role
            <select [(ngModel)]="nu.role" name="urole" required>
              @for (r of roles; track r) { <option [value]="r">{{ r.replaceAll('_', ' ') }}</option> }
            </select>
          </label>
          <div class="wide"><button class="cta small" type="submit">Create account</button></div>
        </form>
      </section>
    }

    <div class="ops-toolbar">
      <span class="search"><input placeholder="Search by staff name, email or role…" [(ngModel)]="query" name="q" aria-label="Search staff" /></span>
      <div class="seg" role="group" aria-label="Role filter">
        <button type="button" [class.on]="roleFilter() === ''" (click)="roleFilter.set('')">All staff <span class="seg-n">{{ users().length }}</span></button>
        @for (g of roleGroups(); track g.role) {
          <button type="button" [class.on]="roleFilter() === g.role" (click)="roleFilter.set(g.role)">
            {{ g.role.replaceAll('_', ' ') }} <span class="seg-n">{{ g.count }}</span>
          </button>
        }
      </div>
    </div>

    <div class="side-split">
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Staff name</th><th>Contact</th><th>Role / designation</th><th>Status</th><th>2FA</th></tr></thead>
          <tbody>
            @for (u of visible(); track u.id) {
              <tr class="clickable" [class.sel]="selectedId() === u.id" (click)="inspect(u.id)">
                <td>
                  <span class="chip acid" style="margin-right:0.4rem;">{{ initials(u.name) }}</span>
                  <strong>{{ u.name }}</strong><br />
                  <span class="muted small mono">{{ u.id.slice(0, 8) }}</span>
                </td>
                <td class="small">{{ u.email }}<br /><span class="muted mono">{{ u.phone || '—' }}</span></td>
                <td><span class="chip" [class.acid]="u.role.name !== 'customer'">{{ u.role.name.replaceAll('_', ' ') }}</span></td>
                <td><span class="chip" [class.ok]="u.status === 'active'" [class.bad]="u.status !== 'active'">{{ u.status }}</span></td>
                <td><span class="chip" [class.ok]="u.totpEnabled" [class.warn]="!u.totpEnabled">{{ u.totpEnabled ? 'ON' : 'OFF' }}</span></td>
              </tr>
            }
            @if (visible().length === 0) { <tr><td colspan="5" class="muted small">No staff match.</td></tr> }
          </tbody>
        </table>
      </div>

      <aside class="inspector">
        @if (selectedUser(); as u) {
          <div class="insp-head">
            <h2>{{ u.name }}</h2>
            <span class="chip acid">{{ u.role.name.replaceAll('_', ' ') }}</span>
          </div>
          @if (detail(); as d) {
            <dl class="kv">
              <dt>Account id</dt><dd><code class="wrap-anywhere">{{ d['id'] }}</code></dd>
              <dt>Email</dt><dd>{{ u.email }}</dd>
              <dt>Status</dt><dd>{{ u.status }}</dd>
              <dt>Created</dt><dd>{{ dt(d['createdAt']) | date: 'medium' }}</dd>
              <dt>Last login</dt><dd>{{ d['lastLoginAt'] ? (dt(d['lastLoginAt']) | date: 'medium') : 'never' }}</dd>
              <dt>2FA</dt><dd>{{ u.totpEnabled ? 'on' : 'off' }}</dd>
            </dl>
          } @else {
            <p class="muted small">Loading account record…</p>
          }

          <div class="gap-sep"></div>
          <div class="panel-head"><h2>Role & clearance</h2></div>
          <p class="muted small">Each staff member can only see and do what their role allows — this is enforced automatically.</p>
          <!-- GAP: the reference's per-module permission dot-matrix (view/own/edit/full/approve
               per module) needs a permissions read endpoint; the API only exposes role change. -->
          <div class="actions">
            <select [(ngModel)]="roleChoice[u.id]" [name]="'r' + u.id" class="table-filter">
              @for (r of roles; track r) { <option [value]="r">{{ r.replaceAll('_', ' ') }}</option> }
            </select>
            <button class="cta small" (click)="changeRole(u)">Save role permissions</button>
          </div>
        } @else {
          <p class="muted small">Select a staff row to open the access inspector.</p>
        }

        <div class="gap-sep"></div>
        <div class="panel-head"><h2>Latest permission logs</h2><span class="ph-sub">from the audit log</span></div>
        @if (permLogs().length > 0) {
          <ul class="activity">
            @for (e of permLogs(); track e.id) {
              <li><time>{{ e.timestamp | date: 'MMM d, HH:mm' }}</time><span class="act-action">{{ e.action }}</span></li>
            }
          </ul>
        } @else {
          <p class="muted small">No user/role changes in the recent audit window.</p>
        }
      </aside>
    </div>

    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class StaffAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly users = signal<UserRow[]>([]);
  readonly roles = ROLES;
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly showInvite = signal(false);
  readonly roleFilter = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly detail = signal<Record<string, unknown> | null>(null);
  readonly permLogs = signal<AuditEntry[]>([]);
  roleChoice: Record<string, string> = {};
  query = '';
  nu = { name: '', email: '', phone: '', password: '', role: 'sales' };

  ngOnInit(): void {
    this.query = this.route.snapshot.queryParamMap.get('q') ?? '';
    this.load();
    this.api.auditLog({ action: 'user', limit: 6 }).subscribe({
      next: (res) => this.permLogs.set(res.data),
      error: () => this.permLogs.set([]),
    });
  }

  readonly activeCount = computed(() => this.users().filter((u) => u.status === 'active').length);
  readonly totpCount = computed(() => this.users().filter((u) => u.totpEnabled).length);
  readonly rolesInUse = computed(() => new Set(this.users().map((u) => u.role.name)).size);
  readonly roleGroups = computed(() => {
    const counts = new Map<string, number>();
    for (const u of this.users()) counts.set(u.role.name, (counts.get(u.role.name) ?? 0) + 1);
    return [...counts.entries()].map(([role, count]) => ({ role, count }));
  });

  visible(): UserRow[] {
    const q = this.query.trim().toLowerCase();
    const rf = this.roleFilter();
    return this.users().filter((u) => {
      if (rf && u.role.name !== rf) return false;
      return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.name.includes(q);
    });
  }

  selectedUser(): UserRow | null {
    const id = this.selectedId();
    return id ? (this.users().find((u) => u.id === id) ?? null) : null;
  }

  initials(name: string): string {
    const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || 'SE';
  }
  dt(v: unknown): string | null { return v ? String(v) : null; }

  inspect(id: string): void {
    if (this.selectedId() === id) { this.selectedId.set(null); this.detail.set(null); return; }
    this.selectedId.set(id);
    this.detail.set(null);
    this.api.user(id).subscribe({
      next: (u) => this.detail.set(u),
      error: (e) => this.error.set(e?.error?.message ?? 'Could not load that account.'),
    });
  }

  private load(): void {
    this.api.users().subscribe((res) => {
      const rows = res.data as unknown as UserRow[];
      this.users.set(rows);
      for (const u of rows) this.roleChoice[u.id] ??= u.role.name;
    });
  }

  create(): void {
    this.api.createUser({
      name: this.nu.name, email: this.nu.email, phone: this.nu.phone || undefined,
      password: this.nu.password, role: this.nu.role,
    }).subscribe({
      next: () => { this.showInvite.set(false); this.message.set('Account created — share the temporary password securely and have them change it via Forgot password.'); this.error.set(null); this.load(); },
      error: (e) => this.error.set(e?.error?.message ?? 'Create failed.'),
    });
  }

  changeRole(u: UserRow): void {
    this.api.changeRole(u.id, this.roleChoice[u.id]).subscribe({
      next: () => { this.message.set(`${u.name} is now ${this.roleChoice[u.id].replaceAll('_', ' ')}.`); this.error.set(null); this.load(); },
      error: (e) => this.error.set(e?.error?.message ?? 'Role change failed.'),
    });
  }
}
