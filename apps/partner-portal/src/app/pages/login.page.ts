import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';
import { BrandAlertService } from '../brand-alert.service';
import { PortalStore } from '../portal.store';
import { ThemeService } from '../theme.service';

/**
 * Screen P1, Partner sign-in + two-step hardware verification.
 * Phase 01 (identity) is live; Phase 02 (TOTP challenge) activates when the
 * API answers `requires2fa` with a challenge token (auth/2fa/verify).
 *
 * Laid out as a split card: a decorative branded half beside the form half.
 * The card follows the app's own tokens, so it tracks the live light/dark
 * toggle the top strip exposes.
 */
@Component({
  selector: 'app-login-page',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p1-app">
      <header class="p1-topbar">
        <div class="p1-topstatus">
          <span class="p1-dot" aria-hidden="true"></span>
          <span class="material-symbols-outlined p1-shield">shield</span>
          <span>{{ phase() === 2 ? 'Security enclave active' : 'Partner Portal Security Enclave' }}</span>
        </div>
        <div class="p1-topright">
          <span class="p1-chip">{{ phase() === 2 ? 'MFA CHALLENGE' : 'EQUITY REGISTRY' }}</span>
          <button type="button" class="p1-iconbtn" [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'" (click)="theme.toggle()">
            <span class="material-symbols-outlined">{{ theme.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</span>
          </button>
        </div>
      </header>

      <main class="p1-main">
        @if (phase() === 1) {
          <section class="p1-hero">
            <div class="p1-heroicon"><span class="material-symbols-outlined">account_balance</span></div>
            <h1>SEENTAIR PARTNERS</h1>
            <p>Equity, Dividends & Manufacturing Telemetry</p>
          </section>

          <div class="p1-notice"><span class="material-symbols-outlined">verified</span><p><strong>Authorised stakeholders only:</strong> Access is restricted to registered equity partners and factory investment syndicate members.</p></div>

          <section class="p1-card">
            <div>
              <h2>Partner Account Access</h2>
              <p class="p1-sub">Sign in to view financial audits and distribution ledgers</p>
            </div>
            <form class="p1-form" (ngSubmit)="signIn()" novalidate>
              <label class="p1-field"><span>Investor corporate email</span>
                <div class="p1-inputwrap"><span class="material-symbols-outlined">mail</span><input type="email" name="email" [(ngModel)]="email" required autocomplete="email" placeholder="partner@domain.com" /></div>
              </label>
              <label class="p1-field">
                <div class="p1-labelrow"><span>Partner Security Key</span><button class="p1-link" type="button" (click)="forgot()">Forgot key?</button></div>
                <div class="p1-inputwrap">
                  <span class="material-symbols-outlined">key</span>
                  <input [type]="showPassword() ? 'text' : 'password'" name="password" [(ngModel)]="password" required autocomplete="current-password" placeholder="Password" />
                  <button type="button" class="p1-affix" [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'" (click)="showPassword.set(!showPassword())"><span class="material-symbols-outlined">{{ showPassword() ? 'visibility_off' : 'visibility' }}</span></button>
                </div>
              </label>
              <button class="p1-btn p1-btn--primary" type="submit" [disabled]="busy()">
                <span>{{ busy() ? 'Signing inâ€¦' : 'Proceed to 2FA Challenge' }}</span>
                <span class="material-symbols-outlined">security</span>
              </button>
              @if (error()) { <p class="p1-banner p1-banner--error" role="alert">{{ error() }}</p> }
              @if (info()) { <p class="p1-banner p1-banner--info" role="status">{{ info() }}</p> }
            </form>
          </section>

          <section class="p1-trust">
            <div class="tile"><span class="material-symbols-outlined">query_stats</span><strong>Factory Telemetry</strong><p>Aggregated Aba line production capacity and cut volume.</p></div>
            <div class="tile"><span class="material-symbols-outlined">pie_chart</span><strong>Equity Registry</strong><p>Real-time cap table positions and audited distributions.</p></div>
            <div class="tile"><span class="material-symbols-outlined">payments</span><strong>Quarterly Dividends</strong><p>Calculated on audited EBITDA covenants every 90 days.</p></div>
            <div class="tile"><span class="material-symbols-outlined">gavel</span><strong>SEC & NDA Compliance</strong><p>All financial statements governed under confidentiality covenants.</p></div>
          </section>
        } @else {
          <section class="p1-hero">
            <div class="p1-heroicon"><span class="material-symbols-outlined">phonelink_lock</span></div>
            <h1>Security Challenge Active</h1>
            <p>Enter the 6-digit rotating verification code from your hardware token or authenticator app.</p>
          </section>

          <section class="p1-card">
            <form class="p1-form" (ngSubmit)="verify()" novalidate>
              <label class="p1-field"><span>6-Digit Authenticator Code</span>
                <input class="otp" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" placeholder="??????" [(ngModel)]="code" />
              </label>
              <div class="p1-meta"><span><span class="material-symbols-outlined">timer</span> Codes rotate every 30s</span><span>Rate-limited attempts</span></div>
              <button class="p1-btn p1-btn--primary" type="submit" [disabled]="busy() || code.length < 6">
                <span>{{ busy() ? 'Verifyingâ€¦' : 'Verify & Enter Portal' }}</span>
                <span class="material-symbols-outlined">lock_open</span>
              </button>
              <button type="button" class="p1-link center" (click)="restart()">Use backup recovery key / start over</button>
              @if (error()) { <p class="p1-banner p1-banner--error" role="alert">{{ error() }}</p> }
            </form>
          </section>

          <div class="p1-notice muted-note"><p>Partner telemetry access is audited under Section 14 of the Seentair Partner Operating Covenant. Session tokens expire after 30 minutes of inactivity.</p></div>
        }
      </main>

      <footer class="p1-footer">
        @if (phase() === 2) { <span>SESSION ID: #ST-AUTH-7719</span><span>ENCRYPTED: ED25519</span> }
        @else { <span>SEENTAIR EQUITY LEDGER</span><span>Aba, Nigeria</span> }
      </footer>
    </div>
  `,
  styles: [`
    :host{display:block;}
    .p1-app{min-height:100vh;background:#f7f2ea;color:#1b1916;display:flex;flex-direction:column;font-family:'Urbanist',sans-serif;}
    .p1-topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px 12px;border-bottom:1px solid rgba(232,225,211,.7);background:rgba(247,242,234,.9);backdrop-filter:blur(10px);}
    .p1-topstatus,.p1-topright{display:flex;align-items:center;gap:8px;} .p1-topstatus{font-size:12px;color:#7b756a;font-weight:500;}
    .p1-shield{font-size:14px;color:#c88a12;} .p1-dot{width:8px;height:8px;border-radius:999px;background:#c88a12;box-shadow:0 0 0 4px rgba(200,138,18,.15);}
    .p1-chip{font:600 11px/1.2 'JetBrains Mono',monospace;padding:4px 8px;border-radius:999px;border:1px solid #e8e1d3;background:#efe3c8;color:#1b1916;}
    .p1-iconbtn{border:1px solid #e8e1d3;background:#fffdf9;color:#7b756a;border-radius:999px;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;}
    .material-symbols-outlined{font-size:18px;line-height:1;}
    .p1-main{flex:1;width:100%;max-width:390px;margin:0 auto;padding:20px 16px;display:flex;flex-direction:column;gap:16px;}
    .p1-hero{text-align:center;padding-top:4px;}
    .p1-heroicon{width:48px;height:48px;margin:0 auto 10px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;background:#1b1916;color:#c88a12;border:1px solid #e8e1d3;}
    .p1-hero h1{margin:0;font:700 24px/1.1 Urbanist,sans-serif;letter-spacing:-.02em;}
    .p1-hero p{margin:4px auto 0;color:#7b756a;font-size:13px;max-width:280px;}
    .p1-notice{display:flex;gap:10px;align-items:flex-start;padding:14px;border-radius:12px;border:1px solid #e8e1d3;background:rgba(239,227,200,.7);font-size:12px;line-height:1.5;}
    .p1-notice .material-symbols-outlined{color:#c88a12;}
    .p1-card{background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;padding:20px;box-shadow:0 8px 24px -4px rgba(27,25,22,.06);display:flex;flex-direction:column;gap:14px;}
    .p1-card h2{margin:0;font:700 18px/1.2 Urbanist,sans-serif;} .p1-sub{margin:2px 0 0;color:#7b756a;font-size:13px;}
    .p1-form{display:flex;flex-direction:column;gap:12px;}
    .p1-field{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:600;color:#1b1916;}
    .p1-labelrow{display:flex;justify-content:space-between;align-items:center;}
    .p1-inputwrap{position:relative;display:flex;align-items:center;}
    .p1-inputwrap>.material-symbols-outlined{position:absolute;left:12px;color:#7b756a;}
    .p1-inputwrap input{padding-left:38px;padding-right:40px;}
    .p1-field input{width:100%;border:1px solid #e8e1d3;background:rgba(247,242,234,.6);color:#1b1916;border-radius:10px;padding:11px 14px;font:400 14px/1.3 Urbanist,sans-serif;min-height:44px;}
    .p1-field input:focus{outline:none;border-color:#c88a12;background:#fffdf9;}
    .p1-field input.otp{text-align:center;letter-spacing:.25em;font:700 20px/1 'JetBrains Mono',monospace;padding:12px;}
    .p1-affix{position:absolute;right:8px;border:0;background:none;color:#7b756a;padding:6px;}
    .p1-link{border:0;background:none;color:#93600a;font:500 12px/1 Urbanist,sans-serif;padding:0;} .p1-link.center{text-align:center;}
    .p1-btn{width:100%;min-height:48px;border-radius:999px;border:0;display:inline-flex;align-items:center;justify-content:center;gap:8px;font:600 15px/1 Urbanist,sans-serif;padding:12px 16px;}
    .p1-btn--primary{background:#c88a12;color:#1a1405;} .p1-btn:disabled{opacity:.6;}
    .p1-banner{margin:0;padding:10px 12px;border-radius:10px;font-size:12px;}
    .p1-banner--error{background:rgba(191,58,45,.1);color:#8f2b21;border:1px solid rgba(191,58,45,.25);}
    .p1-banner--info{background:rgba(35,128,77,.1);color:#1d6840;border:1px solid rgba(35,128,77,.2);}
    .p1-meta{display:flex;justify-content:space-between;gap:8px;font:500 11px/1.2 'JetBrains Mono',monospace;color:#7b756a;border-top:1px solid #e8e1d3;padding-top:10px;}
    .p1-meta span{display:inline-flex;align-items:center;gap:4px;} .p1-meta .material-symbols-outlined{font-size:15px;color:#c88a12;}
    .p1-trust{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .tile{background:rgba(255,253,249,.85);border:1px solid #e8e1d3;border-radius:12px;padding:12px;}
    .tile .material-symbols-outlined{color:#c88a12;margin-bottom:4px;}
    .tile strong{display:block;font-size:12px;color:#1b1916;margin-bottom:2px;} .tile p{margin:0;font-size:11px;color:#7b756a;line-height:1.4;}
    .muted-note{background:rgba(239,227,200,.5);} .muted-note p{margin:0;color:#7b756a;}
    .p1-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 20px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid #e8e1d3;background:rgba(239,227,200,.6);color:#7b756a;font:500 11px/1.2 'JetBrains Mono',monospace;}
    @media (max-width:360px){.p1-trust{grid-template-columns:1fr;}}
  `],
})
export class LoginPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly store = inject(PortalStore);
  readonly theme = inject(ThemeService);
  private readonly alerts = inject(BrandAlertService);

  readonly phase = signal<1 | 2>(1);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly showPassword = signal(false);
  private challengeToken: string | null = null;

  /**
   * Desktop-only gate for the branded half. This app has no shared
   * ViewportService, so it is declared here rather than pulled in from another
   * app: the three frontends have independent node_modules and sharing a file
   * across them would mean a new package for one boolean.
   */
  readonly isDesktop = signal(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches,
  );

  email = '';
  password = '';
  code = '';

  constructor() {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 900px)');
    // addEventListener rather than addListener: the deprecated signature is the
    // one Safari and older Chrome reject.
    mql.addEventListener('change', (e) => this.isDesktop.set(e.matches));
  }

  signIn(): void {
    if (this.busy() || this.phase() === 2) return;
    this.error.set(null);
    this.info.set(null);
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
        this.error.set('Authorization failed: verified investor accounts only.');
      },
    });
  }

  verify(): void {
    if (!this.challengeToken || this.busy()) return;
    this.error.set(null);
    this.info.set(null);
    this.busy.set(true);
    this.api.verify2fa(this.challengeToken, this.code).subscribe({
      next: () => {
        this.busy.set(false);
        this.enter();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Verification failed: the code is incorrect or the challenge expired.');
      },
    });
  }

  restart(): void {
    this.phase.set(1);
    this.challengeToken = null;
    this.code = '';
    this.error.set(null);
    this.info.set(null);
  }

  /** Password reset door, consistent with the other Seentair sign-in forms. */
  forgot(): void {
    if (this.phase() === 2) return;
    this.error.set(null);
    this.info.set(null);
    if (!this.emailValid()) {
      this.error.set('Enter your authorized email first, then tap Forgot.');
      return;
    }
    this.api.forgotPassword(this.email.trim()).subscribe({
      next: () => this.info.set('If that email is registered, a reset link has been sent.'),
      error: () => this.info.set('If that email is registered, a reset link has been sent.'),
    });
  }

  private emailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  private enter(): void {
    this.store.clear();
    void this.alerts.toast('Session authorized: investor terminal unlocked');
    void this.router.navigateByUrl('/overview');
  }
}