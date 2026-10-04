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
    <!-- The sign-in screen renders its own branded header (ws-header), so the
         site chrome is hidden while logged out. Without this the SEENTAIR
         wordmark appeared twice, stacked, above the login form. -->
    @if (api.isLoggedIn) {
      <header class="site-header" [class.scrolled]="scrolled()">
        <div class="wrap-col header-inner">
          <a routerLink="/" class="logo" aria-label="SEENTAIR Wholesale">
            <img src="assets/logo.png" alt="SEENTAIR" width="160" height="32" />
          </a>
          <nav [class.open]="menuOpen()">
            <a
              routerLink="/"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: true }"
              (click)="menuOpen.set(false)"
              >Home</a
            >
            <a routerLink="/catalogue" routerLinkActive="active" (click)="menuOpen.set(false)"
              >Catalogue</a
            >
            <a routerLink="/orders" routerLinkActive="active" (click)="menuOpen.set(false)"
              >Orders</a
            >
            <a routerLink="/custom" routerLinkActive="active" (click)="menuOpen.set(false)"
              >Custom</a
            >
            <button class="link" (click)="menuOpen.set(false); logout()">Sign out</button>
          </nav>
          <div class="header-actions">
            <a
              class="theme-toggle"
              routerLink="/cart"
              aria-label="Bulk cart"
              title="Bulk cart"
              style="position: relative; text-decoration: none"
            >
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
                <path d="M6 6h15l-1.5 8.5a2 2 0 0 1-2 1.5H8.7a2 2 0 0 1-2-1.6L5 3H2" />
                <circle cx="9" cy="20" r="1.4" />
                <circle cx="17" cy="20" r="1.4" />
              </svg>
              @if (cart.units() > 0) {
                <span class="cart-badge">{{ cart.units() }}</span>
              }
            </a>
            <button
              class="theme-toggle"
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
    }
    <main>
      @if (!api.isLoggedIn) {
        <section class="auth-screen">
          <header class="ws-header" [class.scrolled]="scrolled()">
            <div class="wordmark-row">
              <div class="wordmark">
                <img src="assets/logo.png" alt="SEENTAIR" width="160" height="32" />
              </div>
              <!-- The site header is hidden while logged out, so the theme
                   toggle has to live here too or a dark-mode visitor has no
                   way to switch before signing in. -->
              <div class="header-actions">
                <button
                  class="theme-toggle"
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
                <div class="secure">
                  <span class="material-symbols-outlined" aria-hidden="true">lock</span>
                  <span>Secured connection</span>
                </div>
              </div>
            </div>
          </header>

          <div class="auth-card">
            <div class="auth-tagbar"><span>Wholesale buyers</span></div>

            @if (mode() === 'signin') {
              <h1 class="auth-title">Welcome back.</h1>
            } @else {
              <h1 class="auth-title">Apply for wholesale access.</h1>
            }

            @if (mode() === 'signin') {
            <form class="auth-form" (ngSubmit)="signIn()" novalidate>
              <div class="field">
                <label for="ws-email">Email</label>
                <input
                  id="ws-email"
                  type="email"
                  [(ngModel)]="email"
                  name="email"
                  autocomplete="email"
                  inputmode="email"
                  placeholder="orders@store.ng"
                  [attr.aria-invalid]="touched() && !emailValid() ? 'true' : null"
                />
                @if (touched() && !emailValid()) {
                  <p class="field-error">Enter a valid email address.</p>
                }
              </div>

              <div class="field">
                <div class="label-row">
                  <label for="ws-password">Password</label>
                  <button class="link-inline" type="button" (click)="forgot()">Forgot?</button>
                </div>
                <div class="input-affix">
                  <input
                    id="ws-password"
                    [type]="showPassword() ? 'text' : 'password'"
                    [(ngModel)]="password"
                    name="password"
                    autocomplete="current-password"
                    placeholder="••••••••••••"
                  />
                  <button
                    class="affix-btn"
                    type="button"
                    [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                    (click)="showPassword.set(!showPassword())"
                  >
                    {{ showPassword() ? 'Hide' : 'Show' }}
                  </button>
                </div>
                @if (touched() && !password) {
                  <p class="field-error">Enter your password.</p>
                }
              </div>

              <button class="cta auth-submit" type="submit" [disabled]="busy()">
                <span>{{ busy() ? 'Signing in…' : 'Sign in' }}</span>
                <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
              </button>

              <p class="auth-fine">Secured connection. Authorised users only.</p>

              @if (error()) {
                <p class="auth-error" role="alert">{{ error() }}</p>
              }
              @if (info()) {
                <p class="auth-info" role="status">{{ info() }}</p>
              }
            </form>

            <div class="auth-utilities">
              <button class="link-inline" (click)="forgot()">Forgot password?</button>
              <span class="muted small">|</span>
              <button
                class="link-inline"
                (click)="
                  info.set('Support desk is reached on +234 1 888 7400 during operational hours.')
                "
              >
                Trouble logging in?
              </button>
            </div>
            <p class="auth-desk">Direct desk: Aba desk +234 1 888 7400</p>
            } @else {
              @if (applyDone(); as submitted) {
                <div class="auth-form">
                  <p class="auth-info" role="status">
                    Application received. Sign in any time to track the review; the Aba desk
                    vets applications within 24 operational hours.
                  </p>
                  <dl class="apply-receipt small">
                    <dt>Applicant</dt>
                    <dd>{{ apply.businessName }}</dd>
                    <dt>Email</dt>
                    <dd>{{ submitted }}</dd>
                    <dt>Location</dt>
                    <dd>{{ apply.city }}, {{ apply.state }}</dd>
                    <dt>Buyer type</dt>
                    <dd>{{ apply.buyerType }}</dd>
                  </dl>
                  <button class="cta auth-submit" type="button" (click)="showSignInForm()">
                    <span>Back to sign in</span>
                    <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                  </button>
                </div>
              } @else {
              <form class="auth-form" (ngSubmit)="submitApplication()" novalidate>
                <div class="field">
                  <label for="ap-name">Full name</label>
                  <input
                    id="ap-name"
                    name="apName"
                    autocomplete="name"
                    [(ngModel)]="apply.name"
                    placeholder="Ada Okeke"
                  />
                </div>

                <div class="field">
                  <label for="ap-business">Business name</label>
                  <input
                    id="ap-business"
                    name="apBusiness"
                    autocomplete="organization"
                    [(ngModel)]="apply.businessName"
                    placeholder="Okeke Fashion Boutique"
                  />
                </div>

                <div class="field">
                  <label for="ap-email">Email</label>
                  <input
                    id="ap-email"
                    name="apEmail"
                    type="email"
                    inputmode="email"
                    autocomplete="email"
                    [(ngModel)]="email"
                    placeholder="orders@store.ng"
                  />
                </div>

                <div class="field">
                  <label for="ap-password">Password</label>
                  <input
                    id="ap-password"
                    name="apPassword"
                    [type]="showPassword() ? 'text' : 'password'"
                    autocomplete="new-password"
                    [(ngModel)]="password"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div class="field">
                  <label for="ap-type">Buyer type</label>
                  <select id="ap-type" name="apType" [(ngModel)]="apply.buyerType">
                    @for (t of buyerTypes; track t.value) {
                      <option [value]="t.value">{{ t.label }}</option>
                    }
                  </select>
                </div>

                <div class="field">
                  <label for="ap-phone">Phone <span class="muted">(optional)</span></label>
                  <input
                    id="ap-phone"
                    name="apPhone"
                    type="tel"
                    inputmode="tel"
                    autocomplete="tel"
                    [(ngModel)]="apply.phone"
                    placeholder="+234 800 000 0000"
                  />
                </div>

                <div class="field-pair">
                  <div class="field">
                    <label for="ap-city">City</label>
                    <input
                      id="ap-city"
                      name="apCity"
                      autocomplete="address-level2"
                      [(ngModel)]="apply.city"
                      placeholder="Aba"
                    />
                  </div>
                  <div class="field">
                    <label for="ap-state">State</label>
                    <select id="ap-state" name="apState" [(ngModel)]="apply.state">
                      <option value="">Select…</option>
                      @for (s of states; track s) {
                        <option [value]="s">{{ s }}</option>
                      }
                    </select>
                  </div>
                </div>

                <div class="field">
                  <label for="ap-volume">
                    Opening order estimate
                    <span class="muted">(units, optional)</span>
                  </label>
                  <input
                    id="ap-volume"
                    name="apVolume"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    step="1"
                    [(ngModel)]="apply.openingVolume"
                    placeholder="20"
                  />
                  <p class="field-hint">Minimum batch is 20 units per silhouette.</p>
                </div>

                <button class="cta auth-submit" type="submit" [disabled]="applyBusy()">
                  <span>{{ applyBusy() ? 'Submitting…' : 'Submit application' }}</span>
                  <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                </button>

                <p class="auth-fine">
                  Your account is created with this application and stays read-only until the
                  factory approves it.
                </p>

                @if (error()) {
                  <p class="auth-error" role="alert">{{ error() }}</p>
                }
                <p class="apply-back">
                  <button class="link-inline" type="button" (click)="showSignInForm()">
                    Already applied? Back to sign in
                  </button>
                </p>
              </form>
              }
            }
          </div>

            @if (mode() === 'signin') {
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
              <div class="crit">
                <span class="n">01</span>
                <div class="txt">
                  <span class="t">Minimum Batch Size</span>
                  <span class="d"
                    >A strict per-silhouette minimum, set by the factory and shown in your rate card
                    once your tier is assigned.</span
                  >
                </div>
              </div>
              <div class="crit">
                <span class="n">02</span>
                <div class="txt">
                  <span class="t">Tiered Manufacturer Rates</span>
                  <span class="d"
                    >Live production pricing calibrated directly in Nigerian Naira (&#8358;).</span
                  >
                </div>
              </div>
              <div class="crit">
                <span class="n">03</span>
                <div class="txt">
                  <span class="t">CAC &amp; Corporate Verification</span>
                  <span class="d"
                    >Requires valid Corporate Affairs Commission (CAC) business credentials.</span
                  >
                </div>
              </div>
              <div class="crit">
                <span class="n">04</span>
                <div class="txt">
                  <span class="t">Dedicated Freight &amp; Logistics</span>
                  <span class="d"
                    >Priority dispatched via intra-state dispatch &amp; interstate haulage
                    routes.</span
                  >
                </div>
              </div>
            </div>
            <button class="cta outline" type="button" (click)="showApplyForm()">
              <span>Apply for Wholesale Access</span>
              <span class="material-symbols-outlined" aria-hidden="true">assignment_ind</span>
            </button>
            <span class="small muted apply-note"
              >Applications typically vetted within 24 operational hours</span
            >
          </div>
            }

          <div class="status-strip">
            <div class="status-line">
              <span class="dot"></span><span>Aba Mill Status: Online</span>
            </div>
            <span class="run">RUN 04 // 420GSM FLEECE READY</span>
          </div>

          <footer class="auth-footer">
            <p class="legal">Seentair Garments Nigeria Ltd. Aba, Abia State. Strictly B2B.</p>
            <p class="sub">
              All industrial pattern rights and batch allocations reserved. Orders processed in
              Nigerian Naira (&#8358;).
            </p>
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
          <span class="material-symbols-outlined" aria-hidden="true">grid_view</span>Home</a
        >
        <a routerLink="/catalogue" routerLinkActive="active">
          <span class="material-symbols-outlined" aria-hidden="true">storefront</span>Catalogue</a
        >
        <a routerLink="/orders" routerLinkActive="active">
          <span class="material-symbols-outlined" aria-hidden="true">receipt_long</span>Orders</a
        >
        <a routerLink="/custom" routerLinkActive="active">
          <span class="material-symbols-outlined" aria-hidden="true">design_services</span>Custom</a
        >
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

  /**
   * The sign-in card doubles as the application form. A first-time bulk buyer
   * has no account, so making them sign in first dead-ends at the login screen
   * -- which is what the old "Apply for Wholesale Access" button did: it only
   * printed an instruction to sign in and come back.
   */
  readonly mode = signal<'signin' | 'apply'>('signin');
  readonly applyBusy = signal(false);
  readonly applyTouched = signal(false);
  readonly applyDone = signal<string | null>(null);
  apply = {
    name: '',
    businessName: '',
    city: '',
    state: '',
    phone: '',
    buyerType: 'retailer',
    openingVolume: '',
  };

  readonly buyerTypes = [
    { value: 'retailer', label: 'Fashion retailer / boutique' },
    { value: 'online_reseller', label: 'Online reseller' },
    { value: 'institution', label: 'Institution / uniform buyer' },
    { value: 'distributor', label: 'Distributor' },
    { value: 'other', label: 'Other' },
  ];

  readonly states = [
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
    'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Gombe', 'Imo', 'Jigawa',
    'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger',
    'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
  ];

  /** Returns the first problem, or null when the form is ready to send. */
  applyError(): string | null {
    if (!this.apply.name.trim()) return 'Enter your full name.';
    if (!this.emailValid()) return 'Enter a valid email address.';
    if (this.password.length < 8) return 'Choose a password of at least 8 characters.';
    if (!this.apply.businessName.trim()) return 'Enter your business name.';
    if (!this.apply.city.trim()) return 'Enter your city.';
    if (!this.apply.state) return 'Select your state.';
    if (this.apply.openingVolume && (!/^\d+$/.test(this.apply.openingVolume) || +this.apply.openingVolume < 1)) {
      return 'Opening volume must be a whole number of units.';
    }
    return null;
  }

  showApplyForm(): void {
    this.mode.set('apply');
    this.error.set(null);
    this.info.set(null);
    this.applyTouched.set(false);
    this.applyDone.set(null);
  }

  showSignInForm(): void {
    this.mode.set('signin');
    this.error.set(null);
    this.info.set(null);
    this.applyTouched.set(false);
  }

  submitApplication(): void {
    this.applyTouched.set(true);
    this.error.set(null);
    this.info.set(null);
    const problem = this.applyError();
    if (problem) {
      this.error.set(problem);
      return;
    }

    this.applyBusy.set(true);
    const volume = this.apply.openingVolume.trim();
    this.api
      .applyForAccess({
        name: this.apply.name.trim(),
        email: this.email.trim(),
        password: this.password,
        businessName: this.apply.businessName.trim(),
        buyerType: this.apply.buyerType,
        businessPhone: this.apply.phone.trim() || undefined,
        city: this.apply.city.trim(),
        state: this.apply.state,
        openingVolume: volume ? +volume : undefined,
      })
      .subscribe({
        next: () => {
          this.applyBusy.set(false);
          this.applyDone.set(this.email.trim());
          this.password = '';
          this.error.set(null);
        },
        error: (e: { status?: number; error?: { message?: string | string[] } }) => {
          this.applyBusy.set(false);
          const raw = e?.error?.message;
          const first = Array.isArray(raw) ? raw[0] : raw;
          this.error.set(
            e?.status === 429
              ? 'Too many applications from this device. Wait a minute, then try again.'
              : (first ?? 'That application could not be submitted. Try again.'),
          );
        },
      });
  }

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
