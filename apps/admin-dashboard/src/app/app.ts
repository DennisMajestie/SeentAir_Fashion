import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppSearchComponent } from './app-search.component';
import { AppOpsbarComponent } from './app-opsbar.component';
import { ApiService } from './api.service';
import { BrandAlertService } from './brand-alert.service';
import { ThemeService } from './theme.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive, AppSearchComponent, AppOpsbarComponent],
  template: `
    @if (!api.isLoggedIn) {
      <main class="login-shell">
        <button
          class="theme-toggle login-theme-toggle"
          type="button"
          [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
          [attr.title]="theme.theme() === 'dark' ? 'Light mode' : 'Dark mode'"
          (click)="theme.toggle()"
        >
          @if (theme.theme() === 'dark') {
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          } @else {
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          }
        </button>
        <aside class="brand-panel">
          <span class="brand-grid" aria-hidden="true"></span>
          <span class="brand-glow" aria-hidden="true"></span>
          <div class="brand-content">
            <img class="brand-logo" src="assets/logo.jpeg" alt="SEENTAIR Operations" width="160" height="32" />
            <h1 class="brand-headline">Run<br /><span>The drop.</span></h1>
          </div>
          <footer class="brand-foot">
            <span><i class="status-dot" aria-hidden="true"></i> All systems operational</span>
            <span>Drop 004 · Live</span>
            <span class="clock">{{ clock() }}</span>
          </footer>
        </aside>

        <section class="auth-col">
          @if (!challengeToken()) {
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
                  @if (errors().email) { <span class="field-err">{{ errors().email }}</span> }
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
                      placeholder="••••••••"
                      autocomplete="current-password"
                      required
                    />
                    <button type="button" class="pw-toggle" (click)="showPassword = !showPassword">
                      {{ showPassword ? 'Hide' : 'Show' }}
                    </button>
                  </span>
                  @if (errors().password) { <span class="field-err">{{ errors().password }}</span> }
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
                @if (formError()) { <p class="field-err form-err">{{ formError() }}</p> }
              </form>
            </div>
          } @else {
            <div class="auth-wrap">
              <form class="auth-card" (ngSubmit)="submitCode()" novalidate>
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
                @if (error()) { <p class="field-err form-err">{{ error() }}</p> }
              </form>
            </div>
          }
        </section>
      </main>
    } @else {
      <div class="app-shell">
        <header class="site-header" [class.scrolled]="scrolled()">
          <div class="header-inner">
            <app-search />
            <nav class="top-tabs" aria-label="Other Seentair apps">
              <a class="preview-tab" [href]="environment.storefrontUrl" target="_blank" rel="noopener noreferrer">
                <span class="tab-ico" aria-hidden="true">storefront</span>Store<span class="tab-note">Preview</span>
              </a>
              <a class="preview-tab" [href]="environment.wholesaleUrl" target="_blank" rel="noopener noreferrer">
                <span class="tab-ico" aria-hidden="true">inventory_2</span>Wholesale<span class="tab-note">Preview</span>
              </a>
              <a class="preview-tab" [href]="environment.partnerUrl" target="_blank" rel="noopener noreferrer">
                <span class="tab-ico" aria-hidden="true">handshake</span>Partners<span class="tab-note">Preview</span>
              </a>
            </nav>
            <div class="header-actions">
              <app-opsbar />
              <button
                class="theme-toggle"
                type="button"
                [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
                [attr.title]="theme.theme() === 'dark' ? 'Light mode' : 'Dark mode'"
                (click)="theme.toggle()"
              >
                @if (theme.theme() === 'dark') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </svg>
                } @else {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                  </svg>
                }
              </button>
              <button
                class="menu-toggle"
                type="button"
                [attr.aria-expanded]="menuOpen()"
                [attr.aria-controls]="'sidebar'"
                aria-label="Toggle navigation menu"
                (click)="toggleMenu()"
              >
                <span></span><span></span><span></span>
              </button>
            </div>
          </div>
        </header>
        <div class="layout">
          <button
            class="scrim"
            type="button"
            [class.open]="menuOpen()"
            (click)="menuOpen.set(false)"
            aria-hidden="true"
            tabindex="-1"
          ></button>
          <aside id="sidebar" class="sidebar" [class.open]="menuOpen()" aria-label="Operations navigation">
            <a class="sidebar-logo" routerLink="/" (click)="menuOpen.set(false)" aria-label="SEENTAIR Operations">
              <img src="assets/logo.jpeg" alt="SEENTAIR" width="178" height="36" />
            </a>
            <nav>
              <span class="nav-group">Overview</span>
              <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">dashboard</span>Dashboard</a>
              <a routerLink="/approvals" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">fact_check</span>Approvals</a>

              <span class="nav-group">Commerce</span>
              <a routerLink="/orders" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">shopping_bag</span>Orders</a>
              <a routerLink="/returns" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">assignment_return</span>Returns</a>
              <a routerLink="/custom-orders" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">checkroom</span>Custom orders</a>
              <a routerLink="/wholesale" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">warehouse</span>Wholesale</a>
              <a routerLink="/messages" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">forum</span>Messages</a>

              <span class="nav-group">Product</span>
              <a routerLink="/catalogue" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">grid_view</span>Catalogue</a>
              <a routerLink="/inventory" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">inventory_2</span>Inventory</a>
              <a routerLink="/materials" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">layers</span>Materials</a>
              <a routerLink="/production" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">precision_manufacturing</span>Production</a>
              <a routerLink="/tech-pack" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">description</span>Tech pack</a>
              <a routerLink="/floor-kiosk" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">tv</span>Floor kiosk</a>

              <span class="nav-group">Business</span>
              <a routerLink="/accounting" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">account_balance</span>Accounting</a>
              <a routerLink="/logistics" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">local_shipping</span>Logistics</a>
              <a routerLink="/vendors" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">request_quote</span>Procurement</a>
              <a routerLink="/marketing" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">campaign</span>Marketing</a>
              <a routerLink="/reviews" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">reviews</span>Reviews</a>
              <a routerLink="/partners" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">handshake</span>Partners</a>

              <span class="nav-group">Admin</span>
              <a routerLink="/staff" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">badge</span>Staff</a>
              <a routerLink="/audit" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">receipt_long</span>Audit log</a>
              <a routerLink="/security" routerLinkActive="active" (click)="menuOpen.set(false)"><span class="nav-ico" aria-hidden="true">security</span>Security</a>
            </nav>
            <div class="sidebar-foot">
              @if (me(); as profile) {
                <span class="avatar" aria-hidden="true">{{ initials(profile.name) }}</span>
                <span class="who">
                  <strong>{{ profile.name }}</strong>
                  <span>{{ profile.role }}</span>
                </span>
                <button class="link sign-out" type="button" (click)="logout()">Sign out</button>
              } @else {
                <button class="link sign-out" type="button" (click)="logout()">Sign out</button>
              }
            </div>
          </aside>
          <main>
            <router-outlet />
          </main>
        </div>
      </div>
    }
  `,
})
export class App implements OnInit, OnDestroy {
  readonly api = inject(ApiService);
  readonly theme = inject(ThemeService);
  private readonly alerts = inject(BrandAlertService);
  readonly environment = environment;
  private readonly onScroll = () => {
    this.scrolled.set((window.scrollY ?? 0) > 10);
  };
  readonly scrolled = signal(false);
  readonly menuOpen = signal(false);
  readonly me = signal<{ name: string; email: string; role: string; totpEnabled: boolean } | null>(null);
  readonly error = signal<string | null>(null);
  readonly challengeToken = signal<string | null>(null);

