import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { CartService } from '../cart.service';

@Component({
  selector: 'app-checkout',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <h1>Checkout</h1>
    @if (cart.items().length === 0) {
      <p class="muted">Nothing to check out. <a routerLink="/">Back to the shop</a></p>
    } @else {
      <p class="total">Order total: <strong>₦{{ cart.total | number: '1.0-2' }}</strong></p>

      @if (!api.isLoggedIn) {
        <section class="auth-box">
          <h2>Sign in to continue</h2>
          <p class="muted small">One short step — full payment upfront, then you can track everything.</p>
          <form (ngSubmit)="signIn()">
            @if (mode() === 'register') {
              <label>Name <input [(ngModel)]="name" name="name" required /></label>
              <label>Phone (for delivery updates) <input [(ngModel)]="phone" name="phone" /></label>
            }
            <label>Email <input type="email" [(ngModel)]="email" name="email" required /></label>
            <label>Password <input type="password" [(ngModel)]="password" name="password" required minlength="8" /></label>
            <button class="cta" type="submit">
              {{ mode() === 'login' ? 'Sign in' : 'Create account' }}
            </button>
          </form>
          <button class="link" (click)="toggleMode()">
            {{ mode() === 'login' ? 'New here? Create an account' : 'Have an account? Sign in' }}
          </button>
        </section>
      } @else {
        <button class="cta" (click)="placeOrder()" [disabled]="placing()">
          {{ placing() ? 'Placing order…' : 'Place order & pay' }}
        </button>
      }

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
      @if (orderId()) {
        <section class="success-box">
          <h2>Order placed ✔</h2>
          <p>Order reference: <code>{{ orderId() }}</code></p>
          @if (paystackUrl()) {
            <a class="cta" [href]="paystackUrl()!">Pay now with Paystack</a>
          } @else {
            <p>
              Online payment is not available right now. Your order is reserved —
              pay by <strong>bank transfer, cash, or POS</strong> and our team will confirm it.
              You can follow progress on your <a routerLink="/account">account page</a>.
            </p>
          }
        </section>
      }
    }
  `,
})
export class CheckoutPage {
  readonly cart = inject(CartService);
  readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly mode = signal<'login' | 'register'>('login');
  readonly placing = signal(false);
  readonly error = signal<string | null>(null);
  readonly orderId = signal<string | null>(null);
  readonly paystackUrl = signal<string | null>(null);

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
    const done = (tokens: { accessToken: string; refreshToken: string }) => {
      this.api.storeTokens(tokens);
    };
    if (this.mode() === 'login') {
      this.api.login(this.email, this.password).subscribe({
        next: done,
        error: () => this.error.set('Sign-in failed — check your email and password.'),
      });
    } else {
      this.api.register(this.name, this.email, this.phone, this.password).subscribe({
        next: done,
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
        this.cart.clear();
        // Try Paystack; if not configured the offline instructions show instead.
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
