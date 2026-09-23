import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from './api.service';

/**
 * Wholesale portal shell. Sign-in/side panel mirror the approved
 * Stitch W1 "Sign In & Apply" screen; the chrome follows the
 * Utilitarian Industrial B2B system.
 */
@Component({
  selector: 'app-root',
  imports: [FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="site-header" [class.scrolled]="scrolled()">
      <div class="wrap-col header-inner">
        <a routerLink="/" class="logo" aria-label="SEENTAIR Wholesale">
          <img src="assets/logo.jpeg" alt="SEENTAIR" width="160" height="32" />
        </a>
        @if (api.isLoggedIn) {
          <nav [class.open]="menuOpen()">
            <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="menuOpen.set(false)">Catalogue</a>
            <a routerLink="/invoices" routerLinkActive="active" (click)="menuOpen.set(false)">Invoices</a>
            <a routerLink="/custom" routerLinkActive="active" (click)="menuOpen.set(false)">Custom</a>
            <button class="link" (click)="menuOpen.set(false); logout()">Sign out</button>
          </nav>
          <div class="header-actions">
            <button
              class="menu-toggle"
              [attr.aria-expanded]="menuOpen()"
              aria-label="Toggle menu"
              (click)="toggleMenu()"
            >
              <span></span><span></span><span></span>
            </button>
          </div>
        }
      </div>
    </header>
    <main>
      @if (!api.isLoggedIn) {
        <section class="auth-screen">
          <header class="ws-header">
            <div class="wordmark-row">
              <div class="wordmark">
                <img src="assets/logo.jpeg" alt="SEENTAIR" width="160" height="32" />
                <span class="chip">WHOLESALE PORTAL</span>
              </div>
              <div class="secure">
                <span class="material-symbols-outlined" aria-hidden="true">lock</span>
                <span>B2B Secure</span>
              </div>
            </div>
            <p class="lede">Authorised Retailers &amp; Stockists Only</p>
          </header>

          <div class="auth-card">
            <div class="tagbar">
              <span>Account Authentication</span>
              <span>v2.4.0</span>
            </div>

            <form class="auth-form" (ngSubmit)="signIn()" novalidate>
              <div class="field">
                <label for="ws-email">Business Email</label>
                <input id="ws-email" type="email" [(ngModel)]="email" name="email"
                  autocomplete="email" inputmode="email" placeholder="orders@store.ng"
                  [attr.aria-invalid]="touched() && !emailValid() ? 'true' : null" />
                @if (touched() && !emailValid()) {
                  <p class="field-error">Enter a valid email address.</p>
                }
              </div>

              <div class="field">
                <div class="label-row">
                  <label for="ws-password">Account Password</label>
                  <button class="link-inline" type="button" (click)="forgot()">Forgot?</button>
                </div>
                <div class="input-affix">
                  <input id="ws-password" [type]="showPassword() ? 'text' : 'password'"
                    [(ngModel)]="password" name="password" autocomplete="current-password"
                    placeholder="••••••••••••" />
                  <button class="affix-btn" type="button"
                    [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                    (click)="showPassword.set(!showPassword())">
                    {{ showPassword() ? 'HIDE' : 'SHOW' }}
                  </button>
                </div>
                @if (touched() && !password) {
                  <p class="field-error">Enter your password.</p>
                }
              </div>

              <button class="cta auth-submit" type="submit" [disabled]="busy()">
                <span>{{ busy() ? 'Signing in…' : 'Sign In to Wholesale' }}</span>
                <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
              </button>

              @if (error()) { <p class="auth-error" role="alert">{{ error() }}</p> }
              @if (info()) { <p class="auth-info" role="status">{{ info() }}</p> }
            </form>

            <div class="auth-utilities">
              <button class="link-inline" (click)="forgot()">Forgot password?</button>
              <span class="muted small">|</span>
              <button class="link-inline" (click)="info.set('Support desk is reached on +234 1 888 7400 during operational hours.')">Trouble logging in?</button>
            </div>
            <p class="auth-desk">Direct desk: Yaba Desk +234 1 888 7400</p>
          </div>

          <div class="apply-panel">
            <div class="apply-head">
              <h2 class="muted" style="font-size: var(--type-label-md); letter-spacing: 0.08em;">Not a wholesale buyer yet?</h2>
              <span class="chip">B2B Criteria</span>
            </div>
            <p class="small muted" style="font-size: var(--type-body-md); line-height: 1.55;">
              Access is strictly reserved for fashion retailers, streetwear boutiques and verified
              merchandise operators procuring in bulk quantities direct from our Lagos factory floor.
            </p>
            <div class="criteria">
              <div class="crit"><span class="n">01</span><div class="txt">
                <span class="t">Minimum Batch Size</span>
                <span class="d">Strict minimum order quantity (MOQ) of 20 units per silhouette.</span></div></div>
              <div class="crit"><span class="n">02</span><div class="txt">
                <span class="t">Tiered Manufacturer Rates</span>
                <span class="d">Live production pricing calibrated directly in Nigerian Naira (&#8358;).</span></div></div>
              <div class="crit"><span class="n">03</span><div class="txt">
                <span class="t">CAC &amp; Corporate Verification</span>
                <span class="d">Requires valid Corporate Affairs Commission (CAC) business credentials.</span></div></div>
              <div class="crit"><span class="n">04</span><div class="txt">
                <span class="t">Dedicated Freight &amp; Logistics</span>
                <span class="d">Priority dispatched via intra-state dispatch &amp; interstate haulage routes.</span></div></div>
            </div>
            <button class="cta outline" type="button" (click)="info.set('Sign in above, then use \u201CApply for a wholesale account\u201D in the catalogue to submit your application.')">
              <span>Apply for Wholesale Access</span>
              <span class="material-symbols-outlined" aria-hidden="true">assignment_ind</span>
            </button>
            <span class="small muted" style="text-align: center;">Applications typically vetted within 24 operational hours</span>
          </div>

          <div class="status-strip">
            <div style="display: flex; align-items: center; gap: var(--space-sm);">
              <span class="dot"></span><span>Yaba Mill Status: Online</span>
            </div>
            <span class="run">RUN 04 // 420GSM FLEECE READY</span>
          </div>

          <footer class="auth-footer">
            <p class="legal">Seentair Garments Nigeria Ltd. Yaba, Lagos. Strictly B2B.</p>
            <p class="sub">All industrial pattern rights and batch allocations reserved. Orders processed in Nigerian Naira (&#8358;).</p>
          </footer>
        </section>
      } @else {
        <router-outlet />
      }
    </main>
  `,
})
export class App implements OnDestroy {
  readonly api = inject(ApiService);
  private readonly onScroll = () => {
    this.scrolled.set((window.scrollY ?? 0) > 10);
  };
  readonly scrolled = signal(false);
  readonly menuOpen = signal(false);

  constructor() {
    if (typeof window !== 'undefined') {
      this.onScroll();
      window.addEventListener('scroll', this.onScroll, { passive: true });
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
  }

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly busy = signal(false);
  readonly touched = signal(false);
  email = '';
  password = '';

  emailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  signIn(): void {
    this.touched.set(true);
    this.error.set(null);
    this.info.set(null);
    if (!this.emailValid() || !this.password) return;

    this.busy.set(true);
    this.api.login(this.email.trim(), this.password).subscribe({
      next: () => {
        this.busy.set(false);
        this.password = '';
        this.touched.set(false);
        this.error.set(null);
      },
      error: (e: { status?: number }) => {
        this.busy.set(false);
        this.error.set(
          e?.status === 429
            ? 'Too many attempts. Wait a minute, then try again.'
            : 'That email and password do not match. Try again, or use Forgot.',
        );
      },
    });
  }

  forgot(): void {
    this.error.set(null);
    this.info.set(null);
    if (!this.emailValid()) {
      this.touched.set(true);
      this.error.set('Enter your email address first, then tap Forgot.');
      return;
    }
    this.api.forgotPassword(this.email.trim()).subscribe({
      next: () => this.info.set('If that email is registered, a reset link has been sent.'),
      error: () => this.info.set('If that email is registered, a reset link has been sent.'),
    });
  }

  logout(): void {
    this.api.logout();
    this.error.set(null);
    this.info.set(null);
    this.password = '';
    this.showPassword.set(false);
  }
}