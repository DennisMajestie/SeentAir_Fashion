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
        <section class="auth-col">
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
    } @else {
      <se-shell
        appName="Seentair Ops"
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
})
export class App implements OnInit, OnDestroy {
  readonly api = inject(ApiService);
  readonly theme = inject(ThemeService);
  readonly environment = environment;
  private readonly onScroll = () => {
    this.scrolled.set((window.scrollY ?? 0) > 10);
  };
  readonly scrolled = signal(false);
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
