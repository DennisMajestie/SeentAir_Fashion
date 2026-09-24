import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface PartnerRow { id: string; equityPercentage: number; investedAmount: number; user: { id: string; name: string; email: string }; }
interface DistRow { period: string; totalProfit: number; reinvestmentAmount: number; dividendPool: number; reserveAmount: number; perPartnerBreakdown: { founderCeo: number; partners: Array<{ name: string; amount: number }> }; }

/** Partner administration — investor records, the 40% equity cap, and
    approval-gated quarterly distributions per the confirmed 40/40/20 model. */
@Component({
  selector: 'app-partners-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Partners & investors</h1>
    <p class="rule-strip">AGREED MODEL // 1,000,000 shares: 60% founder, 40% partners. Profits split each quarter: 40% reinvested, 40% paid out, 20% kept in reserve.</p>

    <div class="cols">
      <section class="panel lead">
        <p class="section-label">Partners <span class="count">[{{ partners().length | number: '2.0' }}] · {{ allocated() }}% of 40% allocated</span></p>
        <table class="table">
          <thead><tr><th>Partner</th><th>Equity</th><th>Shares</th><th>Invested</th><th></th></tr></thead>
          <tbody>
            @for (p of partners(); track p.id) {
              <tr>
                <td><strong>{{ p.user.name }}</strong><br /><span class="muted small">{{ p.user.email }}</span></td>
                <td class="mono">{{ p.equityPercentage }}%</td>
                <td class="mono">{{ (p.equityPercentage * 10000) | number }}</td>
                <td class="mono">₦{{ p.investedAmount | number: '1.0-0' }}</td>
                <td>
                  <button class="link" type="button" (click)="viewAs(p.id)">
                    {{ viewingId() === p.id ? 'hide' : 'view their dashboard' }}
                  </button>
                </td>
              </tr>
              @if (viewingId() === p.id) {
                <tr>
                  <td colspan="5">
                    @if (partnerView(); as v) {
                      <p class="small"><span class="chip acid">as the partner sees it</span>
                        Equity {{ v['equityPercentage'] }}% ·
                        invested <span class="naira">₦{{ num(v['investedAmount']) | number: '1.0-0' }}</span> ·
                        total received <span class="naira">₦{{ num(v['totalReceived']) | number: '1.0-2' }}</span></p>
                      <p class="small muted">Partners never see customer data — this is the same
                        read-only view served to their portal.</p>
                    } @else {
                      <p class="small muted">Loading partner view…</p>
                    }
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </section>

      <section class="panel">
        <p class="section-label">Add partner</p>
        <p class="muted small">The person needs a staff login first (Staff page). Their payment is recorded automatically.</p>
        <form (ngSubmit)="createPartner()">
          <label>Partner user id <input [(ngModel)]="np.userId" name="puid" required placeholder="uuid from Staff page" /></label>
          <label>Equity % (of total shares) <input type="number" min="0.01" max="40" step="0.01" [(ngModel)]="np.equityPercentage" name="peq" required /></label>
          <label>Invested amount ₦ <input type="number" min="1" [(ngModel)]="np.investedAmount" name="pinv" required /></label>
          <button class="cta small" type="submit">Create partner record</button>
        </form>
      </section>
    </div>

    <div class="cols">
      <section class="panel">
        <p class="section-label">Declare quarterly distribution</p>
        <form (ngSubmit)="distribute()">
          <label>Period <input [(ngModel)]="nd.period" name="dper" required placeholder="2026-Q4" /></label>
          <label>Total profit ₦ <input type="number" min="1" [(ngModel)]="nd.totalProfit" name="dprof" required /></label>
          <div class="actions">
            @if (!nd.approvalRequestId) {
              <button class="cta small ghost" type="button" (click)="requestDistApproval()">Request fund-movement approval</button>
            } @else {
              <span class="chip acid">req {{ nd.approvalRequestId.slice(0, 8) }}</span>
              <button class="cta small" type="submit">Distribute</button>
            }
          </div>
        </form>
      </section>

      <section class="panel">
        <p class="section-label">Distribution history</p>
        @if (distributions().length === 0) { <p class="muted small">None yet.</p> }
        @for (d of distributions(); track d.period) {
          <div class="panel tight">
            <p><strong class="mono">{{ d.period }}</strong> · profit ₦{{ d.totalProfit | number: '1.0-0' }}</p>
            <p class="muted small mono">reinvest ₦{{ d.reinvestmentAmount | number: '1.0-0' }} · dividends ₦{{ d.dividendPool | number: '1.0-0' }} · reserve ₦{{ d.reserveAmount | number: '1.0-0' }}</p>
            <p class="small">Founder/CEO: <span class="naira">₦{{ d.perPartnerBreakdown.founderCeo | number: '1.0-0' }}</span>
              @for (pp of d.perPartnerBreakdown.partners; track pp.name) { · {{ pp.name }}: <span class="naira">₦{{ pp.amount | number: '1.0-0' }}</span> }
            </p>
          </div>
        }
      </section>
    </div>
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class PartnersAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly partners = signal<PartnerRow[]>([]);
  readonly distributions = signal<DistRow[]>([]);
  /** Partner-side dashboard, viewed by staff. */
  readonly viewingId = signal<string | null>(null);
  readonly partnerView = signal<Record<string, unknown> | null>(null);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  np = { userId: '', equityPercentage: 0, investedAmount: 0 };
  nd = { period: '', totalProfit: 0, approvalRequestId: '' };

  ngOnInit(): void { this.load(); }
  private load(): void {
    this.api.partners().subscribe((res) => {
      const rows = res as unknown as PartnerRow[];
      this.partners.set(rows);
      if (rows.length > 0) {
        this.api.partnerDistributions(rows[0].id).subscribe((d) => this.distributions.set(d as unknown as DistRow[]));
      }
    });
  }
  allocated(): number { return this.partners().reduce((s, p) => s + Number(p.equityPercentage), 0); }
  /** The owner checking a partner's own dashboard (GET /partners/:id/dashboard). */
  num(v: unknown): number { return Number(v ?? 0); }

  viewAs(partnerId: string): void {
    if (this.viewingId() === partnerId) { this.viewingId.set(null); return; }
    this.viewingId.set(partnerId);
    this.partnerView.set(null);
    this.api.partnerDashboard(partnerId).subscribe({
      next: (v) => this.partnerView.set(v),
      error: (e) => { this.viewingId.set(null); this.fail(e, 'Could not load that partner view.'); },
    });
  }

  private ok(m: string): void { this.message.set(m); this.error.set(null); this.load(); }
  private fail(e: { error?: { message?: string } }, fb: string): void { this.error.set(e?.error?.message ?? fb); this.message.set(null); }

  createPartner(): void {
    this.api.createPartner({
      userId: this.np.userId, equityPercentage: Number(this.np.equityPercentage),
      investedAmount: Number(this.np.investedAmount),
    }).subscribe({ next: () => this.ok('Partner created — their payment is recorded automatically.'), error: (e) => this.fail(e, 'Create failed (role/equity cap?).') });
  }

  requestDistApproval(): void {
    if (!this.nd.period || !this.nd.totalProfit) { this.error.set('Fill period and total profit first.'); return; }
    this.api.createApproval('fund_movement', { purpose: `profit distribution ${this.nd.period}`, totalProfit: this.nd.totalProfit })
      .subscribe({ next: (r) => { this.nd.approvalRequestId = r.id; this.ok('Approval requested — Management decides in the queue.'); }, error: (e) => this.fail(e, 'Request failed.') });
  }

  distribute(): void {
    this.api.createDistribution({
      period: this.nd.period, totalProfit: Number(this.nd.totalProfit), approvalRequestId: this.nd.approvalRequestId,
    }).subscribe({
      next: () => { this.nd = { period: '', totalProfit: 0, approvalRequestId: '' }; this.ok('Distribution declared — partners see it in their portal.'); },
      error: (e) => this.fail(e, 'Not approved yet, or period already distributed.'),
    });
  }
}
