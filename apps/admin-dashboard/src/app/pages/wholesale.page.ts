import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface AccountRow { id: string; status: string; createdAt: string; user: { name: string; email: string }; tier: { id: string; name: string } | null; }
interface TierRow { id: string; name: string; discountPercent: number; ruleDescription: string | null; }

/** Wholesale administration — applications table with approve/tier-assign,
    price tiers panel with approval-gated discount changes. */
@Component({
  selector: 'app-wholesale-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Wholesale</h1>

    <p class="section-label">Applications & accounts <span class="count">[{{ accounts().length | number: '2.0' }}]</span></p>
    <table class="table">
      <thead><tr><th>Business user</th><th>Applied</th><th>Status</th><th>Tier</th><th>Decision</th></tr></thead>
      <tbody>
        @for (a of accounts(); track a.id) {
          <tr>
            <td><strong>{{ a.user.name }}</strong><br /><span class="muted small">{{ a.user.email }}</span></td>
            <td class="mono small">{{ a.createdAt | date: 'mediumDate' }}</td>
            <td><span class="chip" [class.ok]="a.status === 'approved'" [class.warn]="a.status === 'pending'" [class.bad]="a.status === 'rejected'">{{ a.status }}</span></td>
            <td>
              <select [(ngModel)]="tierChoice[a.id]" [name]="'t' + a.id">
                <option value="">— tier —</option>
                @for (t of tiers(); track t.id) { <option [value]="t.id">{{ t.name }} ({{ t.discountPercent }}%)</option> }
              </select>
            </td>
            <td>
              <div class="actions" style="margin:0">
                <button class="cta small" (click)="decide(a, 'approved')">Approve</button>
                <button class="danger" (click)="decide(a, 'rejected')">Reject</button>
                <button class="link" type="button" (click)="inspect(a.id)">
                  {{ detail()?.['id'] === a.id ? 'hide' : 'details' }}
                </button>
              </div>
            </td>
          </tr>
          @if (detail(); as d) {
            @if (d['id'] === a.id) {
              <tr>
                <td colspan="5" class="small">
                  <span class="chip acid">account on file</span>
                  Status {{ d['status'] }} ·
                  tier {{ tierName(d) }} ·
                  applied {{ dt(d['createdAt']) | date: 'medium' }}
                  @if (d['reviewedAt']) { · reviewed {{ dt(d['reviewedAt']) | date: 'medium' }} }
                </td>
              </tr>
            }
          }
        }
      </tbody>
    </table>

    <div class="cols">
      <section class="panel">
        <p class="section-label" style="margin-top:0">Price tiers <span class="count">// criteria pending Open Question #2</span></p>
        <table class="table">
          <thead><tr><th>Tier</th><th>Discount</th><th>Change discount</th></tr></thead>
          <tbody>
            @for (t of tiers(); track t.id) {
              <tr>
                <td><strong>{{ t.name }}</strong><br /><span class="muted small">{{ t.ruleDescription }}</span></td>
                <td class="mono">{{ t.discountPercent }}%</td>
                <td>
                  <div class="actions" style="margin:0">
                    <input type="number" min="0" max="100" placeholder="%" [(ngModel)]="newDiscounts[t.id]" [name]="'d' + t.id" style="max-width:5rem" />
                    @if (!tierApprovals[t.id]) {
                      <button class="cta small ghost" (click)="requestTierApproval(t)">Request approval</button>
                    } @else {
                      <button class="cta small" (click)="applyDiscount(t)">Apply</button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <section class="panel">
        <p class="section-label" style="margin-top:0">Create tier</p>
        <form class="form-grid" (ngSubmit)="createTier()">
          <label>Name <input [(ngModel)]="nt.name" name="tname" required placeholder="Tier A" /></label>
          <label>Discount % <input type="number" min="0" max="100" [(ngModel)]="nt.discountPercent" name="tdisc" required /></label>
          <label class="wide">Rule description <input [(ngModel)]="nt.ruleDescription" name="trule" placeholder="assignment criteria pending client decision" /></label>
          <div class="wide"><button class="cta small" type="submit">Create tier</button></div>
        </form>
      </section>
    </div>
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class WholesaleAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly accounts = signal<AccountRow[]>([]);
  readonly tiers = signal<TierRow[]>([]);
  /** One account's full record, read on demand. */
  readonly detail = signal<Record<string, unknown> | null>(null);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  tierChoice: Record<string, string> = {};
  newDiscounts: Record<string, number> = {};
  tierApprovals: Record<string, string> = {};
  nt = { name: '', discountPercent: 0, ruleDescription: '' };

  ngOnInit(): void { this.load(); }
  private load(): void {
    this.api.wholesaleAccounts().subscribe((res) => {
      const rows = res as unknown as AccountRow[];
      this.accounts.set(rows);
      for (const a of rows) if (a.tier) this.tierChoice[a.id] ??= a.tier.id;
    });
    this.api.tiers().subscribe((res) => this.tiers.set(res as unknown as TierRow[]));
  }
  /** Read one account back (GET /wholesale/accounts/:id). */
  dt(v: unknown): string | null { return v ? String(v) : null; }

  inspect(id: string): void {
    if (this.detail()?.['id'] === id) { this.detail.set(null); return; }
    this.api.wholesaleAccount(id).subscribe({
      next: (a) => this.detail.set(a),
      error: (e) => this.fail(e, 'Could not load that account.'),
    });
  }
  tierName(account: Record<string, unknown>): string {
    const tier = account['tier'] as { name?: string } | null;
    return tier?.name ?? 'none';
  }

  private ok(m: string): void { this.message.set(m); this.error.set(null); this.load(); }
  private fail(e: { error?: { message?: string } }, fb: string): void { this.error.set(e?.error?.message ?? fb); this.message.set(null); }

  decide(a: AccountRow, status: 'approved' | 'rejected'): void {
    this.api.reviewWholesaleAccount(a.id, { status, tierId: this.tierChoice[a.id] || undefined })
      .subscribe({ next: () => this.ok(`${a.user.name}: ${status}.`), error: (e) => this.fail(e, 'Decision failed.') });
  }

  createTier(): void {
    this.api.createTier({ name: this.nt.name, discountPercent: Number(this.nt.discountPercent), ruleDescription: this.nt.ruleDescription || undefined })
      .subscribe({ next: () => this.ok('Tier created.'), error: (e) => this.fail(e, 'Tier failed.') });
  }

  requestTierApproval(t: TierRow): void {
    const to = this.newDiscounts[t.id];
    if (to === undefined) { this.error.set('Enter the new discount first.'); return; }
    this.api.createApproval('price_change', { tier: t.name, from: t.discountPercent, to })
      .subscribe({ next: (r) => { this.tierApprovals[t.id] = r.id; this.ok('Approval requested — Management decides in the queue.'); }, error: (e) => this.fail(e, 'Request failed.') });
  }

  applyDiscount(t: TierRow): void {
    this.api.updateTier(t.id, { discountPercent: Number(this.newDiscounts[t.id]), approvalRequestId: this.tierApprovals[t.id] })
      .subscribe({ next: () => { delete this.tierApprovals[t.id]; this.ok('Discount updated.'); }, error: (e) => this.fail(e, 'Not approved yet.') });
  }
}
