import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, PartnerDashboard } from './api.service';

/**
 * Partner/Investor portal — the confirmed dashboard flow (appendix 17):
 * Business Overview → Investment Information → Performance →
 * Inventory Visibility → Accounts & Reports → Profit Sharing.
 * Read-mostly; aggregates only — never customer data.
 */
@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  template: `
    <header class="site-header">
      <span class="logo">SEENTAIR <em>PARTNERS</em></span>
      @if (api.isLoggedIn) {
        <button class="link" (click)="logout()">Sign out</button>
      }
    </header>
    <main>
      @if (!api.isLoggedIn) {
        <form class="panel auth" (ngSubmit)="signIn()">
          <h1>Investor sign in</h1>
          <label>Email <input type="email" [(ngModel)]="email" name="email" required /></label>
          <label>Password <input type="password" [(ngModel)]="password" name="password" required autocomplete="current-password" /></label>
          <button class="cta" type="submit">Sign in</button>
          @if (error()) { <p class="error">{{ error() }}</p> }
        </form>
      } @else if (dash(); as d) {
        <p class="page-kicker">Quarterly transparency // your investment at a glance</p>
        <h1 class="page-title">Partner dashboard</h1>

        <p class="section-label">Business overview</p>
        <div class="tiles">
          <div class="tile"><span class="label">Total income</span><strong>₦{{ d.businessOverview.totalIncome | number: '1.0-0' }}</strong></div>
          <div class="tile" [class.negative]="d.businessOverview.profitLoss.net < 0">
            <span class="label">Net profit / loss</span><strong>₦{{ d.businessOverview.profitLoss.net | number: '1.0-0' }}</strong>
          </div>
        </div>

        <p class="section-label">Investment information</p>
        <div class="tiles">
          <div class="tile"><span class="label">Invested</span><strong>₦{{ d.investmentInformation.investedAmount | number: '1.0-0' }}</strong></div>
          <div class="tile"><span class="label">Equity</span><strong>{{ d.investmentInformation.equityPercentage }}%</strong></div>
          <div class="tile">
            <span class="label">Shares</span>
            <strong>{{ d.investmentInformation.shares | number }}</strong>
            <span class="sub">of {{ d.investmentInformation.totalShares | number }}</span>
          </div>
        </div>

        <p class="section-label">Performance</p>
        <div class="tiles">
          <div class="tile"><span class="label">Income</span><strong>₦{{ d.performance.income | number: '1.0-0' }}</strong></div>
          <div class="tile"><span class="label">Expenditure</span><strong>₦{{ d.performance.expenditure | number: '1.0-0' }}</strong></div>
          <div class="tile" [class.negative]="d.performance.net < 0"><span class="label">Net</span><strong>₦{{ d.performance.net | number: '1.0-0' }}</strong></div>
        </div>

        <p class="section-label">Inventory visibility</p>
        <div class="tiles">
          <div class="tile"><span class="label">Finished goods in stock</span><strong>{{ d.inventoryVisibility.finishedGoodsUnits | number }}</strong><span class="sub">units — aggregates only</span></div>
        </div>

        <p class="section-label">Profit sharing <span class="count">// 40% reinvest · 40% dividends · 20% reserve</span></p>
        @if (d.profitSharing.length === 0) {
          <p class="muted">No distributions yet — dividends are declared quarterly.</p>
        } @else {
          <table class="table">
            <thead><tr><th>Period</th><th>Total profit</th><th>Dividend pool</th><th>Your dividend</th></tr></thead>
            <tbody>
              @for (row of d.profitSharing; track row.period) {
                <tr>
                  <td class="mono">{{ row.period }}</td>
                  <td class="mono">₦{{ row.totalProfit | number: '1.0-0' }}</td>
                  <td class="mono">₦{{ row.dividendPool | number: '1.0-0' }}</td>
                  <td><span class="naira">₦{{ row.myDividend | number: '1.0-0' }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        }
      } @else if (loadError()) {
        <p class="error">{{ loadError() }}</p>
      } @else {
        <p class="muted">Loading your dashboard…</p>
      }
    </main>
    <footer class="site-footer">© 2026 SEENTAIR LIMITED // INVESTOR RELATIONS</footer>
  `,
})
export class App implements OnInit {
  readonly api = inject(ApiService);
  readonly dash = signal<PartnerDashboard | null>(null);
  readonly error = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  email = '';
  password = '';

  ngOnInit(): void {
    if (this.api.isLoggedIn) this.load();
  }

  signIn(): void {
    this.error.set(null);
    this.api.login(this.email, this.password).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Sign-in failed — investor accounts only.'),
    });
  }

  private load(): void {
    this.api.dashboard().subscribe({
      next: (d) => this.dash.set(d),
      error: (err) =>
        this.loadError.set(
          err?.error?.message ?? 'No partner record is linked to this account yet — contact Seentair.',
        ),
    });
  }

  logout(): void {
    this.api.logout();
    this.dash.set(null);
  }
}
