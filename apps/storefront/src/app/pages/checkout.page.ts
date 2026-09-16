import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { CartService } from '../cart.service';

/** Checkout — Stitch two-column layout: manifest + sign-in left,
    sticky "order summary" matrix with acid total and Paystack CTA right. */
@Component({
  selector: 'app-checkout',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <p class="page-kicker">Checkout stage 02 // Final payment</p>
    <h1 class="page-title">Cart & checkout</h1>
    @if (cart.items().length === 0 && !orderId()) {
      <p class="muted">Nothing to check out. <a routerLink="/shop">Back to the shop</a></p>
    } @else {
      <div class="checkout-cols">
        <div>
          @if (!orderId()) {
            <p class="section-label">Order manifest <span class="count">[{{ cart.count | number: '2.0' }} items]</span></p>
            @for (item of cart.items(); track item.variantId) {
              <div class="manifest-row">
                <div class="m-body">
                  <p class="sku-line">{{ item.sku }}</p>
                  <p class="m-name">{{ item.productName }}</p>
                  <p class="muted small">{{ item.size || '—' }} / {{ item.colour || '—' }} × {{ item.quantity }}</p>
                </div>
                <span class="m-price">₦{{ item.unitPrice * item.quantity | number: '1.0-2' }}</span>
              </div>
            }

            @if (!api.isLoggedIn) {
              <p class="section-label">Your details</p>
              <form class="auth-box" style="max-width:100%" (ngSubmit)="signIn()">
                @if (mode() === 'register') {
                  <label>Full name <input [(ngModel)]="name" name="name" required placeholder="e.g. Kojo Mensah" /></label>
                  <label>Phone (delivery updates) <input [(ngModel)]="phone" name="phone" placeholder="+234 800 000 0000" /></label>
                }
                <label>Email <input type="email" [(ngModel)]="email" name="email" required placeholder="you@example.com" /></label>
                <label>Password <input type="password" [(ngModel)]="password" name="password" required minlength="8" [attr.autocomplete]="mode() === 'register' ? 'new-password' : 'current-password'" /></label>
                <button class="cta" type="submit">{{ mode() === 'login' ? 'Sign in' : 'Create account' }}</button>
                <button class="link" type="button" (click)="toggleMode()">
                  {{ mode() === 'login' ? 'New here? Create an account' : 'Have an account? Sign in' }}
                </button>
              </form>
            }
          } @else {
            <section class="success-box" style="max-width:100%">
              <h2>Order placed ✔</h2>
              <p class="sku-line">Reference // {{ orderId() }}</p>
              @if (paystackUrl()) {
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
          }
          @if (error()) { <p class="error">{{ error() }}</p> }
        </div>

        @if (!orderId()) {
          <aside class="matrix-panel">
            <p class="section-label" style="margin-top:0">Order summary</p>
            <div class="matrix-row"><span>Subtotal</span><span>₦{{ cart.total | number: '1.0-2' }}</span></div>
            <div class="matrix-row"><span>Payment policy</span><span>full, upfront</span></div>
            <div class="matrix-row"><span>Delivery</span><span>quoted at dispatch</span></div>
            <div class="matrix-total">
              <span class="label">Total due</span>
              <span class="value">₦{{ cart.total | number: '1.0-0' }}</span>
            </div>
            <button class="cta" (click)="placeOrder()" [disabled]="!api.isLoggedIn || placing()">
              {{ placing() ? 'Placing order…' : api.isLoggedIn ? 'Place order & pay' : 'Sign in to continue' }}
            </button>
            <div class="settlement-box">
              Paystack (card/bank) — or pay offline by <strong>bank transfer / cash / POS</strong>,
              confirmed by our team.
            </div>
          </aside>
        }
      </div>
    }
  `,
})
export class CheckoutPage {
  readonly cart = inject(CartService);
  readonly api = inject(ApiService);

  readonly mode = signal<'login' | 'register'>('login');
  readonly placing = signal(false);
  readonly error = signal<string | null>(null);
  readonly orderId = signal<string | null>(null);
  readonly paystackUrl = signal<string | null>(null);
  readonly paidTotal = signal(0);

  name = '';
  phone = '';
  email = '';
  password = '';

  toggleMode(): void {
    this.mode.set(this.mode() === 'login' ? 'register' : 'login');
    this.error.set(null);
  }

  signIn(): void {
    this.error.set(null);
    if (this.mode() === 'login') {
      this.api.login(this.email, this.password).subscribe({
        error: () => this.error.set('Sign-in failed — check your email and password.'),
      });
    } else {
      this.api.register(this.name, this.email, this.phone, this.password).subscribe({
        error: (err) =>
          this.error.set(err?.error?.message ?? 'Registration failed — try a different email.'),
      });
    }
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
          error: () => this.placing.set(false),
        });
      },
      error: (err) => {
        this.placing.set(false);
        this.error.set(err?.error?.message ?? 'Could not place the order.');
      },
    });
  }
}
