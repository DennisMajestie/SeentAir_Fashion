import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { offerFor } from '../pricing';
import { ApiService, Order } from '../api.service';
import { WishlistService, WishItem } from '../wishlist.service';

/** Only the sign-in address is persisted; never the password or session token. */
const REMEMBERED_EMAIL_KEY = 'seentair.rememberedEmail';

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
            {{
              mode() === 'signin'
                ? 'Track orders, request returns within 12 hours, and check out faster.'
                : 'One account for orders, returns and drop notifications. No spam.'
            }}
          </p>

          <form class="auth-form" (ngSubmit)="submit()" novalidate>
            @if (mode() === 'register') {
              <div class="field">
                <label for="ac-name">Full name</label>
                <input
                  id="ac-name"
                  type="text"
                  [(ngModel)]="name"
                  name="name"
                  autocomplete="name"
                  placeholder="Ada Okereke"
                  [attr.aria-invalid]="touched() && !nameValid() ? 'true' : null"
                />
                @if (touched() && !nameValid()) {
                  <p class="field-error">Tell us your name.</p>
                }
              </div>
            }

            <div class="field">
              <label for="ac-email">Email</label>
              <input
                id="ac-email"
                type="email"
                [(ngModel)]="email"
                name="email"
                autocomplete="email"
                inputmode="email"
                placeholder="you@example.com"
                [attr.aria-invalid]="touched() && !emailValid() ? 'true' : null"
              />
              @if (touched() && !emailValid()) {
                <p class="field-error">Enter a valid email address.</p>
              }
            </div>

            @if (mode() === 'register') {
              <div class="field">
                <label for="ac-phone">Phone <span class="optional">optional</span></label>
                <input
                  id="ac-phone"
                  type="tel"
                  [(ngModel)]="phone"
                  name="phone"
                  autocomplete="tel"
                  inputmode="tel"
                  placeholder="080 0000 0000"
                />
                <p class="field-hint">For delivery updates by SMS or WhatsApp.</p>
              </div>
            }

            <div class="field">
              <label for="ac-password">Password</label>
              <div class="input-affix">
                <input
                  id="ac-password"
                  [type]="showPassword() ? 'text' : 'password'"
                  [(ngModel)]="password"
                  name="password"
                  [autocomplete]="mode() === 'signin' ? 'current-password' : 'new-password'"
                  [placeholder]="mode() === 'signin' ? 'Your password' : 'At least 8 characters'"
                  [attr.aria-invalid]="touched() && !passwordValid() ? 'true' : null"
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
              @if (touched() && !passwordValid()) {
                <p class="field-error">
                  {{ mode() === 'signin' ? 'Enter your password.' : 'Use at least 8 characters.' }}
                </p>
              }
            </div>

            @if (mode() === 'signin') {
              <div class="auth-row">
                <label class="auth-check">
                  <input type="checkbox" name="remember" [(ngModel)]="remember" />
                  <span>Remember me</span>
                </label>
                <button class="link-inline auth-forgot" type="button" (click)="forgot()">
                  Forgot password
                </button>
              </div>
            }

            <button class="cta auth-submit" type="submit" [disabled]="busy()">
              @if (busy()) {
                <span class="auth-spinner" aria-hidden="true"></span>
              }
              <span>
                {{
                  busy()
                    ? mode() === 'signin'
                      ? 'Signing in…'
                      : 'Creating account…'
                    : mode() === 'signin'
                      ? 'Sign in'
                      : 'Create account'
                }}
              </span>
            </button>
          </form>

          @if (error()) {
            <p class="auth-error" role="alert">{{ error() }}</p>
          }
          @if (info()) {
            <p class="auth-info" role="status">{{ info() }}</p>
          }

          <div class="auth-divider"><span>or</span></div>

          <p class="auth-switch">
            @if (mode() === 'signin') {
              Don't have an account?
              <button class="link-inline" type="button" (click)="setMode('register')">
                Create one
              </button>
            } @else {
              Already have an account?
              <button class="link-inline" type="button" (click)="setMode('signin')">Sign in</button>
            }
          </p>

          <div class="trust-row auth-trust">
            <span>Full payment</span>
            <span>Tracked dispatch</span>
            <span>12h returns</span>
          </div>

          <p class="auth-fine">
            <a routerLink="/policies">Terms</a> · <a routerLink="/policies">Privacy</a> ·
            <a routerLink="/policies">Help</a>
          </p>
        </div>
      </section>
    } @else {
      <h1>Your account</h1>
      <button class="link" (click)="logout()">Sign out</button>

      <!-- Signed in: pull the account's own saved list down so it is visible
           here and usable on any device, not just this browser. -->
      @if (wishlistItems().length > 0) {
        <h2 id="saved">Saved</h2>
        <div class="saved-grid">
          @for (item of wishlistItems(); track item.productId) {
            <a class="saved-row" [routerLink]="['/product', item.productId]">
              @if (item.imageUrl) {
                <img [src]="item.imageUrl" [alt]="item.productName" />
              }
              <span>{{ item.productName }}</span>
              <span class="muted">₦{{ item.price | number: '1.0-2' }}</span>
            </a>
          }
        </div>
      }

      <!-- ids match the fragments the mobile shell links to: the header bell
           goes to #notifications, the Orders tab goes to #orders. -->
      @if (notifications().length > 0) {
        <h2 id="notifications">Notifications</h2>
        @for (n of notifications(); track n.id) {
          <div class="event">
            <strong>{{ n.type.replaceAll('_', ' ') }}</strong>
            <span class="muted small">{{ n.sentAt | date: 'medium' }}</span>
            <p class="small">{{ n.message }}</p>
          </div>
        }
      }

      <h2 id="orders">Your orders</h2>
      @if (orders().length === 0) {
        <p class="muted">No orders yet. <a routerLink="/">Start shopping</a></p>
      } @else {
        @for (order of orders(); track order.id) {
          <a class="order-row" [routerLink]="['/orders', order.id]">
            <span
              ><code>{{ order.id.slice(0, 8) }}</code></span
            >
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
  private readonly wishlist = inject(WishlistService);
  /** The account's saved products, shown alongside orders and notifications. */
  readonly wishlistItems = signal<WishItem[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly notifications = signal<
    Array<{ id: string; type: string; message: string; sentAt: string }>
  >([]);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  /** 'signin' or 'register'- one card, two jobs. */
  readonly mode = signal<'signin' | 'register'>('signin');
  readonly showPassword = signal(false);
  readonly busy = signal(false);
  /** Errors stay hidden until the first submit, so the form never nags. */
  readonly touched = signal(false);
  name = '';
  email = '';
  phone = '';
  password = '';
  /** Remembers the email address only, never the password or session token. */
  remember = true;

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
    const saved = this.readRememberedEmail();
    if (saved) {
      this.email = saved;
    } else {
      this.remember = false;
    }
    if (this.api.isLoggedIn) this.loadOrders();
    if (this.api.isLoggedIn) {
      this.loadOrders();
      // The account list is the authoritative one once signed in.
      this.api
        .wishlist()
        .pipe(
          map((rows) =>
            rows.map((r) => ({
              productId: r.product.id,
              productName: r.product.name,
              imageUrl: r.product.primaryImageUrl ?? r.product.variants[0]?.imageUrl ?? null,
              price: offerFor(r.product).price,
            })),
          ),
        )
        .subscribe({
          next: (items) => this.wishlistItems.set(items),
          error: () => undefined,
        });
    }
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
      const addr = this.email.trim();
      this.api.login(addr, this.password).subscribe({
        next: () => {
          this.persistRememberedEmail(addr);
          // Anything saved while browsing as a guest belongs to the account now.
          // Fired without blocking the sign-in: a wishlist is not worth failing
          // a completed login over.
          void this.wishlist.mergeIntoAccount();
          done();
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
      return;
    }

    this.api
      .register(this.name.trim(), this.email.trim(), this.phone.trim(), this.password)
      .subscribe({
        next: done,
        error: (e: { error?: { message?: string | string[] } }) => {
          this.busy.set(false);
          const msg = e?.error?.message;
          this.error.set(
            Array.isArray(msg)
              ? msg[0]
              : (msg ?? 'Could not create that account. Try a different email.'),
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

  private readRememberedEmail(): string | null {
    try {
      return localStorage.getItem(REMEMBERED_EMAIL_KEY);
    } catch {
      return null;
    }
  }

  private persistRememberedEmail(addr: string): void {
    try {
      if (this.remember) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, addr);
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch {
      /* Private-mode storage denial must not break sign-in. */
    }
  }
}
