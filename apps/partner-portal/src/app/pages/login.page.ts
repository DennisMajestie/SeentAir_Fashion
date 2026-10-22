import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-shell">
      <header class="auth-topstrip">
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
        <div class="auth-card">
          <!--
            Branded half. Gated on a signal rather than a media query because
            the seam photo is an image: display:none does not stop a fetch, so a
            CSS-only hide would pull ~107 kB onto every phone for something it
            never shows.
          -->
          @if (isDesktop()) {
            <aside class="auth-brand" aria-hidden="true">
              <span class="auth-brand__cloud auth-brand__cloud--a"></span>
              <span class="auth-brand__cloud auth-brand__cloud--b"></span>
              <span class="auth-brand__cloud auth-brand__cloud--c"></span>

              <div class="auth-brand__copy">
                <p class="auth-brand__hello">WELCOME</p>
                <p class="auth-brand__name">SEENTAIR</p>
                <p class="auth-brand__lede">Sign in to your partner account.</p>
              </div>

              <!-- The photograph this screen used to run full-bleed, reused in
                   place as the seam circle. -->
              <img
                class="auth-brand__photo auth-brand__photo--seam"
                src="assets/form-bg.jpg"
                alt=""
                decoding="async"
              />
              <!-- No second photograph exists in this app, so the corner circle
                   is a brand-tinted disc rather than a repeated crop of the
                   same image. -->
              <span class="auth-brand__photo auth-brand__photo--corner"></span>
              <span class="auth-brand__dot"></span>
            </aside>
          }

          <div class="auth-panel">
            <h1 class="auth-heading">Partner Portal Login</h1>

           
            <p class="auth-sub">Access the institutional investor terminal</p>
 <!-- <h1 class="auth-heading">Partners Portal</h1> -->
            <div class="auth-forms">
              <form class="phase" (ngSubmit)="signIn()" [class.dimmed]="phase() === 2">
                <label class="auth-field">
                  <span class="auth-sr">Email</span>
                  <span class="auth-input">
                    <svg class="auth-input__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <input
                      type="email"
                      name="email"
                      [(ngModel)]="email"
                      required
                      autocomplete="email"
                      placeholder="you@partner.com"
                      [disabled]="phase() === 2"
                    />
                  </span>
                </label>

                <label class="auth-field">
                  <span class="auth-field__row">
                    <span class="auth-sr">Password</span>
                    <button class="link forgot-link" type="button" (click)="forgot()">
                      Forgot Password?
                    </button>
                  </span>
                  <span class="pw-wrap">
                    <span class="auth-input">
                      <svg class="auth-input__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <input
                        [type]="showPassword() ? 'text' : 'password'"
                        name="password"
                        [(ngModel)]="password"
                        required
                        autocomplete="current-password"
                        placeholder="Password"
                        [disabled]="phase() === 2"
                      />
                    </span>
                    <button
                      class="pw-toggle"
                      type="button"
                      [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                      [attr.aria-pressed]="showPassword()"
                      (click)="showPassword.set(!showPassword())"
                      [disabled]="phase() === 2"
                    >
                      @if (showPassword()) {
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M9.9 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 6 10 6a17 17 0 0 1-2.3 3.2M6.3 6.4A17 17 0 0 0 2 11s3.6 6 10 6c1.5 0 2.9-.4 4.1-1" />
                          <path d="M9.9 9.9a3 3 0 1 1 4.2 4.2" />
                          <path d="M2 2l20 20" />
                        </svg>
                      } @else {
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M2 11s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
                          <circle cx="12" cy="11" r="3" />
                        </svg>
                      }
                    </button>
                  </span>
                </label>

                <p class="fine">Authorised users only.</p>

                <button class="cta block auth-submit" type="submit" [disabled]="busy() || phase() === 2">
                  @if (busy() && phase() === 1) {
                    Signing in…
                  } @else {
                    Sign in
                  }
                </button>

                @if (phase() === 1 && error()) {
                  <p class="error auth-error" role="alert">{{ error() }}</p>
                }
                @if (phase() === 1 && info()) {
                  <p class="auth-info" role="status">{{ info() }}</p>
                }
              </form>

              <form class="phase phase-2" (ngSubmit)="verify()" [class.dimmed]="phase() === 1">
                <p class="eyebrow">Two-factor check</p>
                <h2>Verify it's you.</h2>
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
                <label class="auth-field">
                  <span class="auth-sr">Code</span>
                  <span class="auth-input">
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
                  </span>
                </label>
                <button
                  class="cta block auth-submit"
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
                    <p class="error auth-error" role="alert">{{ error() }}</p>
                  }
                }
              </form>
            </div>
          </div>
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
      /* ---------- page ---------- */
      .auth-shell {
        position: relative;
        min-height: 100vh;
        min-height: 100svh;
        display: flex;
        flex-direction: column;
        background: var(--obsidian);
        color: var(--ink);
      }

      /* The sign-in bar is a copy of the storefront's site header: full-bleed, sticky,
         a theme-following surface, a hairline underneath, the wordmark leading
         and the controls trailing.

         It used to carry max-width + margin-inline:auto, which shrink-wrapped it
         to its content -- it measured 431px wide and centred at 1440, so the bar
         did not span the page at all. The storefront solves this the same way
         its own container does: no cap on the bar itself, and a gutter that
         grows past the content measure on wide screens, so the wordmark still
         lands on the same line as the storefront's. */
      .auth-topstrip {
        position: sticky;
        top: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        padding: 14px clamp(20px, 4vw, 56px);
        /* Same measure as the storefront's .wrap-col: content capped at
           --wrap-max, gutter of --wrap-x outside it. */
        padding-inline: calc(max(0px, (100vw - 1150px) / 2) + clamp(20px, 4vw, 56px));
        padding-top: calc(14px + env(safe-area-inset-top, 0px));
        background: var(--panel);
        border-bottom: 1px solid var(--hairline);
        .term-chip {
          margin-left: auto;
          color: var(--ink-dim);
        }
      }
      .strip-logo {
        display: block;
        line-height: 0;
        flex: none;
        img {
          display: block;
          /* 50px, aligned across all four apps. */
          height: 50px;
          width: auto;
        }
      }

      .auth-main {
        width: 100%;
        max-width: 1040px;
        margin: 0 auto;
        padding: clamp(1.2rem, 4vw, 2.6rem) 1rem 2.4rem;
      }

      /* ---------- card ---------- */
      .auth-card {
        display: grid;
        grid-template-columns: 1fr;
        border-radius: 28px;
        overflow: hidden;
        background: var(--panel);
        box-shadow:
          0 30px 70px -22px rgb(0 0 0 / 0.34),
          0 8px 24px -14px rgb(0 0 0 / 0.2);
      }

      /* ---------- branded half ---------- */
      /* Brand dark in both themes. This half is decoration, so it keeps its own
         palette rather than following --panel, exactly like a hero. No
         overflow:hidden: the seam photo is meant to overhang onto the form
         half, and the card is what clips at its rounded edge. */
      .auth-brand {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 36px;
        background: linear-gradient(160deg, #1f1a14 0%, #14110e 55%, #100d0b 100%);
        color: #fff;
      }

      .auth-brand__cloud {
        position: absolute;
        border-radius: 50%;
        filter: blur(26px);
        pointer-events: none;
      }
      .auth-brand__cloud--a {
        width: 210px;
        height: 150px;
        top: -46px;
        left: -34px;
        background: rgb(255 255 255 / 0.07);
      }
      .auth-brand__cloud--b {
        width: 180px;
        height: 130px;
        top: 26px;
        right: -56px;
        background: rgb(201 162 75 / 0.12);
      }
      .auth-brand__cloud--c {
        width: 200px;
        height: 140px;
        top: 118px;
        left: 52px;
        background: rgb(255 255 255 / 0.045);
      }

      .auth-brand__copy {
        position: relative;
        z-index: 2;
      }
      .auth-brand__hello {
        margin: 0;
        font-size: clamp(2.4rem, 5.2vw, 3.5rem);
        font-weight: 800;
        line-height: 0.9;
        letter-spacing: 0.01em;
        color: #fff;
        text-shadow: 0 10px 30px rgb(0 0 0 / 0.45);
      }
      .auth-brand__name {
        margin: 0.6rem 0 0;
        font-size: 1.125rem;
        font-weight: 700;
        letter-spacing: 0.25em;
        text-transform: uppercase;
        color: var(--gold);
      }
      /* Narrower than the copy block so the sentence can never run under the
         seam circle, whatever the panel width does. */
      .auth-brand__lede {
        margin: 0.85rem 0 0;
        max-width: 240px;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: rgb(255 255 255 / 0.78);
      }

      .auth-brand__photo {
        position: absolute;
        z-index: 3;
        border-radius: 50%;
        object-fit: cover;
        box-shadow: 0 18px 44px -12px rgb(0 0 0 / 0.6);
      }
      .auth-brand__photo--seam {
        width: 152px;
        height: 152px;
        right: -76px;
        top: 40%;
        transform: translateY(-50%);
        border: 3px solid rgb(255 255 255 / 0.85);
      }
      /* Stand-in for a photograph this app does not have: a brand-tinted disc
         rather than a second crop of the same image. */
      .auth-brand__photo--corner {
        width: 198px;
        height: 198px;
        left: -66px;
        bottom: -74px;
        border: 3px solid rgb(255 255 255 / 0.22);
        background:
          radial-gradient(circle at 34% 30%, rgb(201 162 75 / 0.85), rgb(201 162 75 / 0.1) 62%),
          linear-gradient(150deg, #2a2419, #14110e);
      }
      .auth-brand__dot {
        position: absolute;
        z-index: 1;
        left: 44%;
        bottom: 28px;
        width: 106px;
        height: 106px;
        border-radius: 50%;
        background: rgb(255 255 255 / 0.12);
      }

      /* ---------- form half ---------- */
      .auth-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 40px 48px 30px;
        background: var(--panel);
      }
      .auth-logo {
        display: block;
        line-height: 0;
      }
      .auth-logo img {
        display: block;
        height: 80px;
        width: auto;
      }
      .auth-heading {
        margin: 1.1rem 0 0;
        font-size: 2rem;
        font-weight: 700;
        line-height: 1.1;
        color: var(--ink);
      }
      .auth-sub {
        margin: 0.35rem 0 0;
        font-size: 0.8125rem;
        color: var(--ink-dim);
        max-width: 34ch;
      }

      .auth-forms {
        width: 100%;
        max-width: 340px;
        margin-top: 1.6rem;
      }
      /* The two phases used to sit side by side inside the old two-column card.
         Stacked, because the form half is only ~500px wide and two inputs
         abreast would be unreadable. The idle two-factor step stays visible
         underneath, still dimmed when inactive, so both steps remain legible. */
      .phase {
        min-width: 0;
      }
      .phase-2 {
        margin-top: 1.6rem;
        padding-top: 1.6rem;
        border-top: 1px solid var(--hairline);
        transition: opacity var(--dur-2, 0.2s) ease;
      }
      .phase.dimmed {
        opacity: 0.55;
      }

      .auth-field {
        display: block;
        margin-bottom: 16px;
        text-align: left;
      }
      .auth-field__row {
        display: flex;
        align-items: baseline;
        justify-content: flex-end;
        margin-bottom: 6px;
        min-height: 1rem;
      }
      /* Labels are in the markup for screen readers; the design shows the
         placeholder inside the field instead. */
      .auth-sr {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      .auth-input {
        position: relative;
        display: block;
      }
      .auth-input__icon {
        position: absolute;
        left: 15px;
        top: 50%;
        transform: translateY(-50%);
        width: 18px;
        height: 18px;
        color: var(--ink-dim);
        pointer-events: none;
      }
      .auth-input input {
        display: block;
        width: 100%;
        height: 48px;
        padding: 0 16px 0 44px;
        font: inherit;
        font-size: 0.9375rem;
        color: var(--ink);
        background: var(--panel-2);
        /* No visible edge at rest; the ring appears on focus. */
        border: 1px solid transparent;
        border-radius: 14px;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease,
          background-color 0.15s ease;
        &::placeholder {
          color: var(--ink-dim);
          opacity: 0.7;
        }
        &:focus-visible {
          outline: 2px solid var(--acid-ink);
          outline-offset: 1px;
        }
        &:disabled {
          opacity: 0.6;
          cursor: default;
        }
      }
      input.otp {
        text-align: center;
        padding-left: 0.6rem;
      }

      .pw-wrap {
        position: relative;
        display: block;
      }
      .pw-wrap input {
        padding-right: 48px;
      }
      .pw-toggle {
        position: absolute;
        top: 50%;
        right: 6px;
        transform: translateY(-50%);
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        padding: 0;
        background: none;
        border: 0;
        border-radius: 10px;
        color: var(--ink-dim);
        cursor: pointer;
        svg {
          width: 18px;
          height: 18px;
        }
        &:hover:not(:disabled) {
          color: var(--ink);
          background: color-mix(in srgb, var(--ink) 6%, transparent);
        }
        &:focus-visible {
          outline: 2px solid var(--acid-ink);
          outline-offset: 1px;
        }
        &:disabled {
          opacity: 0.5;
          cursor: default;
        }
      }

      .forgot-link {
        font-size: 0.78rem;
        font-weight: 700;
      }

      .auth-submit {
        width: 100%;
        height: 48px;
        border-radius: 12px;
        border: 0;
        font-weight: 700;
        /* Gold fill carries the app's ink colour, not white: white on #c9a24b is
           about 2.1:1 and fails AA, while --on-acid on --gold measures 6.9:1. */
        background: var(--gold);
        color: var(--on-acid);
      }
      .auth-submit:disabled {
        background: color-mix(in srgb, var(--gold) 42%, var(--panel-2));
        color: var(--ink-dim);
        cursor: not-allowed;
      }

      .auth-error {
        margin: 12px 0 0;
        padding: 10px 12px;
        border-radius: 12px;
        font-size: 0.8125rem;
        line-height: 1.45;
        text-align: left;
        color: var(--danger);
        background: color-mix(in srgb, var(--danger) 8%, var(--panel));
        border: 1px solid color-mix(in srgb, var(--danger) 34%, transparent);
      }
      .auth-info {
        margin: 12px 0 0;
        text-align: left;
      }

      .phase-2 .eyebrow {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        font-size: var(--type-label-sm);
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--acid-ink);
        margin: 0 0 0.4rem;
      }
      .phase-2 h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--ink);
      }
      .challenge-note {
        border: 1px solid var(--gold);
        background: color-mix(in srgb, var(--gold) 9%, var(--panel));
        padding: 0.6rem 0.7rem;
        font-size: 0.8125rem;
        margin: 0.8rem 0 1rem;
        text-align: left;
        border-radius: 12px;
        strong {
          display: block;
        }
        &.idle {
          border-color: var(--hairline);
          background: var(--panel-2);
          color: var(--ink-dim);
        }
      }
      .phase-2 .fine {
        margin-top: 0.9rem;
      }

      /* ---------- below the card ---------- */
      .auth-kpis {
        margin-top: 2rem;
      }
      .auth-kpis .kpi-value.sm {
        font-size: 0.95rem;
      }
      .auth-footer {
        margin-top: auto;
        padding: 1.2rem 1rem;
        border-top: 1px solid var(--hairline);
        text-align: center;
        color: var(--ink-dim);
        font-size: var(--type-label-sm);
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      /* ---------- breakpoints ---------- */
      /* Split only where the branded half is actually rendered, so the CSS and
         the signal that gates the markup agree on the same 900px. */
      @media (min-width: 900px) {
        .auth-card {
          grid-template-columns: 46% 54%;
        }
      }
      @media (max-width: 1100px) {
        .auth-brand {
          padding: 30px;
        }
        .auth-brand__photo--seam {
          width: 124px;
          height: 124px;
          right: -62px;
        }
        .auth-brand__photo--corner {
          width: 160px;
          height: 160px;
          left: -54px;
          bottom: -60px;
        }
        .auth-brand__dot {
          width: 88px;
          height: 88px;
        }
        .auth-panel {
          padding: 36px 32px 26px;
        }
      }
      @media (max-width: 899px) {
        .auth-panel {
          padding: 24px;
        }
        .auth-logo img {
          height: 52px;
        }
        .auth-forms {
          max-width: 380px;
        }
        .auth-heading {
          font-size: 1.75rem;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .auth-input input,
        .pw-toggle,
        .phase-2 {
          transition: none;
        }
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