  readonly errors = signal<{ email?: string; password?: string }>({});
  readonly formError = signal<string | null>(null);
  readonly loading = signal(false);
  readonly success = signal(false);
  readonly shake = signal(false);
  readonly clock = signal('');

  email = '';
  password = '';
  code = '';
  rememberMe = false;
  showPassword = false;

  private clockTimer?: ReturnType<typeof setInterval>;

  private readonly emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  ngOnInit(): void {
    this.tickClock();
    this.clockTimer = setInterval(() => this.tickClock(), 1000);
    if (typeof window !== 'undefined') {
      this.onScroll();
      window.addEventListener('scroll', this.onScroll, { passive: true });
    }
    if (this.api.isLoggedIn) this.loadMe();
  }

  ngOnDestroy(): void {
    if (this.clockTimer) clearInterval(this.clockTimer);
    window.removeEventListener('scroll', this.onScroll);
  }

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  private tickClock(): void {
    this.clock.set(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Lagos',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date()) + ' WAT',
    );
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
        this.formError.set('Sign-in failed — staff accounts only.');
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
    const ok = await this.alerts.confirm({
      title: 'Sign out?',
      html: 'End this operations-console session. Pending approvals stay queued for the next session.',
      confirm: 'Sign out',
      cancel: 'Stay',
    });
    if (!ok) return;
    this.me.set(null);
    this.api.logout();
    void this.alerts.toast('Signed out of the operations console');
  }

  /** Real name/role for the sidebar account footer — from the auth session. */
  private loadMe(): void {
    this.me.set(null);
    this.api.me().subscribe({
      next: (profile) => this.me.set(profile),
      error: () => this.me.set(null),
    });
  }

  initials(name: string): string {
    const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? '';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (`${a}${b}` || 'SE').toUpperCase();
  }

  forgot(): void {
    // TODO(ops): wire to the real password-reset flow once the backend ships it.
    this.formError.set('Password reset is coming soon — contact a system admin.');
  }

  private triggerShake(): void {
    this.shake.set(true);
    setTimeout(() => this.shake.set(false), 450);
  }
}