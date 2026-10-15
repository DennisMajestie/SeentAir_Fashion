import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeConfirmService,
  SeIconComponent,
  SeShellComponent,
  SeShellMenuItemDirective,
  SeSkeletonComponent,
  SeToastService,
} from '@seentair/ui';
import { AppSearchComponent } from './app-search.component';
import { AppOpsbarComponent } from './app-opsbar.component';
import { AccessService } from './access.service';
import { ApiService, Me } from './api.service';
import { navFor } from './nav';
import { ThemeService } from './theme.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
    AppSearchComponent,
    AppOpsbarComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeIconComponent,
    SeShellComponent,
    SeShellMenuItemDirective,
    SeSkeletonComponent,
  ],
  template: `
    @if (!api.isLoggedIn) {
      <div class="auth-screen">
        <header class="auth-head" [class.scrolled]="scrolled()">
          <div class="auth-head-inner">
            <span class="logo">
              <img class="auth-logo" src="assets/logo.png" alt="SEENTAIR" width="160" height="32" />
            </span>
            <div class="header-actions">
              <button
                class="theme-toggle login-theme-toggle"
                type="button"
                [attr.aria-label]="
                  theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
                "
                [attr.title]="theme.theme() === 'dark' ? 'Light mode' : 'Dark mode'"
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
                    focusable="false"
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
                    focusable="false"
                  >
                    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                  </svg>
                }
              </button>
            </div>
          </div>
        </header>
        <!--
          Split card, matching the storefront and the two portals: a branded
          half beside the form half. Named .auth-split rather than .auth-card
          because .auth-card is the form inside it.
          All three modes -- reset, sign-in and the 2FA challenge -- are
          untouched and simply sit inside the form half.
        -->
        <div class="auth-split">
          @if (isDesktop()) {
            <aside class="auth-brand" aria-hidden="true">
              <span class="auth-brand__cloud auth-brand__cloud--a"></span>
              <span class="auth-brand__cloud auth-brand__cloud--b"></span>
              <span class="auth-brand__cloud auth-brand__cloud--c"></span>
              <div class="auth-brand__copy">
                <p class="auth-brand__hello">WELCOME</p>
                <p class="auth-brand__name">SEENTAIR</p>
                <p class="auth-brand__lede">Staff access to the ops terminal.</p>
              </div>
              <!-- Brand-tinted discs: this app ships no product photography. -->
              <span class="auth-brand__photo auth-brand__photo--seam"></span>
              <span class="auth-brand__photo auth-brand__photo--corner"></span>
              <span class="auth-brand__dot"></span>
            </aside>
          }
          <section class="auth-panel">
          @if (!challengeToken() && resetMode()) {
            <div class="auth-wrap">
              <form
                class="auth-card"
                (ngSubmit)="resetSent() ? submitReset() : sendForgot()"
                novalidate
              >
                <p class="eyebrow">Staff access</p>
                <h1>Reset password.</h1>
                <p class="subtext">
                  {{
                    resetSent()
                      ? 'Enter the token from your email plus a new password.'
                      : 'We will send a 64-character reset token to your inbox.'
                  }}
                </p>

                @if (!resetSent()) {
                  <label class="field">
                    <span class="field-label">Email</span>
                    <input
                      type="email"
                      [(ngModel)]="email"
                      name="remail"
                      placeholder="you@seentair.ng"
                      autocomplete="email"
                      required
                    />
                    @if (errors().email) {
                      <span class="field-err">{{ errors().email }}</span>
                    }
                  </label>
                } @else {
                  <label class="field">
                    <span class="field-label">Reset token</span>
                    <input
                      class="mono"
                      [(ngModel)]="resetToken"
                      name="rtoken"
                      placeholder="64 hex chars from the email"
                      required
                    />
                  </label>
                  <label class="field">
                    <span class="field-label">New password</span>
                    <input
                      [type]="showPassword ? 'text' : 'password'"
                      [(ngModel)]="newPassword"
                      name="rpass"
                      placeholder="at least 8 characters"
                      autocomplete="new-password"
                      required
                    />
                  </label>
                  <label class="field">
                    <span class="field-label">Confirm new password</span>
                    <input
                      [type]="showPassword ? 'text' : 'password'"
                      [(ngModel)]="newPassword2"
                      name="rpass2"
                      placeholder="repeat it"
                      autocomplete="new-password"
                      required
                    />
                  </label>
                }

                <button class="cta signin" type="submit" [disabled]="loading()">
                  {{
                    loading() ? 'Working…' : resetSent() ? 'Set new password' : 'Send reset token →'
                  }}
                </button>
                <button class="link" type="button" (click)="backToSignin()">Back to sign in</button>
                @if (formError()) {
                  <p class="field-err form-err">{{ formError() }}</p>
                }
                @if (resetMsg()) {
                  <p class="success">{{ resetMsg() }}</p>
                }
              </form>
            </div>
          } @else if (!challengeToken()) {
            <div class="auth-wrap">
              <form class="auth-card" (ngSubmit)="onSubmit()" novalidate>
                <p class="eyebrow">Staff access</p>
                <h1>Welcome back.</h1>
                <p class="subtext">Sign in to run the drop.</p>

                <label class="field">
                  <span class="field-label">Email</span>
                  <input
                    type="email"
                    [(ngModel)]="email"
                    name="email"
                    placeholder="you@seentair.ng"
                    autocomplete="email"
                    required
                  />
                  @if (errors().email) {
                    <span class="field-err">{{ errors().email }}</span>
                  }
                </label>

                <label class="field">
                  <span class="field-label">
                    Password
                    <button type="button" class="forgot" (click)="forgot()">Forgot?</button>
                  </span>
                  <span class="pw-wrap">
                    <input
                      [type]="showPassword ? 'text' : 'password'"
                      [(ngModel)]="password"
                      name="password"
                      autocomplete="current-password"
                      required
                    />
                    <button type="button" class="pw-toggle" (click)="showPassword = !showPassword">
                      {{ showPassword ? 'Hide' : 'Show' }}
                    </button>
                  </span>
                  @if (errors().password) {
                    <span class="field-err">{{ errors().password }}</span>
                  }
                </label>

                <label class="check">
                  <input type="checkbox" [(ngModel)]="rememberMe" name="remember" />
                  <span>Keep me signed in</span>
                </label>

                <button
                  class="cta signin"
                  type="submit"
                  [disabled]="loading()"
                  [class.shake]="shake()"
                >
                  @if (loading()) {
                    <span class="spinner" aria-hidden="true"></span>
                    Signing in…
                  } @else if (success()) {
                    ✓ Signed in
                  } @else {
                    Sign in →
                  }
                </button>
                @if (formError()) {
                  <p class="field-err form-err">{{ formError() }}</p>
                }
                <p class="auth-fine">Secured connection. Authorised users only.</p>
              </form>
            </div>
          } @else {
            <div class="auth-wrap">
              <form class="auth-card auth-card-narrow" (ngSubmit)="submitCode()" novalidate>
                <p class="eyebrow">Two-factor check</p>
                <h1>Verify it's you.</h1>
                <p class="subtext">Enter the 6-digit code from your authenticator app.</p>

                <label class="field">
                  <span class="field-label">Code</span>
                  <input
                    [(ngModel)]="code"
                    name="code"
                    inputmode="numeric"
                    maxlength="6"
                    placeholder="000000"
                    autocomplete="one-time-code"
                    required
                  />
                </label>

                <button class="cta signin" type="submit">Verify</button>
                <button class="link" type="button" (click)="challengeToken.set(null)">Back</button>
                @if (error()) {
                  <p class="field-err form-err">{{ error() }}</p>
                }
              </form>
            </div>
          }
          </section>
        </div>
      </div>
    } @else {
      <se-shell
        appName="Seentair Ops"
        logo="assets/logo.png"
        [nav]="nav()"
        [user]="shellUser()"
        [(collapsed)]="collapsed"
        (signOut)="logout()"
      >
        <app-search seShellSearch />
        <app-opsbar seShellActions />
        <button
          seButton
          variant="ghost"
          iconOnly
          seShellActions
          type="button"
          [attr.aria-label]="
            theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          "
          (click)="theme.toggle()"
        >
          <se-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
        </button>
        <!-- The other Seentair apps, for staff who need to see what a customer
             or a wholesale buyer sees. They open in a new tab. -->
        <a seShellMenu [href]="environment.storefrontUrl" target="_blank" rel="noopener noreferrer">
          Open the storefront
        </a>
        <a seShellMenu [href]="environment.wholesaleUrl" target="_blank" rel="noopener noreferrer">
          Open the wholesale portal
        </a>
        <a seShellMenu [href]="environment.partnerUrl" target="_blank" rel="noopener noreferrer">
          Open the partner portal
        </a>
        <!-- Screens are held back until the profile has loaded, so every one
             of them can rely on knowing what this role may see and do. -->
        @if (me()) {
          <router-outlet />
        } @else if (profileFailed()) {
          <se-banner
            tone="danger"
            title="Your profile could not be loaded"
            actionLabel="Try again"
            (action)="loadMe()"
          >
            The server did not respond, so the app cannot tell what you have access to yet.
          </se-banner>
        } @else {
          <se-skeleton shape="detail" [rows]="4" aria-busy="true" />
        }
      </se-shell>
    }
  `,
  styles: [
    `
      /*
       * Split-card sign-in, matching the storefront and the two portals.
       *
       * On the component rather than in styles.scss because :host-scoped
       * selectors outrank the global .auth-screen / .auth-head rules that
       * described the old photo-overlay layout, and because none of this applies
       * to the signed-in ops shell.
       */

      /* The old screen sat on a full-bleed photograph behind a three-layer
         scrim. The surface is now the canvas. */
      :host .auth-screen {
        display: block;
        min-height: 0;
        padding: 0;
        background-image: none;
        background-color: var(--obsidian);
        color: var(--ink, #1b1c19);
      }
      :host .auth-screen::before {
        display: none;
      }

      /* ---------- the bar: a copy of the storefront's site header ---------- */
      :host .auth-head {
        position: sticky;
        top: 0;
        z-index: 30;
        background: var(--panel);
        border-bottom: 1px solid var(--hairline-2);
        transition: none;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      :host .auth-head.scrolled {
        border-bottom-color: var(--hairline-2);
      }
      :host .auth-head-inner {
        max-width: 1280px;
        margin-inline: auto;
        padding: 14px clamp(20px, 4vw, 56px);
        padding-top: calc(14px + env(safe-area-inset-top, 0px));
      }

      /* ---------- the card ---------- */
      :host .auth-split {
        display: grid;
        grid-template-columns: 1fr;
        /* Explicit width: app-root is display:inline, so without it the grid is
           shrink-to-fit sized rather than filling and capped at max-width. */
        width: 100%;
        max-width: 1000px;
        margin: 0 auto;
        padding: clamp(1.2rem, 4vw, 2.4rem) clamp(16px, 4vw, 24px) 3rem;
        /* stretch, not start: the two halves must be the same height. */
        align-items: stretch;
        /* Clips the corner disc at the card's edge, the way the storefront and
           the portals do. */
        overflow: hidden;
        border-radius: 28px;
      }
      :host .auth-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: var(--panel);
        border-radius: 28px;
        padding: 40px 44px 34px;
        box-shadow:
          0 30px 70px -22px rgb(0 0 0 / 0.24),
          0 8px 24px -14px rgb(0 0 0 / 0.14);
      }

      /* ---------- branded half ---------- */
      /* No overflow:hidden: the seam disc overhangs onto the form half, and the
         card is what clips at its rounded edge. */
      :host .auth-brand {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 36px;
        background: linear-gradient(160deg, #1f1a14 0%, #14110e 55%, #100d0b 100%);
        color: #fff;
        border-radius: 28px 0 0 28px;
      }
      :host .auth-brand__cloud {
        position: absolute;
        border-radius: 50%;
        filter: blur(26px);
        pointer-events: none;
      }
      :host .auth-brand__cloud--a {
        width: 210px;
        height: 150px;
        top: -46px;
        left: -34px;
        background: rgb(255 255 255 / 0.07);
      }
      :host .auth-brand__cloud--b {
        width: 180px;
        height: 130px;
        top: 26px;
        right: -56px;
        background: rgb(201 162 75 / 0.12);
      }
      :host .auth-brand__cloud--c {
        width: 200px;
        height: 140px;
        top: 118px;
        left: 52px;
        background: rgb(255 255 255 / 0.045);
      }
      :host .auth-brand__copy {
        position: relative;
        z-index: 2;
      }
      :host .auth-brand__hello {
        margin: 0;
        font-size: clamp(2.4rem, 5.2vw, 3.5rem);
        font-weight: 800;
        line-height: 0.9;
        color: #fff;
        text-shadow: 0 10px 30px rgb(0 0 0 / 0.45);
      }
      :host .auth-brand__name {
        margin: 0.6rem 0 0;
        font-size: 1.125rem;
        font-weight: 700;
        letter-spacing: 0.25em;
        text-transform: uppercase;
        color: #c9a24b;
      }
      /* Narrower than the copy block so the sentence can never run under the
         seam disc, whatever the panel width does. */
      :host .auth-brand__lede {
        margin: 0.85rem 0 0;
        max-width: 240px;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: rgb(255 255 255 / 0.78);
      }
      /* Brand-tinted discs: the ops app ships no product photography, and none
         may be generated. */
      :host .auth-brand__photo {
        position: absolute;
        z-index: 3;
        border-radius: 50%;
        box-shadow: 0 18px 44px -12px rgb(0 0 0 / 0.6);
      }
      :host .auth-brand__photo--seam {
        width: 152px;
        height: 152px;
        right: -76px;
        top: 40%;
        transform: translateY(-50%);
        border: 3px solid rgb(255 255 255 / 0.85);
        background:
          radial-gradient(circle at 32% 28%, rgb(240 220 174 / 0.9), rgb(201 162 75 / 0.25) 60%),
          linear-gradient(150deg, #2e2718, #14110e);
      }
      :host .auth-brand__photo--corner {
        width: 198px;
        height: 198px;
        left: -66px;
        bottom: -74px;
        border: 3px solid rgb(255 255 255 / 0.22);
        background:
          radial-gradient(circle at 38% 32%, rgb(255 255 255 / 0.16), transparent 58%),
          linear-gradient(150deg, #2a2419, #14110e);
      }
      :host .auth-brand__dot {
        position: absolute;
        z-index: 1;
        left: 44%;
        bottom: 28px;
        width: 106px;
        height: 106px;
        border-radius: 50%;
        background: rgb(255 255 255 / 0.12);
      }

      /* ---------- the forms inside the form half ---------- */
      :host .auth-panel .auth-wrap {
        width: 100%;
        max-width: 360px;
      }
      :host .auth-panel .auth-card {
        background: none;
        border: 0;
        padding: 0;
        text-align: center;
      }
      :host .auth-panel .auth-card input {
        height: 48px;
        border-radius: 14px;
        background: var(--panel-2);
        border: 1px solid transparent;
        padding-inline: 44px 16px;
      }
      :host .auth-panel .auth-card input:focus-visible {
        outline: 2px solid var(--acid-ink);
        outline-offset: 1px;
      }
      :host .auth-panel .auth-card .pw-wrap input {
        padding-right: 48px;
      }
      :host .auth-panel .auth-card .pw-toggle {
        min-width: 36px;
        min-height: 36px;
        padding: 0;
        border: 0;
        border-radius: 10px;
        background: none;
        cursor: pointer;
      }
      :host .auth-panel .auth-card .pw-toggle:focus-visible {
        outline: 2px solid var(--acid-ink);
        outline-offset: 1px;
      }
      :host .auth-panel .auth-card .cta.signin {
        width: 100%;
        min-height: 48px;
        border-radius: 12px;
        border: 0;
        font-weight: 700;
/* Gold fill with --on-acid, not --ink: --ink flips to near-white in dark mode,
             which would put light ink on gold at about 1.9:1. --on-acid is the
             palette's own "ink on gold" and stays dark in both themes. */
          background: var(--gold);
          color: var(--on-acid);
      }

      /* ---------- breakpoints ---------- */
      /* The split only happens where the branded half is actually rendered, so
         the CSS and the signal that gates the markup agree on the same 900px. */
      @media (min-width: 900px) {
        :host .auth-split {
          grid-template-columns: 46% 54%;
        }
        :host .auth-panel {
          border-radius: 0 28px 28px 0;
        }
      }
      @media (max-width: 1100px) {
        :host .auth-brand {
          padding: 30px;
        }
        :host .auth-brand__photo--seam {
          width: 124px;
          height: 124px;
          right: -62px;
        }
        :host .auth-brand__photo--corner {
          width: 160px;
          height: 160px;
          left: -54px;
          bottom: -60px;
        }
        :host .auth-brand__dot {
          width: 88px;
          height: 88px;
        }
        :host .auth-panel {
          padding: 34px 30px 28px;
        }
      }
      @media (max-width: 899px) {
        :host .auth-panel {
          padding: 24px;
          border-radius: 28px;
        }
      }
    `,
  ],
})
export class App implements OnInit, OnDestroy {
  readonly api = inject(ApiService);
  readonly theme = inject(ThemeService);
  readonly environment = environment;
  private readonly onScroll = () => {
    this.scrolled.set((window.scrollY ?? 0) > 10);
  };
  readonly scrolled = signal(false);
  /** Desktop-only gate for the branded half of the sign-in split card. Declared
   *  here because this app has no shared ViewportService, and the four frontends
   *  have independent node_modules. */
  readonly isDesktop = signal(false);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly accessService = inject(AccessService);
  /** The signed-in person; shared with every screen through AccessService. */
  readonly me = this.accessService.me;
  readonly collapsed = signal(false);
  /** The profile request failed: screens stay held back and a retry is offered. */
  readonly profileFailed = signal(false);
  /** Requests waiting for this person's decision; the Approvals badge. */
  private readonly pendingApprovals = signal(0);
  /** The sidebar for this role: only what the role can open. */
  readonly nav = computed(() =>
    navFor(this.me()?.access ?? null, { approvals: this.pendingApprovals() }),
  );
  readonly shellUser = computed(() => {
    const me = this.me();
    return me ? { name: me.name, role: roleLabel(me.role) } : null;
  });
  readonly error = signal<string | null>(null);
  readonly challengeToken = signal<string | null>(null);

