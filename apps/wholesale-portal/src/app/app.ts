import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from './api.service';
import { BrandAlertService } from './brand-alert.service';
import { CartService } from './cart.service';
import { ThemeService } from './theme.service';

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
          <img src="assets/logo.png" alt="SEENTAIR" width="160" height="32" />
        </a>
        @if (api.isLoggedIn) {
          <nav [class.open]="menuOpen()">
            <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="menuOpen.set(false)">Home</a>
            <a routerLink="/catalogue" routerLinkActive="active" (click)="menuOpen.set(false)">Catalogue</a>
            <a routerLink="/orders" routerLinkActive="active" (click)="menuOpen.set(false)">Orders</a>
            <a routerLink="/custom" routerLinkActive="active" (click)="menuOpen.set(false)">Custom</a>
            <button class="link" (click)="menuOpen.set(false); logout()">Sign out</button>
          </nav>
        }
        <div class="header-actions">
          @if (api.isLoggedIn) {
            <a class="theme-toggle" routerLink="/cart" aria-label="Bulk cart" title="Bulk cart"
              style="position: relative; text-decoration: none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <path d="M6 6h15l-1.5 8.5a2 2 0 0 1-2 1.5H8.7a2 2 0 0 1-2-1.6L5 3H2" />
                <circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" />
              </svg>
              @if (cart.units() > 0) {
                <span class="cart-badge">{{ cart.units() }}</span>
              }
            </a>
          }
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
          @if (api.isLoggedIn) {
            <button
              class="menu-toggle"
              [attr.aria-expanded]="menuOpen()"
              aria-label="Toggle menu"
              (click)="toggleMenu()"
            >
              <span></span><span></span><span></span>
            </button>
          }
        </div>
      </div>
    </header>
    <main>
      @if (!api.isLoggedIn) {
        <section class="auth-screen">
          <header class="ws-header">
            <div class="wordmark-row">
              <div class="wordmark">
<img src="assets/logo.png" alt="SEENTAIR" width="160" height="32" />
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
                    {{ showPassword() ? 'Hide' : 'Show' }}
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
            <p class="auth-desk">Direct desk: Aba desk +234 1 888 7400</p>
          </div>

          <div class="apply-panel">
            <div class="apply-head">
              <h2 class="muted">Not a wholesale buyer yet?</h2>
              <span class="chip">B2B Criteria</span>
            </div>
            <p class="small muted apply-copy">
              Access is strictly reserved for fashion retailers, streetwear boutiques and verified
              merchandise operators procuring in bulk quantities direct from our Aba factory floor.
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
            <span class="small muted apply-note">Applications typically vetted within 24 operational hours</span>
          </div>

          <div class="status-strip">
            <div class="status-line">
              <span class="dot"></span><span>Aba Mill Status: Online</span>
            </div>
            <span class="run">RUN 04 // 420GSM FLEECE READY</span>
          </div>

          <footer class="auth-footer">
            <p class="legal">Seentair Garments Nigeria Ltd. Aba, Abia State. Strictly B2B.</p>
            <p class="sub">All industrial pattern rights and batch allocations reserved. Orders processed in Nigerian Naira (&#8358;).</p>
          </footer>
        </section>
      } @else {
        <router-outlet />
      }
    </main>
    @if (api.isLoggedIn) {
      <!-- Mobile footer nav mirrors the approved reference tab bar (W2/W3/W6).
           GAP: the reference's ACCOUNT tab awaits a buyer account/profile module;
           Custom takes its slot so every live surface stays reachable. -->
      <nav class="tabbar" aria-label="Primary">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
          <span class="material-symbols-outlined" aria-hidden="true">grid_view</span>Home</a>
        <a routerLink="/catalogue" routerLinkActive="active">
          <span class="material-symbols-outlined" aria-hidden="true">storefront</span>Catalogue</a>
        <a routerLink="/orders" routerLinkActive="active">
          <span class="material-symbols-outlined" aria-hidden="true">receipt_long</span>Orders</a>
        <a routerLink="/custom" routerLinkActive="active">
          <span class="material-symbols-outlined" aria-hidden="true">design_services</span>Custom</a>
      </nav>
    }
  `,
})
export class App implements OnDestroy {
  readonly api = inject(ApiService);
  readonly cart = inject(CartService);
  readonly theme = inject(ThemeService);
  private readonly alerts = inject(BrandAlertService);
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

  async logout(): Promise<void> {
    const ok = await this.alerts.confirm({
      title: 'Sign out?',
      html: 'End this wholesale session. Open batches stay in your account for the next sign-in.',
      confirm: 'Sign out',
      cancel: 'Stay',
    });
    if (!ok) return;
    this.api.logout();
    this.error.set(null);
    this.info.set(null);
    this.password = '';
    this.showPassword.set(false);
    void this.alerts.toast('Signed out of the wholesale portal');
  }
}