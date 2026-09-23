import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { CartService } from '../cart.service';

/** Checkout — Stitch approved screen, stages 02 "Final payment" and
    03 "Order placed": manifest with thumbnails, condition-gated policy
    notices, summary card (dashed divider + gradient total), sign-in,
    sticky CTA footer with in-flight spinner, safe-area + WCAG AA. */
@Component({
  selector: 'app-checkout',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="stage-bar u-rise">
      <div class="stage-label-line">
        <b>{{ orderId() ? 'Stage 03 · Order placed' : 'Stage 02 · Final payment' }}</b>
        <span>Step {{ orderId() ? 3 : 2 }} of 3</span>
      </div>
      <div class="stage-segs" role="progressbar"
           [attr.aria-label]="orderId() ? 'Checkout progress, step 3 of 3' : 'Checkout progress, step 2 of 3'"
           aria-valuemin="1" aria-valuemax="3" [attr.aria-valuenow]="orderId() ? 3 : 2">
        <span class="seg on"></span><span class="seg on"></span><span class="seg" [class.on]="!!orderId()"></span>
      </div>
    </div>
    <h1 class="page-title">Cart & checkout</h1>

    @if (orderId()) {
      <section class="success-box u-rise" style="max-width:520px">
        <h2>Order placed</h2>
        <p class="sku-line">Reference // {{ orderId() }}</p>
        @if (paystackUrl()) {
          <p class="muted small">Final payment due — settle online or offline below.</p>
          <a class="cta" [href]="paystackUrl()!">Pay with Paystack [₦{{ paidTotal() | number: '1.0-0' }}]</a>
        } @else {
          <div class="settlement-box">
            <strong>Direct settlement.</strong> Online payment is not available right now.
            Your order is reserved — pay the exact total by <strong>bank transfer, cash, or POS</strong>
            and our team will confirm it. No part-payments.
          </div>
        }
        <p class="small"><a routerLink="/account">Track it from your account →</a></p>
      </section>
    } @else if (cart.items().length === 0) {
      <div class="cart-empty u-rise">
        <p class="muted" style="margin:0">Nothing to check out.</p>
        <a class="cta" routerLink="/shop">Back to the shop</a>
      </div>
    } @else {
      @if (cart.moqEligible) {
        <div class="notice notice-warn u-rise" role="status">
          <svg class="notice-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M10 2.2 18.4 17H1.6L10 2.2Zm0 4-1.2 6h2.4L10 6.2Zm0 8.1a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" />
          </svg>
          <span>
            <span class="notice-title">Wholesale eligibility</span>
            {{ cart.count | number: '2.0' }} units meets the 20-unit MOQ — tiered wholesale
            pricing and bulk dispatch apply via the wholesale portal. This retail order is
            final at the retail rate.
          </span>
        </div>
      }
      @if (cart.hasMadeToOrder) {
        <div class="notice notice-warn u-rise" role="status">
          <svg class="notice-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M9 2.5 1.8 15.5A1 1 0 0 0 2.8 17h14.4a1 1 0 0 0 1-1.5L11 2.5a1 1 0 0 0-2 0Z" />
            <path d="M10 7v4M10 13.5h.01" />
          </svg>
          <span>
            <span class="notice-title">Made to order</span>
            One or more pieces are produced on request — sample approval and a
            production run happen before dispatch, so allow extra time.
          </span>
        </div>
      }

      @if (error()) {
        <div class="notice notice-error u-rise" role="alert">
          <svg class="notice-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false">
            <circle cx="10" cy="10" r="8.2" />
            <path d="M10 5.6v5.4M10 13.9h.01" stroke-linecap="round" />
          </svg>
          <span>{{ error() }}</span>
        </div>
      }

      <div class="checkout-cols">
        <div class="u-rise">
          <p class="section-label">Order manifest <span class="count">[{{ cart.count | number: '2.0' }} items]</span></p>
          @for (item of cart.items(); track item.variantId) {
            <div class="manifest-row">
              @if (item.imageUrl) {
                <img class="m-thumb" [src]="item.imageUrl" [alt]="item.productName" loading="lazy" />
              } @else {
                <div class="m-thumb m-thumb-monogram" aria-hidden="true">{{ item.productName.charAt(0) }}</div>
              }
              <div class="m-body">
                <p class="sku-line">{{ item.sku }}</p>
                <p class="m-name">{{ item.productName }}</p>
                <p class="muted small">{{ item.size || '—' }} / {{ item.colour || '—' }} × {{ item.quantity }}</p>
              </div>
              <span class="m-price">₦{{ item.unitPrice * item.quantity | number: '1.0-2' }}</span>
            </div>
          }

          @if (!api.isLoggedIn) {
            <div #details class="checkout-details">
              <p class="section-label">Your details</p>
              <form class="auth-box checkout-auth" (ngSubmit)="signIn()">
                @if (mode() === 'register') {
                  <label>Full name <input [(ngModel)]="name" name="name" required placeholder="e.g. Kojo Mensah" /></label>
                  <label>Phone (delivery updates) <input [(ngModel)]="phone" name="phone" placeholder="+234 800 000 0000" /></label>
                }
                <label>Email <input type="email" [(ngModel)]="email" name="email" required placeholder="you@example.com" /></label>
                <label>Password <input type="password" [(ngModel)]="password" name="password" required minlength="8"
                  [attr.autocomplete]="mode() === 'register' ? 'new-password' : 'current-password'" /></label>
                <button class="cta" type="submit">{{ mode() === 'login' ? 'Sign in' : 'Create account' }}</button>
                <button class="link" type="button" (click)="toggleMode()">
                  {{ mode() === 'login' ? 'New here? Create an account' : 'Have an account? Sign in' }}
                </button>
              </form>
              @if (signinError()) {
                <div class="notice notice-error u-rise" role="alert">
                  <svg class="notice-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false">
                    <circle cx="10" cy="10" r="8.2" />
                    <path d="M10 5.6v5.4M10 13.9h.01" stroke-linecap="round" />
                  </svg>
                  <span>{{ signinError() }}</span>
                </div>
              }
            </div>
          }
        </div>

        <aside class="matrix-panel u-rise-1" aria-label="Order summary">
          <p class="section-label" style="margin-top:0">Order summary</p>
          <div class="matrix-row"><span>Subtotal</span><span>₦{{ cart.total | number: '1.0-2' }}</span></div>
          <div class="matrix-row"><span>Payment policy</span><span>full &amp; upfront</span></div>
          <div class="matrix-row"><span>Delivery</span><span>quoted at dispatch</span></div>
          <div class="matrix-divider"></div>
          <div class="matrix-total">
            <span class="label">Total due</span>
            <span class="value">₦{{ cart.total | number: '1.0-0' }}</span>
          </div>
          <div class="settlement-box">
            Paystack (card/bank) — or pay offline by <strong>bank transfer / cash / POS</strong>,
            confirmed by our team.
          </div>
        </aside>
      </div>

      <div class="sticky-cta u-rise-2">
        <div class="scta-inner">
          <span class="scta-trust">Final payment · secured by Paystack</span>
          <button class="cta" type="button" (click)="proceed()" [disabled]="placing()">
            @if (placing()) {
              <span class="btn-loading"><span class="spinner" aria-hidden="true"></span>Placing order…</span>
            } @else {
              {{ api.isLoggedIn ? 'Proceed to payment →' : 'Sign in to continue' }}
            }
          </button>
        </div>
      </div>
    }
  `,
})
export class CheckoutPage {
  readonly cart = inject(CartService);
  readonly api = inject(ApiService);
  private readonly details = viewChild<ElementRef<HTMLElement>>('details');

  readonly mode = signal<'login' | 'register'>('login');
  readonly placing = signal(false);
  readonly error = signal<string | null>(null);
  readonly signinError = signal<string | null>(null);
  readonly orderId = signal<string | null>(null);
  readonly paystackUrl = signal<string | null>(null);
  readonly paidTotal = signal(0);

  name = '';
  phone = '';
  email = '';
  password = '';

  toggleMode(): void {
    this.mode.set(this.mode() === 'login' ? 'register' : 'login');
    this.signinError.set(null);
  }

  signIn(): void {
    this.signinError.set(null);
    if (this.mode() === 'login') {
      this.api.login(this.email, this.password).subscribe({
        error: () => this.signinError.set('Sign-in failed — check your email and password.'),
      });
    } else {
      this.api.register(this.name, this.email, this.phone, this.password).subscribe({
        error: (err) =>
          this.signinError.set(err?.error?.message ?? 'Registration failed — try a different email.'),
      });
    }
  }

  proceed(): void {
    if (this.placing()) return;
    if (!this.api.isLoggedIn) {
      this.details()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    this.placeOrder();
  }

  placeOrder(): void {
    this.placing.set(true);
    this.error.set(null);
    const items = this.cart.items().map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    this.api.createOrder(items, 'storefront').subscribe({
      next: (order) => {
        this.orderId.set(order.id);
        this.paidTotal.set(order.totalAmount);
        this.cart.clear();
        this.api.payWithPaystack(order.id, order.totalAmount).subscribe({
          next: (res) => {
            this.paystackUrl.set(res.authorizationUrl);
            this.placing.set(false);
          },
          error: () => {
            this.placing.set(false);
            this.error.set('Order placed — but the payment link could not be created. Settle from your account.');
          },
        });
      },
      error: (err) => {
        this.placing.set(false);
        this.error.set(err?.error?.message ?? 'Could not place the order.');
      },
    });
  }
}