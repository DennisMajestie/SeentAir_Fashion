import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface UserRow { id: string; name: string; email: string; status: string; totpEnabled: boolean; role: { name: string }; }

const ROLES = [
  'business_owner_admin', 'management', 'sales', 'inventory',
  'production', 'finance_accounting', 'partner_investor', 'wholesaler', 'customer',
];

/** Staff & access management — Stitch layout: users table with role/2FA chips,
    create-staff panel, per-row role change. */
@Component({
  selector: 'app-staff-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Staff & access</h1>
    <p class="rule-strip">LEAST PRIVILEGE // new accounts start view-only per the role matrix. Recommend 2FA for every staff account (Security page).</p>

    <div class="cols">
      <section class="panel lead">
        <p class="section-label">Users <span class="count">[{{ users().length | number: '2.0' }}]</span></p>
        <table class="table">
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>2FA</th><th>Change role</th></tr></thead>
          <tbody>
            @for (u of users(); track u.id) {
              <tr>
                <td><strong>{{ u.name }}</strong><br /><span class="muted small">{{ u.email }}</span></td>
                <td><span class="chip acid">{{ u.role.name.replaceAll('_', ' ') }}</span></td>
                <td><span class="chip" [class.ok]="u.status === 'active'" [class.bad]="u.status !== 'active'">{{ u.status }}</span></td>
                <td><span class="chip" [class.ok]="u.totpEnabled">{{ u.totpEnabled ? 'ON' : 'OFF' }}</span></td>
                <td>
                  <div class="actions flat">
                    <select [(ngModel)]="roleChoice[u.id]" [name]="'r' + u.id">
                      @for (r of roles; track r) { <option [value]="r">{{ r.replaceAll('_', ' ') }}</option> }
                    </select>
                    <button class="cta small ghost" (click)="changeRole(u)">Apply</button>
                    <button class="link" type="button" (click)="inspect(u.id)">
                      {{ detail()?.['id'] === u.id ? 'hide' : 'details' }}
                    </button>
                  </div>
                </td>
              </tr>
              @if (detail(); as d) {
                @if (d['id'] === u.id) {
                  <tr>
                    <td colspan="5" class="small">
                      <span class="chip acid">account</span>
                      <code>{{ d['id'] }}</code> ·
                      created {{ dt(d['createdAt']) | date: 'medium' }} ·
                      last login {{ d['lastLoginAt'] ? (dt(d['lastLoginAt']) | date: 'medium') : 'never' }}
                      <span class="muted"> — copy the id when adding a partner record.</span>
                    </td>
                  </tr>
                }
              }
            }
          </tbody>
        </table>
      </section>

      <section class="panel">
        <p class="section-label">Create staff account</p>
        <form (ngSubmit)="create()">
          <label>Name <input [(ngModel)]="nu.name" name="uname" required /></label>
          <label>Email <input type="email" [(ngModel)]="nu.email" name="uemail" required /></label>
          <label>Phone <input [(ngModel)]="nu.phone" name="uphone" /></label>
          <label>Temporary password <input [(ngModel)]="nu.password" name="upass" required minlength="8" /></label>
          <label>Role
            <select [(ngModel)]="nu.role" name="urole" required>
              @for (r of roles; track r) { <option [value]="r">{{ r.replaceAll('_', ' ') }}</option> }
            </select>
          </label>
          <button class="cta small" type="submit">Create account</button>
        </form>
      </section>
    </div>
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class StaffAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly users = signal<UserRow[]>([]);
  readonly roles = ROLES;
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  roleChoice: Record<string, string> = {};
  nu = { name: '', email: '', phone: '', password: '', role: 'sales' };

  ngOnInit(): void { this.load(); }
  /** One staff record, read on demand (GET /users/:id). */
  readonly detail = signal<Record<string, unknown> | null>(null);
  dt(v: unknown): string | null { return v ? String(v) : null; }

  inspect(id: string): void {
    if (this.detail()?.['id'] === id) { this.detail.set(null); return; }
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
      next: () => { this.message.set('Account created — share the temporary password securely and have them change it via Forgot password.'); this.error.set(null); this.load(); },
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
