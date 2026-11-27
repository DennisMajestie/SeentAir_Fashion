import { Component, ElementRef, QueryList, ViewChildren, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';
import { BrandAlertService } from '../brand-alert.service';
import { PortalStore } from '../portal.store';
import { ThemeService } from '../theme.service';

/**
 * Screen P1 (partner sign-in) + P2 (two-step hardware verification).
 * Phase 01 (identity) is live; Phase 02 (TOTP challenge) activates when the
 * API answers `requires2fa` with a challenge token (auth/2fa/verify).
 */
@Component({
  selector: 'app-login-page',
  imports: [FormsModule],
  template: `
    <div class="stitch">
      <div class="bg-canvas text-light-on-surface min-h-screen flex flex-col justify-between antialiased selection:bg-accent/20">
        @if (phase() === 1) {
          <!-- P1 · Secured Connection Top Strip -->
          <header class="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border/70 bg-canvas/80 backdrop-blur-md sticky top-0 z-20">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
              <span class="text-[12px] font-medium tracking-tight text-light-secondary flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px] text-accent">shield</span>
                Partner Portal Security Enclave
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-mono uppercase px-2 py-0.5 rounded-full bg-canvas-tint text-light-primary border border-border">EQUITY REGISTRY</span>
              <button type="button" aria-label="Toggle theme" class="w-8 h-8 rounded-full flex items-center justify-center bg-light-surface border border-border text-light-secondary hover:text-light-primary" (click)="theme.toggle()">
                <span class="material-symbols-outlined text-[16px]">{{ theme.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</span>
              </button>
            </div>
          </header>

          <!-- P1 · Main Scrollable Content -->
          <main class="flex-1 px-4 py-5 flex flex-col gap-5 max-w-[390px] mx-auto w-full md:max-w-md">

            <!-- Hero / Title -->
            <div class="pt-2 text-center">
                <div class="mb-3">
                  <img class="vessa-logo vessa-logo--light h-11 w-auto mx-auto" src="assets/logo-light.png" alt="Seentair — Style for Everyone" width="834" height="299" />
                  <img class="vessa-logo vessa-logo--dark h-11 w-auto mx-auto" src="assets/logo-dark.png" alt="" aria-hidden="true" width="243" height="78" />
                </div>
              <h1 class="sr-only">SEENTAIR PARTNERS</h1>
              <p class="text-[13px] text-light-secondary font-medium tracking-wide uppercase mt-0.5">Equity, Dividends &amp; Manufacturing Telemetry</p>
            </div>

            <!-- Alert / Notice Area -->
            <div class="p-3.5 rounded-xl bg-canvas-tint/70 border border-border flex items-start gap-2.5">
              <span class="material-symbols-outlined text-accent text-[18px] mt-0.5">verified</span>
              <div class="text-[12px] leading-relaxed text-light-primary">
                <strong class="font-semibold text-light-primary">Authorised stakeholders only:</strong> Access is restricted to registered equity partners and factory investment syndicate members.
              </div>
            </div>

            <!-- Split Branded Partner Card -->
            <section class="bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] flex flex-col gap-4">
              <div>
                <h2 class="text-[18px] font-bold text-light-primary">Partner Account Access</h2>
                <p class="text-[13px] text-light-secondary mt-0.5">Sign in to view financial audits and distribution ledgers</p>
              </div>

              <form class="flex flex-col gap-3.5" (ngSubmit)="signIn()" novalidate>

                <!-- Partner Email -->
                <label class="flex flex-col gap-1.5">
                  <span class="text-[13px] font-semibold text-light-primary">Investor corporate email</span>
                  <div class="relative flex items-center">
                    <span class="absolute left-3.5 text-light-secondary material-symbols-outlined text-[18px]">mail</span>
                    <input type="email" name="email" [(ngModel)]="email" required autocomplete="email" placeholder="partner@domain.com" class="w-full pl-10 pr-3.5 py-3 rounded-md bg-canvas/60 border border-border text-[14px] text-light-primary focus:outline-none focus:border-accent font-normal" />
                  </div>
                </label>

                <!-- Partner Password -->
                <label class="flex flex-col gap-1.5">
                  <div class="flex items-center justify-between">
                    <span class="text-[13px] font-semibold text-light-primary">Partner Security Key</span>
                    <button type="button" class="text-[12px] text-warning font-medium hover:underline" (click)="forgot()">Forgot key?</button>
                  </div>
                  <div class="relative flex items-center">
                    <span class="absolute left-3.5 text-light-secondary material-symbols-outlined text-[18px]">key</span>
                    <input [type]="showPassword() ? 'text' : 'password'" name="password" [(ngModel)]="password" required autocomplete="current-password" placeholder="Password" class="w-full pl-10 pr-10 py-3 rounded-md bg-canvas/60 border border-border text-[14px] text-light-primary font-mono focus:outline-none focus:border-accent" />
                    <button type="button" aria-label="Toggle password visibility" class="absolute right-3.5 text-light-secondary hover:text-light-primary" (click)="showPassword.set(!showPassword())">
                      <span class="material-symbols-outlined text-[18px]">{{ showPassword() ? 'visibility_off' : 'visibility' }}</span>
                    </button>
                  </div>
                </label>

                <!-- Sign in CTA -->
                <div class="pt-2">
                  <button type="submit" [disabled]="busy()" class="w-full py-3.5 rounded-full bg-accent text-on-accent font-semibold text-[15px] flex items-center justify-center gap-2 shadow-sm hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-60">
                    <span>{{ busy() ? 'Signing in…' : 'Proceed to 2FA Challenge' }}</span>
                    <span class="material-symbols-outlined text-[18px]">security</span>
                  </button>
                </div>
                @if (error()) { <p class="p-3 rounded-md bg-danger/10 border border-danger/25 text-danger text-[12px]" role="alert">{{ error() }}</p> }
                @if (info()) { <p class="p-3 rounded-md bg-success/10 border border-success/25 text-success text-[12px]" role="status">{{ info() }}</p> }
              </form>
            </section>

            <!-- Pre-Auth Trust & Governance Tiles (Factual, No fake live PII) -->
            <section class="grid grid-cols-2 gap-2.5 text-[12px] md:grid-cols-4">
              <div class="bg-light-surface/80 p-3 rounded-xl border border-border">
                <span class="material-symbols-outlined text-[18px] text-accent mb-1">query_stats</span>
                <strong class="font-bold text-light-primary block">Factory Telemetry</strong>
                <p class="text-[11px] text-light-secondary mt-0.5 leading-snug">Aggregated Aba line production capacity and cut volume.</p>
              </div>

              <div class="bg-light-surface/80 p-3 rounded-xl border border-border">
                <span class="material-symbols-outlined text-[18px] text-accent mb-1">pie_chart</span>
                <strong class="font-bold text-light-primary block">Equity Registry</strong>
                <p class="text-[11px] text-light-secondary mt-0.5 leading-snug">Real-time cap table positions and audited distributions.</p>
              </div>

              <div class="bg-light-surface/80 p-3 rounded-xl border border-border">
                <span class="material-symbols-outlined text-[18px] text-accent mb-1">payments</span>
                <strong class="font-bold text-light-primary block">Quarterly Dividends</strong>
                <p class="text-[11px] text-light-secondary mt-0.5 leading-snug">Declared quarterly from certified profit and paid by equity percentage.</p>
              </div>

              <div class="bg-light-surface/80 p-3 rounded-xl border border-border">
                <span class="material-symbols-outlined text-[18px] text-accent mb-1">gavel</span>
                <strong class="font-bold text-light-primary block">Confidential Access</strong>
                <p class="text-[11px] text-light-secondary mt-0.5 leading-snug">Aggregates only — no customer personal data is exposed to partner accounts.</p>
              </div>
            </section>

          </main>

          <!-- P1 · Regulatory Strip Footer -->
          <footer class="px-5 py-3 bg-canvas-tint/60 border-t border-border flex items-center justify-between text-[11px] font-mono text-light-secondary">
            <span>SEENTAIR EQUITY LEDGER</span>
            <span>Aba, Nigeria</span>
          </footer>
        } @else {
          <!-- P2 · Header -->
          <header class="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border/70 bg-canvas/80 backdrop-blur-md sticky top-0 z-20">
            <button type="button" class="flex items-center gap-1.5 text-[13px] font-semibold text-light-secondary hover:text-light-primary" (click)="restart()">
              <span class="material-symbols-outlined text-[18px]">arrow_back</span>
              Start over
            </button>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-accent/20 text-warning font-semibold border border-accent/30">MFA CHALLENGE</span>
          </header>

          <!-- P2 · Content -->
          <main class="flex-1 px-4 py-6 flex flex-col gap-5 max-w-[390px] mx-auto w-full md:max-w-md">

            <div class="text-center pt-2">
              <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-light-primary text-accent shadow-sm mb-3 border border-border">
                <span class="material-symbols-outlined text-[28px]">phonelink_lock</span>
              </div>
              <h1 class="text-[22px] font-bold text-light-primary">Security Challenge Active</h1>
              <p class="text-[13px] text-light-secondary mt-1 max-w-[280px] mx-auto">Enter the 6-digit rotating verification code from your hardware token or authenticator app.</p>
            </div>

            @if (setupSecret(); as secret) {
              <section class="bg-canvas-tint/70 rounded-xl p-4 border border-border flex flex-col gap-2">
                <h2 class="text-[13px] font-bold text-light-primary">Set up your authenticator</h2>
                <p class="text-[12px] text-light-secondary leading-normal">
                  Partner accounts always require two-factor authentication. Open the setup link in
                  your authenticator app, then enter the first 6-digit code below to finish.
                </p>
                @if (setupOtpauthUrl(); as otpauth) {
                  <a [href]="otpauth" target="_blank" rel="noopener" class="text-[12px] text-accent underline break-all">Open authenticator setup link</a>
                }
                <p class="text-[11px] font-mono text-light-secondary break-all">Secret: {{ secret }}</p>
              </section>
            }

            <!-- P2 · Verification Card -->
            <section class="bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] flex flex-col gap-4">

              @if (usingRecovery()) {
                <label class="flex flex-col gap-1.5">
                  <span class="text-[12px] font-semibold text-light-primary text-center">Recovery code</span>
                  <input type="text" [(ngModel)]="recoveryCode" name="recoveryCode" autocomplete="one-time-code" placeholder="Enter a saved recovery code" class="w-full py-3 px-3 text-center font-mono text-[14px] bg-canvas border border-accent rounded-lg text-light-primary focus:outline-none focus:ring-2 focus:ring-accent" />
                </label>
                <p class="text-[11px] text-light-secondary border-t border-border pt-3">
                  Recovery codes work once. Save the remaining codes for future sign-ins.
                </p>
              } @else {
                <!-- 6-digit Code Input Grid -->
                <div class="flex flex-col gap-2">
                  <label class="text-[12px] font-semibold text-light-primary text-center">6-Digit Authenticator Code</label>
                  <div class="grid grid-cols-6 gap-2">
                    @for (d of digits; track $index; let i = $index) {
                      <input #digit type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="1" [value]="digits[i]" [attr.aria-label]="'Authenticator digit ' + (i + 1)" class="w-full h-13 py-3 text-center font-mono font-bold text-[20px] bg-canvas border border-accent rounded-lg text-light-primary focus:outline-none focus:ring-2 focus:ring-accent" (input)="onDigit(i, $event)" (keydown.backspace)="onBack(i)" />
                    }
                  </div>
                </div>

                <p class="text-[11px] text-light-secondary border-t border-border pt-3">
                  Enter the current 6-digit code from your authenticator app. The challenge expires after five minutes.
                </p>
              }

              <div class="text-center">
                <button type="button" class="text-[12px] text-warning hover:underline" (click)="usingRecovery.set(!usingRecovery())">
                  {{ usingRecovery() ? 'Use authenticator app instead' : 'Lost your device? Use a recovery code' }}
                </button>
              </div>

              <!-- Verify Button -->
              <form (ngSubmit)="verify()" novalidate>
                <button type="submit" [disabled]="busy() || (usingRecovery() ? !recoveryCode.trim() : code.length < 6)" class="w-full py-3.5 rounded-full bg-accent text-on-accent font-semibold text-[15px] flex items-center justify-center gap-2 shadow-sm hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-60">
                  <span>{{ busy() ? 'Verifying…' : 'Verify & Enter Portal' }}</span>
                  <span class="material-symbols-outlined text-[18px]">lock_open</span>
                </button>
              </form>

              <div class="text-center">
                <button type="button" class="text-[12px] text-light-secondary hover:text-light-primary font-medium" (click)="restart()">Use a different account</button>
              </div>
              @if (error()) { <p class="p-3 rounded-md bg-danger/10 border border-danger/25 text-danger text-[12px]" role="alert">{{ error() }}</p> }
            </section>

            <div class="p-3.5 rounded-xl bg-canvas-tint/70 border border-border text-[11px] text-light-secondary text-center leading-normal">
              Partner access shows business aggregates only. Contact Seentair if you need help with your authenticator.
            </div>

          </main>

          <footer class="px-5 py-3 bg-canvas-tint/60 border-t border-0 border-border flex items-center justify-center text-[11px] font-mono text-light-secondary">
            <span>SEENTAIR EQUITY LEDGER · ABA, NIGERIA</span>
          </footer>
        }
      </div>
    </div>
  `,
})
export class LoginPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly store = inject(PortalStore);
  readonly theme = inject(ThemeService);
  private readonly alerts = inject(BrandAlertService);

  readonly phase = signal<1 | 2>(1);
  readonly busy = signal(false);
  readonly usingRecovery = signal(false);
  recoveryCode = '';
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly setupSecret = signal<string | null>(null);
  readonly setupOtpauthUrl = signal<string | null>(null);
  private challengeToken: string | null = null;

  /** One cell per code digit; the joined string is the code sent to the API. */
  readonly digits = ['', '', '', '', '', ''];

  @ViewChildren('digit') cells?: QueryList<ElementRef<HTMLInputElement>>;

  get code(): string {
    return this.digits.join('');
  }

  email = '';
  password = '';

  onDigit(i: number, ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const kept = input.value.replace(/\D/g, '').slice(-1);
    this.digits[i] = kept;
    input.value = kept;
    if (kept && i < 5) this.cells?.get(i + 1)?.nativeElement.focus();
  }

  onBack(i: number): void {
    if (!this.digits[i] && i > 0) this.cells?.get(i - 1)?.nativeElement.focus();
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
          this.setupSecret.set(res.requiresSetup ? res.secret ?? null : null);
          this.setupOtpauthUrl.set(res.requiresSetup ? res.otpauthUrl ?? null : null);
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
    const request = this.usingRecovery()
      ? this.api.verifyRecovery(this.challengeToken, this.recoveryCode.trim())
      : this.api.verify2fa(this.challengeToken, this.code);
    request.subscribe({
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
    this.setupSecret.set(null);
    this.setupOtpauthUrl.set(null);
    this.usingRecovery.set(false);
    this.recoveryCode = '';
    this.digits.fill('');
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
