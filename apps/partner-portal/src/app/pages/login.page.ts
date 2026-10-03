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
 */
@Component({
  selector: 'app-login-page',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth-shell">
      <header class="auth-topstrip">
        <span class="wordmark">
          <img src="assets/logo.png" alt="SEENTAIR" height="60" />
        </span>
        <span class="term-chip"><span class="dot ok"></span> Secured connection</span>
        <button
          class="theme-toggle"
          type="button"
          [attr.aria-label]="
            theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          "
          (click)="theme.toggle()"
        >
          @if (theme.theme() === 'dark') {
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
              />
            </svg>
          } @else {
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          }
        </button>
      </header>

        <main class="auth-main">
          <p class="eyebrow">Partner access</p>
          <h1>Welcome back.</h1>
          <p class="auth-sub">
            Private access for Seentair Limited registered shareholders and institutional equity
            partners.
          </p>
  
          <div class="auth-card">
            <form class="phase" (ngSubmit)="signIn()" [class.dimmed]="phase() === 2">
              <label class="field">
                Email
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
              <span class="field-row">
                <span>Password</span>
                <button class="link forgot-link" type="button" (click)="forgot()">Forgot?</button>
              </span>
              <span class="pw-wrap">
                <input
                  [type]="showPassword() ? 'text' : 'password'"
                  name="password"
                  [(ngModel)]="password"
                  required
                  autocomplete="current-password"
                  [disabled]="phase() === 2"
                />
                <button
                  class="pw-toggle"
                  type="button"
                  [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                  (click)="showPassword.set(!showPassword())"
                  [disabled]="phase() === 2"
                >
                  {{ showPassword() ? 'Hide' : 'Show' }}
                </button>
              </span>
            </label>
            <p class="fine">Secured connection. Authorised users only.</p>
            <button class="cta block" type="submit" [disabled]="busy() || phase() === 2">
              @if (busy() && phase() === 1) {
                Signing in…
              } @else {
                Sign in
              }
            </button>
            @if (phase() === 1 && error()) {
              <p class="error">{{ error() }}</p>
            }
            @if (phase() === 1 && info()) {
              <p class="auth-info">{{ info() }}</p>
            }
          </form>

          <form class="phase phase-2" (ngSubmit)="verify()" [class.dimmed]="phase() === 1">
            <p class="eyebrow">Two-factor check</p>
            <h1>Verify it's you.</h1>
            @if (phase() === 2) {
              <div class="challenge-note">
                <strong>Security challenge active.</strong>
                Enter the 6-digit code from the authenticator app on your account.
              </div>
            } @else {
              <div class="challenge-note idle">
                Activates after sign-in when two-step verification is enrolled on the account.
              </div>
            }
            <label class="field">
              <span class="field-row">
                <span>Code</span>
              </span>
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
            <button
              class="cta block"
              type="submit"
              [disabled]="busy() || phase() === 1 || code.length < 6"
            >
              @if (busy() && phase() === 2) {
                Verifying…
              } @else {
                Verify
              }
            </button>
            @if (phase() === 2) {
              <p class="fine">Codes rotate every 30 seconds, attempts are rate-limited.</p>
              <button class="link" type="button" (click)="restart()">Start over</button>
              @if (error()) {
                <p class="error">{{ error() }}</p>
              }
            }
          </form>
        </div>

        <!-- GAP: reference P1 shows live pre-auth KPI figures (run rate, equity retained, hub ops,
             dividend cycle); no unauthenticated telemetry endpoint exists, so these tiles carry
             descriptive copy only: no fabricated numbers. -->
        <div class="kpi-grid auth-kpis">
          <div class="kpi">
            <span class="kpi-label">Manufacturing</span
            ><span class="kpi-value sm">Factory telemetry</span
            ><span class="kpi-sub">Visible after authorization</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Equity registry</span
            ><span class="kpi-value sm">Shareholding &amp; capital</span
            ><span class="kpi-sub">Registered partners only</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Aba hub operations</span
            ><span class="kpi-value sm">Single-factory ops</span
            ><span class="kpi-sub">Aggregates: never customer data</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Partner dividend cycle</span
            ><span class="kpi-value sm">Quarterly distribution</span
            ><span class="kpi-sub">40 / 40 / 20 covenant</span>
          </div>
        </div>

        <div class="notice">
          Regulatory &amp; statutory governance notice, this terminal provides restricted,
          read-only institutional data telemetry. Access is granted strictly to verified equity
          partners under non-disclosure covenants. Unauthorised access, scraping, replication, or
          forwarding of manufacturing outputs is strictly prohibited and subject to full criminal
          prosecution under applicable Nigerian law.
        </div>
      </main>

      <footer class="auth-footer">
        Seentair Manufacturing Ltd · Institutional Investor Relations Terminal · Aba, Abia, NG
      </footer>
    </div>
  `,
  styles: [
    `
      /* Shared sign-in background: the same photograph the ops and wholesale
         sign-in screens use (assets/form-bg.jpg). Its own tokens are declared
         here because this screen sits directly on the photo, while the other
         two sit on a photo behind their own scrims. */
      .auth-shell {
        --photo-ink: #f7f2e9;
        --photo-muted: #ddd5c8;
        --photo-line: rgb(247 242 233 / 0.52);
        --photo-gold: #f0dcae;
        --photo-base: #14110e;
        /* Channels only, no alpha: the scrim layers share one ramp. */
        --photo-wash: 10 8 7;

        position: relative;
        isolation: isolate;
        min-height: 100vh;
        min-height: 100svh;
        display: flex;
        flex-direction: column;
        background-color: var(--photo-base);
        background-image: url('/assets/form-bg.jpg');
        background-size: cover;
        background-position: center 26%;
        background-repeat: no-repeat;
        color: var(--photo-ink);

        /* Scrim, shaped like the ops login's: heaviest under the left-hand
           column so the form reads, lifting to the right so the photograph
           survives the right-hand half of the screen. */
        &::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            radial-gradient(
              ellipse 62% 74% at 24% 48%,
              rgb(var(--photo-wash) / 0.28) 0%,
              rgb(var(--photo-wash) / 0.12) 62%,
              transparent 100%
            ),
            linear-gradient(
              90deg,
              rgb(var(--photo-wash) / 0.52) 0%,
              rgb(var(--photo-wash) / 0.46) 30%,
              rgb(var(--photo-wash) / 0.3) 45%,
              rgb(var(--photo-wash) / 0.1) 70%,
              rgb(var(--photo-wash) / 0.04) 100%
            ),
            linear-gradient(
              180deg,
              rgb(var(--photo-wash) / 0.3) 0%,
              rgb(var(--photo-wash) / 0.04) 26%,
              rgb(var(--photo-wash) / 0.38) 100%
            );
        }
      }

      /* The light theme washes the photo to ivory and flips the ink to match,
         the same move as the ops login. Without this the dark ink would sit on
         an unwashed dark photograph. */
      :host-context(:root[data-theme='light']) .auth-shell {
        --photo-ink: #241f1a;
        --photo-muted: #4b423a;
        --photo-line: rgb(44 35 26 / 0.62);
        --photo-gold: #6a4d0d;
        --photo-base: #f6f1e9;
        --photo-wash: 252 249 243;
      }

      /* Text that sits on the photograph rather than on a panel. Each selector is
         prefixed with .auth-shell so it outranks the element's own rule further
         down this block (.auth-footer, .auth-sub and the eyebrow each set their
         own colour at single-class specificity). */
      .auth-shell .auth-main h1,
      .auth-shell .auth-main .eyebrow {
        color: var(--photo-ink);
      }
      .auth-shell .auth-main .eyebrow {
        color: var(--photo-gold);
      }
      .auth-shell .auth-sub {
        color: var(--photo-muted);
      }
      .auth-shell .auth-footer {
        color: var(--photo-muted);
      }
      /* The eyebrow's dot is a background fill, not text. */
      .auth-shell .auth-main .eyebrow .dot {
        background: var(--photo-gold);
      }

      /* logo.png is monochrome near-black, so it disappears on the dark bar in
         the dark theme. It had no filter before this change either, but it used
         to sit on --panel-2; against the frosted bar it has to be flipped. */
      :host-context(:root[data-theme='dark']) .auth-topstrip .wordmark img {
        filter: invert(1);
      }
      .auth-topstrip {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: calc(0.5rem + env(safe-area-inset-top, 0px)) 1rem 0.5rem;
        border-bottom: 1px solid var(--photo-line);
        /* Frosted rather than the flat --panel it used to be, so the bar belongs
           to the photograph instead of sitting on it as an opaque strip. */
        background: color-mix(in srgb, var(--photo-base) 62%, transparent);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        /* Pushed right, which is what puts the chip immediately before the
           toggle: the auto margin sits on the chip, not on the button. With it
           on .theme-toggle the chip was pinned to the far left and the two were
           pushed to opposite ends of the bar. */
        .term-chip {
          margin-left: auto;
          color: var(--photo-ink);
        }
      }
      /* The wordmark moved up out of .auth-main into the bar, so it no longer
         centres - it belongs at the leading edge with the controls opposite. */
      .auth-topstrip .wordmark {
        justify-content: flex-start;
      }
      .auth-main {
        width: min(880px, 100%);
        margin: 0 auto;
        padding: 1.6rem 1rem 3rem;
      }
      /* Centre the sign-in heading. The eyebrow and the sub-copy either side of
         it are already centred, so the h1 was the one line breaking the
         column's vertical axis. */
      .auth-main h1 {
        text-align: center;
      }
            .eyebrow {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.45rem;
              font-size: var(--type-label-sm);
              font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--acid-ink);
        margin: 0.4rem 0 0.9rem;
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--gold);
        }
      }
      .wordmark {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.6rem;
        img {
          display: block;
          /* 60px, matching .site-header on the storefront and .auth-head on the
             ops login. It was 34px here, which is the height the wordmark had
             back when it sat inside .auth-main as page furniture rather than as
             the navbar's brand. */
          height: 60px;
          width: auto;
        }
      }
      .auth-sub {
        text-align: center;
        color: var(--ink-dim);
        font-size: var(--type-body-sm);
        max-width: 52ch;
        margin: 0.6rem auto 1.4rem;
      }
      .auth-card {
        display: grid;
        grid-template-columns: 1fr 1fr;
        border: 1px solid var(--photo-line);
        /* Frosted, but deliberately held near-opaque. The form's own text still
           uses the theme's --ink, which expects a --panel-coloured surface, so
           dropping this much further would put that ink straight on the
           photograph and break contrast in both themes. The ops login can go to
           0.34 alpha because it remaps every text token on the card. */
        background: color-mix(in srgb, var(--panel) 88%, transparent);
        backdrop-filter: blur(18px) saturate(1.15);
        -webkit-backdrop-filter: blur(18px) saturate(1.15);
        border-radius: var(--radius);
        overflow: hidden;
      }
      @media (max-width: 759px) {
        .auth-card {
          grid-template-columns: 1fr;
        }
      }
      .phase {
        padding: 1.1rem 1.2rem 1.3rem;
        min-width: 0;
        &.phase-2 {
          border-left: 1px solid var(--hairline);
        }
        &.dimmed {
          opacity: 0.55;
        }
      }
      @media (max-width: 759px) {
        .phase.phase-2 {
          border-left: none;
          border-top: 1px solid var(--hairline);
        }
      }
      .fine {
        margin: 0.3rem 0 0.8rem;
      }
      .challenge-note {
        border: 1px solid var(--gold);
        background: color-mix(in srgb, var(--gold) 9%, var(--panel));
        padding: 0.6rem 0.7rem;
        font-size: var(--type-body-sm);
        margin: 0.6rem 0 0.2rem;
        strong {
          display: block;
        }
        &.idle {
          border-color: var(--hairline);
          background: var(--panel-2);
          color: var(--ink-dim);
        }
      }
      input.otp {
        font-size: 1.4rem;
        letter-spacing: 0.9em;
        text-align: center;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        padding-left: 1.2rem;
      }
      .field-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
      }
      .forgot-link {
        font-size: var(--type-label-sm);
        letter-spacing: 0.08em;
      }
      .pw-wrap {
        display: block;
        position: relative;
        input {
          padding-right: 4.4rem;
        }
        .pw-toggle {
          position: absolute;
          top: 50%;
          right: 0.4rem;
          transform: translateY(-50%);
          min-width: 44px;
          min-height: 34px;
          padding: 0 0.6rem;
          border: 1px solid var(--hairline);
          background: var(--panel);
          color: var(--ink-dim);
          border-radius: var(--radius-pill);
          cursor: pointer;
          font-family: inherit;
          font-size: var(--type-label-sm);
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          &:hover {
            color: var(--acid-ink);
            border-color: var(--gold);
          }
          &:disabled {
            opacity: 0.5;
            cursor: default;
          }
        }
      }
      .auth-info {
        margin: 0.6rem 0 0;
        padding: 0.5rem 0.7rem;
        font-size: var(--type-body-sm);
        color: var(--ok);
        border: 1px solid var(--ok);
        background: color-mix(in srgb, var(--ok) 8%, var(--panel));
      }
      .auth-kpis .kpi-value.sm {
        font-size: 0.95rem;
      }
      .auth-footer {
        margin-top: auto;
        padding: 1.2rem 1rem;
        /* --photo-line, not --hairline: this rule sits on the photograph, and
           the hairline is near-invisible against it in both themes. */
        border-top: 1px solid var(--photo-line);
        text-align: center;
        color: var(--ink-dim);
        font-size: var(--type-label-sm);
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
    `,
  ],
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

  email = '';
  password = '';
  code = '';

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
