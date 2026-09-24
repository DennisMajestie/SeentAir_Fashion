import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';
import { PortalStore } from '../portal.store';
import { ThemeService } from '../theme.service';

/**
 * Screen P1 — Partner sign-in + two-step hardware verification.
 * Phase 01 (identity) is live; Phase 02 (TOTP challenge) activates when the
 * API answers `requires2fa` with a challenge token (auth/2fa/verify).
 */
@Component({
  selector: 'app-login-page',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth-shell">
      <header class="auth-topstrip">
        <span class="term-chip"><span class="dot ok"></span> Secure Protocol TLS / Encrypted Session</span>
        <span class="term-chip strip-node">Node: LOS-HQ · Lagos</span>
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
      </header>

      <main class="auth-main">
        <p class="clearance"><span class="dot"></span> Tier-1 institutional clearance required</p>
        <div class="wordmark">
          <img src="assets/logo.jpeg" alt="SEENTAIR" height="34" />
          <span class="wordmark-tag">Partners // Portal</span>
        </div>
        <p class="auth-sub">
          Private access for Seentair Limited registered shareholders and institutional equity
          partners. Strictly confidential financial and manufacturing telemetry.
        </p>

        <div class="auth-card">
          <form class="phase" (ngSubmit)="signIn()" [class.dimmed]="phase() === 2">
            <div class="phase-head">
              <span class="phase-tag">Phase 01</span>
              <h1>Partner identity</h1>
              <span class="phase-side mono">Portal v1</span>
            </div>
            <label class="field">
              Authorized corporate email
              <input
                type="email"
                name="email"
                [(ngModel)]="email"
                required
                autocomplete="email"
                [disabled]="phase() === 2"
              />
            </label>
            <label class="field">
              Master passkey
              <input
                type="password"
                name="password"
                [(ngModel)]="password"
                required
                autocomplete="current-password"
                [disabled]="phase() === 2"
              />
            </label>
            <p class="fine">Terminal lease renews automatically over a secure session cookie.</p>
            <button class="cta block" type="submit" [disabled]="busy() || phase() === 2">
              @if (busy() && phase() === 1) { Authorizing… } @else { Authorize access to terminal }
            </button>
            @if (phase() === 1 && error()) { <p class="error">{{ error() }}</p> }
          </form>

          <form class="phase phase-2" (ngSubmit)="verify()" [class.dimmed]="phase() === 1">
            <div class="phase-head">
              <span class="phase-tag gold-tag">Phase 02 // Challenge</span>
              <h1>Two-step hardware verification</h1>
              <span class="phase-side chip">Restricted</span>
            </div>
            @if (phase() === 2) {
              <div class="challenge-note">
                <strong>Security challenge active.</strong>
                Enter the 6-digit rotating code from the authenticator app enrolled on this
                investor account.
              </div>
            } @else {
              <div class="challenge-note idle">
                Activates after identity authorization when two-step verification is enrolled on
                the account.
              </div>
            }
            <label class="field">
              One-time security token
              <input
                class="otp"
                type="text"
                name="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                pattern="[0-9]*"
                maxlength="6"
                placeholder="••••••"
                [(ngModel)]="code"
                [disabled]="phase() === 1"
              />
            </label>
            <button class="cta block" type="submit" [disabled]="busy() || phase() === 1 || code.length < 6">
              @if (busy() && phase() === 2) { Verifying… } @else { Verify identity &amp; authorize session }
            </button>
            @if (phase() === 2) {
              <p class="fine">Codes rotate every 30 seconds — attempts are rate-limited.</p>
              <button class="link" type="button" (click)="restart()">Start over with email &amp; passkey</button>
              @if (error()) { <p class="error">{{ error() }}</p> }
            }
          </form>
        </div>

        <p class="station-line mono">
          Status:
          @if (phase() === 2) { challenge issued — awaiting verification }
          @else { pre-authorization — credentials required }
        </p>

        <!-- GAP: reference P1 shows live pre-auth KPI figures (run rate, equity retained, hub ops,
             dividend cycle); no unauthenticated telemetry endpoint exists, so these tiles carry
             descriptive copy only — no fabricated numbers. -->
        <div class="kpi-grid auth-kpis">
          <div class="kpi"><span class="kpi-label">Manufacturing</span><span class="kpi-value sm">Factory telemetry</span><span class="kpi-sub">Visible after authorization</span></div>
          <div class="kpi"><span class="kpi-label">Equity registry</span><span class="kpi-value sm">Shareholding &amp; capital</span><span class="kpi-sub">Registered partners only</span></div>
          <div class="kpi"><span class="kpi-label">Lagos hub operations</span><span class="kpi-value sm">Single-factory ops</span><span class="kpi-sub">Aggregates — never customer data</span></div>
          <div class="kpi"><span class="kpi-label">Partner dividend cycle</span><span class="kpi-value sm">Quarterly distribution</span><span class="kpi-sub">40 / 40 / 20 covenant</span></div>
        </div>

        <div class="notice">
          Regulatory &amp; statutory governance notice — this terminal provides restricted,
          read-only institutional data telemetry. Access is granted strictly to verified equity
          partners under non-disclosure covenants. Unauthorised access, scraping, replication, or
          forwarding of manufacturing outputs is strictly prohibited and subject to full criminal
          prosecution under applicable Nigerian law.
        </div>
      </main>

      <footer class="auth-footer">
        Seentair Manufacturing Ltd · Institutional Investor Relations Terminal · Lagos, NG
      </footer>
    </div>
  `,
  styles: [
    `
      .auth-shell { min-height: 100vh; display: flex; flex-direction: column; }
      .auth-topstrip {
        display: flex; align-items: center; gap: 0.5rem;
        padding: calc(0.5rem + env(safe-area-inset-top, 0px)) 1rem 0.5rem;
        border-bottom: 1px solid var(--hairline); background: var(--panel);
        .theme-toggle { margin-left: auto; }
      }
      @media (max-width: 520px) { .strip-node { display: none; } }
      .auth-main { width: min(880px, 100%); margin: 0 auto; padding: 1.6rem 1rem 3rem; }
      .clearance {
        display: flex; align-items: center; justify-content: center; gap: 0.45rem;
        font-size: var(--type-label-sm); font-weight: 700; letter-spacing: 0.18em;
        text-transform: uppercase; color: var(--acid-ink); margin: 0.4rem 0 0.9rem;
        .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gold); }
      }
      .wordmark { display: flex; align-items: center; justify-content: center; gap: 0.6rem;
        img { display: block; height: 34px; width: auto; }
        .wordmark-tag { font-size: var(--type-label-md); font-weight: 700; letter-spacing: 0.2em;
          text-transform: uppercase; color: var(--ink-dim); border-left: 1px solid var(--hairline-2);
          padding-left: 0.6rem; } }
      .auth-sub { text-align: center; color: var(--ink-dim); font-size: var(--type-body-sm);
        max-width: 52ch; margin: 0.6rem auto 1.4rem; }
      .auth-card {
        display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--hairline);
        background: var(--panel); border-radius: var(--radius); overflow: hidden;
      }
      @media (max-width: 759px) { .auth-card { grid-template-columns: 1fr; } }
      .phase { padding: 1.1rem 1.2rem 1.3rem; min-width: 0;
        &.phase-2 { border-left: 1px solid var(--hairline); }
        &.dimmed { opacity: 0.55; }
      }
      @media (max-width: 759px) {
        .phase.phase-2 { border-left: none; border-top: 1px solid var(--hairline); }
      }
      .phase-head { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap;
        border-bottom: 1px solid var(--hairline); padding-bottom: 0.55rem; margin-bottom: 0.4rem;
        h1 { font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.04em; }
        .phase-side { margin-left: auto; color: var(--ink-dim); font-size: var(--type-label-sm); } }
      .phase-tag { font-size: var(--type-label-sm); font-weight: 700; letter-spacing: 0.14em;
        text-transform: uppercase; color: var(--ink-dim); flex-basis: 100%;
        &.gold-tag { color: var(--acid-ink); } }
      .fine { color: var(--ink-dim); font-size: var(--type-label-sm); margin: 0.3rem 0 0.8rem; }
      .challenge-note {
        border: 1px solid var(--gold); background: color-mix(in srgb, var(--gold) 9%, var(--panel));
        padding: 0.6rem 0.7rem; font-size: var(--type-body-sm); margin: 0.6rem 0 0.2rem;
        strong { display: block; }
        &.idle { border-color: var(--hairline); background: var(--panel-2); color: var(--ink-dim); }
      }
      input.otp { font-size: 1.4rem; letter-spacing: 0.9em; text-align: center; font-weight: 700;
        font-variant-numeric: tabular-nums; padding-left: 1.2rem; }
      .station-line { margin: 0.8rem 0 1.4rem; text-align: center; color: var(--ink-dim);
        font-size: var(--type-label-sm); text-transform: uppercase; letter-spacing: 0.14em; }
      .auth-kpis .kpi-value.sm { font-size: 0.95rem; }
      .auth-footer { margin-top: auto; padding: 1.2rem 1rem; border-top: 1px solid var(--hairline);
        text-align: center; color: var(--ink-dim); font-size: var(--type-label-sm);
        letter-spacing: 0.1em; text-transform: uppercase; }
    `,
  ],
})
export class LoginPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly store = inject(PortalStore);
  readonly theme = inject(ThemeService);

  readonly phase = signal<1 | 2>(1);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private challengeToken: string | null = null;

  email = '';
  password = '';
  code = '';

  signIn(): void {
    if (this.busy() || this.phase() === 2) return;
    this.error.set(null);
    this.busy.set(true);
    this.api.login(this.email, this.password).subscribe({
      next: (res) => {
        this.busy.set(false);
        if ('requires2fa' in res) {
          this.challengeToken = res.challengeToken;
          this.phase.set(2);
        } else {
          this.enter();
        }
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Authorization failed — verified investor accounts only.');
      },
    });
  }

  verify(): void {
    if (!this.challengeToken || this.busy()) return;
    this.error.set(null);
    this.busy.set(true);
    this.api.verify2fa(this.challengeToken, this.code).subscribe({
      next: () => {
        this.busy.set(false);
        this.enter();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Verification failed — the code is incorrect or the challenge expired.');
      },
    });
  }

  restart(): void {
    this.phase.set(1);
    this.challengeToken = null;
    this.code = '';
    this.error.set(null);
  }

  private enter(): void {
    this.store.clear();
    void this.router.navigateByUrl('/overview');
  }
}
