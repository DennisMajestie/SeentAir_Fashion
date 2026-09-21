import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Order } from '../api.service';

@Component({
  selector: 'app-account',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    @if (!api.isLoggedIn) {
      <section class="auth-screen">
        <div class="auth-card">
          <p class="auth-eyebrow">{{ mode() === 'signin' ? 'Account access' : 'Join the drop' }}</p>
          <h1 class="auth-title">
            {{ mode() === 'signin' ? 'Welcome back.' : 'Create your account.' }}
          </h1>
          <p class="auth-lede">
            {{ mode() === 'signin'
              ? 'Track orders, request returns within 12 hours, and check out faster.'
              : 'One account for orders, returns and drop notifications. No spam.' }}
          </p>

          <div class="auth-tabs" role="tablist">
            <button type="button" role="tab" class="auth-tab"
              [class.active]="mode() === 'signin'"
              [attr.aria-selected]="mode() === 'signin'"
              (click)="setMode('signin')">Sign in</button>
            <button type="button" role="tab" class="auth-tab"
              [class.active]="mode() === 'register'"
              [attr.aria-selected]="mode() === 'register'"
              (click)="setMode('register')">Create account</button>
          </div>

          <form class="auth-form" (ngSubmit)="submit()" novalidate>
            @if (mode() === 'register') {
              <div class="field">
                <label for="ac-name">Full name</label>
                <input id="ac-name" type="text" [(ngModel)]="name" name="name"
                  autocomplete="name" placeholder="Ada Okereke"
                  [attr.aria-invalid]="touched() && !nameValid() ? 'true' : null" />
                @if (touched() && !nameValid()) { <p class="field-error">Tell us your name.</p> }
              </div>
            }

            <div class="field">
              <label for="ac-email">Email</label>
              <input id="ac-email" type="email" [(ngModel)]="email" name="email"
                autocomplete="email" inputmode="email" placeholder="you@example.com"
                [attr.aria-invalid]="touched() && !emailValid() ? 'true' : null" />
              @if (touched() && !emailValid()) { <p class="field-error">Enter a valid email address.</p> }
            </div>

            @if (mode() === 'register') {
              <div class="field">
                <label for="ac-phone">Phone <span class="optional">optional</span></label>
                <input id="ac-phone" type="tel" [(ngModel)]="phone" name="phone"
                  autocomplete="tel" inputmode="tel" placeholder="080 0000 0000" />
                <p class="field-hint">For delivery updates by SMS or WhatsApp.</p>
              </div>
            }

            <div class="field">
              <div class="label-row">
                <label for="ac-password">Password</label>
                @if (mode() === 'signin') {
                  <button class="link-inline" type="button" (click)="forgot()">Forgot?</button>
                }
              </div>
              <div class="input-affix">
                <input id="ac-password" [type]="showPassword() ? 'text' : 'password'"
                  [(ngModel)]="password" name="password"
                  [autocomplete]="mode() === 'signin' ? 'current-password' : 'new-password'"
                  [placeholder]="mode() === 'signin' ? 'Your password' : 'At least 8 characters'"
                  [attr.aria-invalid]="touched() && !passwordValid() ? 'true' : null" />
                <button class="affix-btn" type="button"
                  [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                  (click)="showPassword.set(!showPassword())">
                  {{ showPassword() ? 'Hide' : 'Show' }}
                </button>
              </div>
              @if (touched() && !passwordValid()) {
                <p class="field-error">
                  {{ mode() === 'signin' ? 'Enter your password.' : 'Use at least 8 characters.' }}
                </p>
              }
            </div>

            <button class="cta auth-submit" type="submit" [disabled]="busy()">
              {{ busy()
                ? (mode() === 'signin' ? 'Signing in…' : 'Creating account…')
                : (mode() === 'signin' ? 'Sign in' : 'Create account') }}
            </button>

            @if (error()) { <p class="auth-error" role="alert">{{ error() }}</p> }
            @if (info()) { <p class="auth-info" role="status">{{ info() }}</p> }
          </form>

          <div class="trust-row auth-trust">
            <span>Full payment</span>
            <span>Tracked dispatch</span>
            <span>12h returns</span>
          </div>
        </div>
      </section>
    } @else {
      <h1>Your account</h1>
      <button class="link" (click)="logout()">Sign out</button>

      @if (notifications().length > 0) {
        <h2>Notifications</h2>
        @for (n of notifications(); track n.id) {
          <div class="event">
            <strong>{{ n.type.replaceAll('_', ' ') }}</strong>
            <span class="muted small">{{ n.sentAt | date: 'medium' }}</span>
            <p class="small" style="margin:0.2rem 0 0">{{ n.message }}</p>
          </div>
        }
      }

      <h2>Your orders</h2>
      @if (orders().length === 0) {
        <p class="muted">No orders yet. <a routerLink="/">Start shopping</a></p>
      } @else {
        @for (order of orders(); track order.id) {
          <a class="order-row" [routerLink]="['/orders', order.id]">
            <span><code>{{ order.id.slice(0, 8) }}</code></span>
            <span class="status" [class]="'status ' + order.status">{{
              order.status.replaceAll('_', ' ')
            }}</span>
            <span>₦{{ order.totalAmount | number: '1.0-2' }}</span>
          </a>
        }
      }
    }
  `,
})
export class AccountPage implements OnInit {
  readonly api = inject(ApiService);
  readonly orders = signal<Order[]>([]);
  readonly notifications = signal<Array<{ id: string; type: string; message: string; sentAt: string }>>([]);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  /** 'signin' or 'register' — one card, two jobs. */
  readonly mode = signal<'signin' | 'register'>('signin');
  readonly showPassword = signal(false);
  readonly busy = signal(false);
  /** Errors stay hidden until the first submit, so the form never nags. */
  readonly touched = signal(false);
  name = '';
  email = '';
  phone = '';
  password = '';

  setMode(mode: 'signin' | 'register'): void {
    this.mode.set(mode);
    this.touched.set(false);
    this.error.set(null);
    this.info.set(null);
  }

  emailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }
  nameValid(): boolean {
    return this.mode() === 'signin' || this.name.trim().length > 1;
  }
  /** The API requires 8+ on register; on sign-in any non-empty value. */
  passwordValid(): boolean {
    return this.mode() === 'signin' ? this.password.length > 0 : this.password.length >= 8;
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
      next: (res) => this.info.set(res.message),
      error: () => this.info.set('If that email is registered, a reset link has been sent.'),
    });
  }

  ngOnInit(): void {
    if (this.api.isLoggedIn) this.loadOrders();
  }

  submit(): void {
    this.touched.set(true);
    this.error.set(null);
    this.info.set(null);
    if (!this.emailValid() || !this.passwordValid() || !this.nameValid()) return;

    this.busy.set(true);
    const done = () => {
      this.busy.set(false);
      this.password = '';
      this.touched.set(false);
      this.loadOrders();
    };

    if (this.mode() === 'signin') {
      this.api.login(this.email.trim(), this.password).subscribe({
        next: done,
        error: (e: { status?: number }) => {
          this.busy.set(false);
          this.error.set(
            e?.status === 429
              ? 'Too many attempts. Wait a minute, then try again.'
              : 'That email and password do not match. Try again, or use Forgot.',
          );
        },
      });
      return;
    }

    this.api.register(this.name.trim(), this.email.trim(), this.phone.trim(), this.password).subscribe({
      next: done,
      error: (e: { error?: { message?: string | string[] } }) => {
        this.busy.set(false);
        const msg = e?.error?.message;
        this.error.set(
          Array.isArray(msg) ? msg[0] : (msg ?? 'Could not create that account. Try a different email.'),
        );
      },
    });
  }

  logout(): void {
    this.api.logout();
    this.orders.set([]);
    this.notifications.set([]);
    // Come back to a clean sign-in card, not whatever mode was last used.
    this.setMode('signin');
    this.name = '';
    this.phone = '';
    this.password = '';
    this.showPassword.set(false);
  }

  private loadOrders(): void {
    this.api.myOrders().subscribe((res) => this.orders.set(res.data));
    this.api.notifications().subscribe((res) => this.notifications.set(res.data));
  }
}
