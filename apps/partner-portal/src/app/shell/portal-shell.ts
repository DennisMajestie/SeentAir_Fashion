import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from '../api.service';
import { PortalStore } from '../portal.store';
import { ThemeService } from '../theme.service';

/**
 * Approved partner-portal chrome (screens P2–P8): encrypted-terminal top bar,
 * "Investor Portfolio" sidebar, distribution ticker, sign-out. Sidebar becomes
 * a drawer under 960px.
 */
@Component({
  selector: 'app-portal-shell',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <header class="termbar">
        <a routerLink="/overview" class="brand" aria-label="SEENTAIR Partners">
          <img src="assets/logo.jpeg" alt="SEENTAIR" height="26" />
          <span class="brand-tag">OPS //<br />PARTNER</span>
        </a>
        <button
          class="drawer-toggle"
          [attr.aria-expanded]="navOpen()"
          aria-label="Toggle navigation"
          (click)="navOpen.set(!navOpen())"
        >
          <span></span><span></span><span></span>
        </button>
        <div class="term-meta">
          <span class="term-chip"
            ><span class="dot ok"></span> 256-Bit Encrypted Investor Terminal</span
          >
          <span class="term-chip">Period: <strong>{{ store.periodLabel() }}</strong></span>
        </div>
        <div class="term-right">
          <span class="term-chip status">Status: <strong>Audited Read-Only</strong></span>
          <button
            class="theme-toggle"
            type="button"
            [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
            (click)="theme.toggle()"
          >
            @if (theme.theme() === 'dark') {
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            } @else {
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
              </svg>
            }
          </button>
          <div class="user-chip">
            <span class="user-name">{{ store.me()?.name ?? 'Partner' }}</span>
            @if (store.dash(); as d) {
              <span class="user-sub"
                >{{ d.investmentInformation.equityPercentage }}% Equity Partner</span
              >
            } @else {
              <span class="user-sub">Equity Partner</span>
            }
          </div>
          <span class="avatar" aria-hidden="true">{{ store.firstName().charAt(0) }}</span>
        </div>
      </header>

      <div class="shell-body">
        @if (navOpen()) {
          <button class="drawer-scrim" aria-label="Close navigation" (click)="navOpen.set(false)"></button>
        }
        <aside class="sidebar" [class.open]="navOpen()">
          <p class="side-heading">Investor Portfolio</p>
          <nav class="side-nav" (click)="navOpen.set(false)">
            <a routerLink="/overview" routerLinkActive="active">Overview</a>
            <a routerLink="/investment" routerLinkActive="active">My Investment</a>
            <a routerLink="/performance" routerLinkActive="active">Performance</a>
            <a routerLink="/inventory" routerLinkActive="active">Inventory</a>
            <a routerLink="/reports" routerLinkActive="active">Accounts &amp; Reports</a>
            <a routerLink="/profit-sharing" routerLinkActive="active">Profit Sharing</a>
            <a routerLink="/documents" routerLinkActive="active">Documents &amp; Messages</a>
            <a routerLink="/settings" routerLinkActive="active">Investor Settings</a>
          </nav>
          <div class="side-bottom">
            <div class="side-box">
              <span class="side-box-label">Distribution</span>
              @if (store.latestDistribution(); as d) {
                <strong class="mono">{{ d.period }}</strong>
                <span class="side-box-sub">Latest declared period</span>
              } @else {
                <strong>—</strong>
                <span class="side-box-sub">No distributions declared yet</span>
              }
            </div>
            <div class="side-box">
              <span class="side-box-label">Liaison Helpdesk</span>
              <strong>Investor Relations Desk</strong>
              <!-- GAP: no liaison contact endpoint — desk contact details come from Seentair directly. -->
              <span class="side-box-sub">Via Documents &amp; Messages</span>
            </div>
            <button class="side-signout" (click)="signOut()">Sign out</button>
          </div>
        </aside>

        <main class="content">
          @if (store.loadError(); as err) {
            <p class="error panel">{{ err }}</p>
          } @else if (!store.dash()) {
            <p class="muted">Loading your investor terminal…</p>
          } @else {
            <router-outlet />
          }
          <footer class="content-footer">
            Seentair Manufacturing Ltd · Institutional Investor Relations Terminal · Lagos, NG
          </footer>
        </main>
      </div>
    </div>
  `,
})
export class PortalShell implements OnInit {
  readonly api = inject(ApiService);
  readonly store = inject(PortalStore);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  readonly navOpen = signal(false);

  ngOnInit(): void {
    this.store.load();
  }

  signOut(): void {
    this.api.logout();
    this.store.clear();
    void this.router.navigateByUrl('/login');
  }
}
