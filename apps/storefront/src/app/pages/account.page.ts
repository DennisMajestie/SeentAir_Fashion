import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideUser, LucideLock, LucideEye, LucideEyeOff } from '@lucide/angular';
import { map } from 'rxjs';
import { offerFor } from '../pricing';
import { ApiService, Order } from '../api.service';
import { WishlistService, WishItem } from '../wishlist.service';
import { ViewportService } from '../viewport.service';

/** Only the sign-in address is persisted; never the password or session token. */
const REMEMBERED_EMAIL_KEY = 'seentair.rememberedEmail';

@Component({
  selector: 'app-account',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    LucideUser,
    LucideLock,
    LucideEye,
    LucideEyeOff,
  ],
  template: `
    @if (!api.isLoggedIn) {
      <section class="auth-screen">
        <div class="auth-card">
          <!--
            Branded half. Desktop only, and gated on the viewport signal rather
            than a CSS media query on purpose: these are the two circular photos,
            and a display:none rule does not stop an image fetch, so a CSS-only
            hide would pull ~170 kB of PNGs onto every phone that opens the
            sign-in page for something it never shows. Not rendering means not
            requested.
          -->
          @if (viewport.isDesktop()) {
            <aside class="auth-brand" aria-hidden="true">
              <!-- Blurred ellipses standing in for cloud shapes. Pure CSS, no
                   image, so nothing extra to download. -->
              <span class="auth-brand__cloud auth-brand__cloud--a"></span>
              <span class="auth-brand__cloud auth-brand__cloud--b"></span>
              <span class="auth-brand__cloud auth-brand__cloud--c"></span>

              <div class="auth-brand__copy">
                <p class="auth-brand__hello">WELCOME</p>
                <p class="auth-brand__name">SEENTAIR</p>
                <p class="auth-brand__lede">
                  {{ mode() === 'signin' ? 'Sign in to your account.' : 'Create your account.' }}
                </p>
              </div>

              <!-- Centred on the seam so half sits over the white panel. Both
                   are real catalogue shots already served to the homepage. -->
              <img
                class="auth-brand__photo auth-brand__photo--seam"
                src="assets/products/product_06.png"
                alt=""
                decoding="async"
              />
              <img
                class="auth-brand__photo auth-brand__photo--corner"
                src="assets/products/product_09.png"
                alt=""
                decoding="async"
              />
              <span class="auth-brand__dot"></span>
            </aside>
          }

          <div class="auth-panel">
            <a class="auth-logo" routerLink="/" aria-label="SEENTAIR home">
              <img src="assets/logo-v1.png" alt="SEENTAIR" width="196" height="63" />
            </a>

            <h1 class="auth-heading">{{ mode() === 'signin' ? 'Sign in' : 'Sign up' }}</h1>
            <p class="auth-sub">
              {{ mode() === 'signin' ? 'Access your account' : 'One account for orders and returns' }}
            </p>

            <form class="auth-form" (ngSubmit)="submit()" novalidate>
              @if (mode() === 'register') {
                <div class="auth-field">
                  <label class="auth-sr" for="ac-name">Full name</label>
                  <div class="auth-input">
                    <svg class="auth-input__icon" lucideUser aria-hidden="true" />
                    <input
                      id="ac-name"
                      type="text"
                      [(ngModel)]="name"
                      name="name"
                      autocomplete="name"
                      placeholder="Ada Okereke"
                      [attr.aria-invalid]="touched() && !nameValid() ? 'true' : null"
                    />
                  </div>
                  @if (touched() && !nameValid()) {
                    <p class="field-error">Tell us your name.</p>
                  }
                </div>
              }

              <div class="auth-field">
                <label class="auth-sr" for="ac-email">Email</label>
                <div class="auth-input">
                  <svg class="auth-input__icon" lucideUser aria-hidden="true" />
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
                </div>
                @if (touched() && !emailValid()) {
                  <p class="field-error">Enter a valid email address.</p>
                }
              </div>

              @if (mode() === 'register') {
                <div class="auth-field">
                  <label class="auth-sr" for="ac-phone">
                    Phone <span class="optional">optional</span>
                  </label>
                  <!-- No leading icon: the spec gives one to the login identifier
                       and the password only, and this optional field would
                       otherwise need a phone glyph the icon set has no match for. -->
                  <div class="auth-input auth-input--plain">
                    <input
                      id="ac-phone"
                      type="tel"
                      [(ngModel)]="phone"
                      name="phone"
                      autocomplete="tel"
                      inputmode="tel"
                      placeholder="080 0000 0000"
                    />
                  </div>
                  <p class="field-hint">For delivery updates by SMS or WhatsApp.</p>
                </div>
              }

              <div class="auth-field">
                <label class="auth-sr" for="ac-password">Password</label>
                <div class="input-affix">
                  <div class="auth-input">
                    <svg class="auth-input__icon" lucideLock aria-hidden="true" />
                    <input
                      id="ac-password"
                      [type]="showPassword() ? 'text' : 'password'"
                      [(ngModel)]="password"
                      name="password"
                      [autocomplete]="mode() === 'signin' ? 'current-password' : 'new-password'"
                      [placeholder]="mode() === 'signin' ? 'Password' : 'At least 8 characters'"
                      [attr.aria-invalid]="touched() && !passwordValid() ? 'true' : null"
                    />
                  </div>
                  <button
                    class="affix-btn"
                    type="button"
                    [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                    [attr.aria-pressed]="showPassword()"
                    (click)="showPassword.set(!showPassword())"
                  >
                    @if (showPassword()) {
                      <svg lucideEyeOff aria-hidden="true" />
                    } @else {
                      <svg lucideEye aria-hidden="true" />
                    }
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
                    Forgot Password?
                  </button>
                </div>
              }

              <button class="auth-submit" type="submit" [disabled]="busy()">
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
                <button class="link-inline" type="button" (click)="setMode('register')">Sign up</button>
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
  styles: [
    `
      :host {
        display: block;
      }

      /* Page. Escapes main's 1280px cap so the canvas reaches both window edges
         while the card still centres on the page. min-height rather than height,
         so a short laptop scrolls the card instead of clipping it. */
      .auth-screen {
        margin-inline: calc(50% - 50vw);
        padding-inline: var(--wrap-x);
        min-height: calc(100svh - var(--header-h));
        display: grid;
        place-items: center;
        background: var(--canvas);
      }

      .auth-card {
        width: 100%;
        max-width: 960px;
        display: grid;
        grid-template-columns: 1fr;
        border-radius: 28px;
        overflow: hidden;
        background: var(--card);
        box-shadow:
          0 30px 70px -22px rgb(28 27 27 / 0.3),
          0 8px 24px -14px rgb(28 27 27 / 0.18);
      }

      /* ---------- branded half ---------- */
      /* No overflow:hidden here on purpose. The seam photo is meant to overhang
         into the white panel; the card is what clips, at its own rounded edge. */
      .auth-brand {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 36px;
        /* Brand dark (#14110e is the base this page already used), a shade
           lighter at the top. */
        background: linear-gradient(160deg, #1f1a14 0%, #14110e 55%, #100d0b 100%);
        color: #fff;
      }

      /* Blurred ellipses standing in for cloud shapes: pure CSS, no asset. */
      .auth-brand__cloud {
        position: absolute;
        border-radius: 50%;
        filter: blur(26px);
        pointer-events: none;
      }
      .auth-brand__cloud--a {
        width: 210px;
        height: 150px;
        top: -46px;
        left: -34px;
        background: rgb(255 255 255 / 0.07);
      }
      .auth-brand__cloud--b {
        width: 180px;
        height: 130px;
        top: 26px;
        right: -56px;
        background: rgb(201 162 75 / 0.12);
      }
      .auth-brand__cloud--c {
        width: 200px;
        height: 140px;
        top: 118px;
        left: 52px;
        background: rgb(255 255 255 / 0.045);
      }

      .auth-brand__copy {
        position: relative;
        z-index: 2;
      }
      .auth-brand__hello {
        margin: 0;
        font-family: 'Oswald', sans-serif;
        font-weight: 700;
        font-size: clamp(2.4rem, 5.2vw, 3.5rem);
        line-height: 0.9;
        color: #fff;
        text-shadow: 0 10px 30px rgb(0 0 0 / 0.45);
      }
      .auth-brand__name {
        margin: 0.6rem 0 0;
        font-size: 1.125rem;
        font-weight: 700;
        letter-spacing: 0.25em;
        text-transform: uppercase;
        color: var(--primary-fill);
      }
      /* Capped narrower than the copy block so the sentence can never run under
         the seam photo, whatever the panel width does. */
      .auth-brand__lede {
        margin: 0.85rem 0 0;
        max-width: 240px;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: rgb(255 255 255 / 0.78);
      }

      .auth-brand__photo {
        position: absolute;
        z-index: 3;
        border-radius: 50%;
        object-fit: cover;
        box-shadow: 0 18px 44px -12px rgb(0 0 0 / 0.6);
      }
      /* Centred on the seam, so half sits over the dark panel and half over the
         white form. */
      .auth-brand__photo--seam {
        width: 152px;
        height: 152px;
        right: -76px;
        top: 40%;
        transform: translateY(-50%);
        border: 3px solid rgb(255 255 255 / 0.85);
      }
      /* Anchored past the bottom-left corner; the card's own overflow clips it. */
      .auth-brand__photo--corner {
        width: 198px;
        height: 198px;
        left: -66px;
        bottom: -74px;
        border: 3px solid rgb(255 255 255 / 0.22);
      }
      .auth-brand__dot {
        position: absolute;
        z-index: 1;
        left: 44%;
        bottom: 28px;
        width: 106px;
        height: 106px;
        border-radius: 50%;
        background: rgb(255 255 255 / 0.12);
      }

      /* ---------- form half ---------- */
      .auth-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 40px 48px 26px;
        background: var(--card);
      }
      .auth-logo {
        display: block;
        line-height: 0;
      }
      .auth-logo img {
        height: 60px;
        width: auto;
      }
      .auth-heading {
        margin: 1.1rem 0 0;
        font-family: 'Oswald', sans-serif;
        font-weight: 600;
        font-size: 2rem;
        line-height: 1.1;
        color: var(--ink);
      }
      .auth-sub {
        margin: 0.35rem 0 0;
        font-size: 0.8125rem;
        color: var(--muted);
      }

      .auth-form {
        width: 100%;
        max-width: 340px;
        margin-top: 1.6rem;
      }
      .auth-field {
        margin-bottom: 16px;
      }
      /* Labels are in the markup for screen readers; the design shows the
         placeholder inside the field instead. The global .sr-only is nested
         inside .m-row3, so it cannot be used from here. */
      .auth-sr {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      .auth-input {
        position: relative;
        display: block;
      }
      .auth-input__icon {
        position: absolute;
        left: 15px;
        top: 50%;
        transform: translateY(-50%);
        width: 18px;
        height: 18px;
        color: var(--muted);
        pointer-events: none;
      }
      .auth-input input {
        display: block;
        width: 100%;
        height: 48px;
        padding: 0 16px 0 44px;
        font: inherit;
        font-size: 0.9375rem;
        color: var(--ink);
        background: #f5f5f4;
        /* No visible edge at rest; the ring appears on focus. */
        border: 1px solid transparent;
        border-radius: 14px;
        transition:
          border-color var(--dur-1) var(--ease-out),
          box-shadow var(--dur-1) var(--ease-out),
          background-color var(--dur-1) var(--ease-out);
      }
      .auth-input--plain input {
        padding-left: 16px;
      }
      .auth-input input::placeholder {
        color: #9a9490;
      }
      .auth-input input:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 1px;
        background: var(--card);
      }
      .auth-input input[aria-invalid='true'] {
        border-color: var(--danger);
      }

      /* Password field: the eye toggle sits inside, so the text must not run
         under it. */
      .input-affix {
        position: relative;
      }
      .input-affix input {
        padding-right: 48px;
      }
      .affix-btn {
        position: absolute;
        top: 50%;
        right: 6px;
        transform: translateY(-50%);
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        padding: 0;
        background: none;
        border: 0;
        border-radius: 10px;
        color: var(--muted);
        cursor: pointer;
      }
      .affix-btn svg {
        width: 18px;
        height: 18px;
      }
      .affix-btn:hover {
        color: var(--ink);
        background: rgb(28 27 27 / 0.05);
      }
      .affix-btn:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 1px;
      }

      .auth-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 2px 0 18px;
      }
      .auth-check {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--muted);
        cursor: pointer;
      }
      .auth-check input {
        width: 16px;
        height: 16px;
        min-height: 0;
        margin: 0;
        accent-color: var(--primary);
        cursor: pointer;
      }
      .auth-check:focus-within {
        outline: 2px solid var(--primary);
        outline-offset: 3px;
        border-radius: 4px;
      }

      .auth-submit {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
        height: 48px;
        padding: 0;
        border: 0;
        border-radius: 12px;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 700;
        /* Gold fill carries dark ink rather than white: white on #c9a24b is
           about 2.1:1 and fails AA outright, while the project's own token pair
           (--primary-fill on --on-primary) measures 6.9:1. */
        background: var(--primary-fill);
        color: var(--on-primary);
        cursor: pointer;
        transition: filter var(--dur-1) var(--ease-out);
      }
      .auth-submit:hover:not(:disabled) {
        filter: brightness(0.96);
      }
      .auth-submit:disabled {
        background: #e6dcc4;
        color: #8d8574;
        cursor: not-allowed;
      }

      .auth-spinner {
        width: 15px;
        height: 15px;
        flex: none;
        border-radius: 50%;
        border: 2px solid rgb(28 27 27 / 0.28);
        border-top-color: var(--on-primary);
        animation: auth-spin 0.7s linear infinite;
      }
      @keyframes auth-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .auth-error,
      .auth-info {
        margin: 12px 0 0;
        padding: 10px 12px;
        border-radius: 12px;
        font-size: 0.8125rem;
        line-height: 1.45;
        text-align: left;
      }
      .auth-error {
        color: var(--danger);
        background: rgb(186 26 26 / 0.07);
        border: 1px solid rgb(186 26 26 / 0.28);
      }
      .auth-info {
        color: var(--ok);
        background: rgb(27 127 59 / 0.07);
        border: 1px solid rgb(27 127 59 / 0.28);
      }
      .field-error {
        margin: 6px 0 0;
        font-size: 0.78125rem;
        color: var(--danger);
      }
      .field-hint {
        margin: 6px 0 0;
        font-size: 0.75rem;
        color: var(--muted);
      }

      .auth-divider {
        display: flex;
        align-items: center;
        gap: 14px;
        margin: 22px 0 12px;
        color: var(--muted);
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      .auth-divider::before,
      .auth-divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--line);
      }
      .auth-switch {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--muted);
      }
      .auth-trust {
        margin-top: 22px;
      }
      .auth-fine {
        margin: 14px 0 0;
        text-align: center;
        font-size: 0.75rem;
        color: var(--muted);
      }

      /* ---------- breakpoints ---------- */
      /* Split only where the panel is actually rendered, so the CSS and the
         viewport signal that gates the markup agree at the same 900px. */
      @media (min-width: 900px) {
        .auth-card {
          grid-template-columns: 46% 54%;
        }
      }

      /* Narrow desktops: card fills, circles and headline scale down so nothing
         overhangs the card edges or collides with the copy block. */
      @media (max-width: 1100px) {
        .auth-brand {
          padding: 30px;
        }
        .auth-brand__photo--seam {
          width: 124px;
          height: 124px;
          right: -62px;
        }
        .auth-brand__photo--corner {
          width: 160px;
          height: 160px;
          left: -54px;
          bottom: -60px;
        }
        .auth-brand__dot {
          width: 88px;
          height: 88px;
        }
        .auth-panel {
          padding: 36px 32px 24px;
        }
      }

      @media (max-width: 899px) {
        .auth-panel {
          padding: 24px;
        }
        .auth-logo img {
          height: 52px;
        }
        .auth-form {
          max-width: 380px;
        }
      }

      @media (max-width: 480px) {
        .auth-row {
          flex-wrap: wrap;
          gap: 4px 12px;
        }
        .auth-heading {
          font-size: 1.75rem;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .auth-spinner {
          animation-duration: 2.4s;
        }
        .auth-input input,
        .affix-btn,
        .auth-submit {
          transition: none;
        }
      }
    `,
  ],
})
export class AccountPage implements OnInit {
  readonly api = inject(ApiService);
  private readonly wishlist = inject(WishlistService);
  /** Read by the template to gate the branded half, so it cannot be private. */
  protected readonly viewport = inject(ViewportService);
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
