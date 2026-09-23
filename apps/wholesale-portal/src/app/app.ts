import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ApiService } from './api.service';

@Component({
  selector: 'app-root',
  imports: [FormsModule, RouterOutlet, RouterLink],
  template: `
    <header class="site-header">
      <span class="logo">SEENTAIR <em>Wholesale</em></span>
      @if (api.isLoggedIn) {
        <nav>
          <a routerLink="/">Catalogue & Order</a>
          <a routerLink="/invoices">Invoices</a>
          <a routerLink="/custom">Custom Designs</a>
          <button class="link" (click)="logout()">Sign out</button>
        </nav>
      }
    </header>
    <main>
      @if (!api.isLoggedIn) {
        <section class="auth-screen">
          <div class="auth-card">
            <p class="auth-eyebrow">Trade access</p>
            <h1 class="auth-title">Welcome back.</h1>
            <p class="auth-lede">
              Bulk pricing, tiered discounts and invoice billing for stockists and retailers.
            </p>

            <form class="auth-form" (ngSubmit)="signIn()" novalidate>
              <div class="field">
                <label for="ws-email">Email</label>
                <input id="ws-email" type="email" [(ngModel)]="email" name="email"
                  autocomplete="email" inputmode="email" placeholder="you@company.ng"
                  [attr.aria-invalid]="touched() && !emailValid() ? 'true' : null" />
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
                  <input id="ws-password" [type]="showPassword() ? 'text' : 'password'"
                    [(ngModel)]="password" name="password" autocomplete="current-password"
                    placeholder="Your password" />
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
                {{ busy() ? 'Signing in…' : 'Sign in' }}
              </button>

              @if (error()) { <p class="auth-error" role="alert">{{ error() }}</p> }
              @if (info()) { <p class="auth-info" role="status">{{ info() }}</p> }
            </form>

            <div class="trust-row auth-trust">
              <span>MOQ 20 units</span>
              <span>Tiered pricing</span>
              <span>Invoice billing</span>
            </div>
          </div>
        </section>
      } @else {
        <router-outlet />
      }
    </main>
  `,
})
export class App {
  readonly api = inject(ApiService);
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