  readonly errors = signal<{ email?: string; password?: string }>({});
  readonly formError = signal<string | null>(null);
  readonly loading = signal(false);
  readonly success = signal(false);
  readonly shake = signal(false);

  email = '';
  password = '';
  code = '';
  rememberMe = false;
  showPassword = false;
  readonly resetMode = signal(false);
  readonly resetSent = signal(false);
  readonly resetMsg = signal<string | null>(null);
  resetToken = '';
  newPassword = '';
  newPassword2 = '';

  private readonly emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      this.onScroll();
      window.addEventListener('scroll', this.onScroll, { passive: true });
      const mql = window.matchMedia('(min-width: 900px)');
      this.isDesktop.set(mql.matches);
      mql.addEventListener('change', (e) => this.isDesktop.set(e.matches));
    }
    if (this.api.isLoggedIn) this.loadMe();
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
  }

  onSubmit(): void {
    this.errors.set({});
    this.formError.set(null);

    const email = this.email.trim();
    const password = this.password;

    const invalid: { email?: string; password?: string } = {};
    if (!this.emailRe.test(email)) invalid.email = 'Enter a valid email address.';
    if (password.length < 6) invalid.password = 'Password must be at least 6 characters.';

    if (invalid.email || invalid.password) {
      this.errors.set(invalid);
      this.triggerShake();
      return;
    }

    this.loading.set(true);
    this.success.set(false);
    this.api.login(email, password).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.success.set(true);
        // Token storage is handled by ApiService (in memory + httpOnly cookie).
        if (!res.requires2fa) this.loadMe();
        if (res.requires2fa && res.challengeToken) {
          this.challengeToken.set(res.challengeToken);
          this.password = '';
          this.success.set(false);
        }
      },
      error: () => {
        this.loading.set(false);
        this.formError.set('Sign-in failed: staff accounts only.');
        this.triggerShake();
      },
    });
  }

  submitCode(): void {
    const token = this.challengeToken();
    if (!token) return;
    this.error.set(null);
    this.api.verify2fa(token, this.code).subscribe({
      next: () => {
        this.challengeToken.set(null);
        this.code = '';
        this.loadMe();
      },
      error: () => {
        this.error.set('Incorrect or expired code.');
        this.triggerShake();
      },
    });
  }

  async logout(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Sign out of Seentair Ops?',
      consequence: 'Anything waiting for your approval stays in the queue for your next session.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay signed in',
    });
    if (!ok) return;
    this.me.set(null);
    this.api.logout();
    this.toast.show('Signed out');
  }

  /** Real name/role for the sidebar account footer, from the auth session. */
  loadMe(): void {
    this.me.set(null);
    this.profileFailed.set(false);
    this.api.me().subscribe({
      next: (profile) => {
        this.me.set(profile);
        this.loadApprovalCount(profile);
      },
      error: () => {
        this.me.set(null);
        this.profileFailed.set(true);
      },
    });
  }

  /** The Approvals badge, only for a role that can decide requests. */
  private loadApprovalCount(profile: Me): void {
    const level = profile.access?.['approvals_audit'];
    if (level !== 'approve' && level !== 'full') return;
    this.api.pendingApprovals().subscribe({
      next: (rows) => this.pendingApprovals.set(rows.length),
      error: () => this.pendingApprovals.set(0),
    });
  }

  forgot(): void {
    this.resetMode.set(true);
    this.resetSent.set(false);
    this.resetToken = '';
    this.newPassword = '';
    this.newPassword2 = '';
    this.formError.set(null);
    this.resetMsg.set(null);
    this.errors.set({});
  }

  backToSignin(): void {
    this.resetMode.set(false);
    this.resetSent.set(false);
    this.formError.set(null);
    this.resetMsg.set(null);
    this.errors.set({});
  }

  sendForgot(): void {
    const email = this.email.trim();
    if (!this.emailRe.test(email)) {
      this.errors.set({ email: 'Enter a valid email address.' });
      this.triggerShake();
      return;
    }
    this.errors.set({});
    this.loading.set(true);
    this.api.forgotPassword(email).subscribe({
      next: () => this.confirmTokenSent(),
      error: () => this.confirmTokenSent(),
    });
  }

  private confirmTokenSent(): void {
    this.loading.set(false);
    this.resetSent.set(true);
    this.resetMsg.set(
      'If that email exists, a reset token is on its way, check your inbox (and spam).',
    );
  }

  submitReset(): void {
    const token = this.resetToken.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(token)) {
      this.formError.set('The token is a 64-character hex string from the email.');
      return;
    }
    if (this.newPassword.length < 8) {
      this.formError.set('New password must be at least 8 characters.');
      return;
    }
    if (this.newPassword !== this.newPassword2) {
      this.formError.set('Passwords do not match.');
      return;
    }
    this.formError.set(null);
    this.loading.set(true);
    this.api.resetPassword(token.toLowerCase(), this.newPassword).subscribe({
      next: () => {
        this.loading.set(false);
        this.resetMsg.set('Password changed: sign in with the new password.');
        this.resetMode.set(false);
        this.resetSent.set(false);
        this.password = '';
        this.resetToken = '';
        this.newPassword = '';
        this.newPassword2 = '';
      },
      error: () => {
        this.loading.set(false);
        this.formError.set('Reset failed: the token may be invalid or already used.');
      },
    });
  }

  private triggerShake(): void {
    this.shake.set(true);
    setTimeout(() => this.shake.set(false), 450);
  }
}

/** "business_owner_admin" -> "Business owner admin". */
function roleLabel(role: string): string {
  const words = role.replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}
