import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Order } from '../api.service';

@Component({
  selector: 'app-account',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <h1>Your account</h1>
    @if (!api.isLoggedIn) {
      <form class="auth-box" (ngSubmit)="signIn()">
        <h2>Sign in</h2>
        <label>Email <input type="email" [(ngModel)]="email" name="email" required /></label>
        <label>Password <input type="password" [(ngModel)]="password" name="password" required /></label>
        <button class="cta" type="submit">Sign in</button>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </form>
    } @else {
      <button class="link" (click)="logout()">Sign out</button>
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
  readonly error = signal<string | null>(null);
  email = '';
  password = '';

  ngOnInit(): void {
    if (this.api.isLoggedIn) this.loadOrders();
  }

  signIn(): void {
    this.api.login(this.email, this.password).subscribe({
      next: (tokens) => {
        this.api.storeTokens(tokens);
        this.loadOrders();
      },
      error: () => this.error.set('Sign-in failed.'),
    });
  }

  logout(): void {
    this.api.logout();
    this.orders.set([]);
  }

  private loadOrders(): void {
    this.api.myOrders().subscribe((res) => this.orders.set(res.data));
  }
}
