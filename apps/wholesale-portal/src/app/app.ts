import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ApiService } from './api.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink],
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
        <form class="panel auth" (ngSubmit)="signIn()">
          <h1>Wholesale sign in</h1>
          <label>Email <input type="email" [(ngModel)]="email" name="email" required /></label>
          <label>Password <input type="password" [(ngModel)]="password" name="password" required /></label>
          <button class="cta" type="submit">Sign in</button>
          @if (error()) { <p class="error">{{ error() }}</p> }
        </form>
      } @else {
        <router-outlet />
      }
    </main>
  `,
})
export class App {
  readonly api = inject(ApiService);
  readonly error = signal<string | null>(null);
  email = '';
  password = '';

  signIn(): void {
    this.api.login(this.email, this.password).subscribe({
      next: () => this.error.set(null),
      error: () => this.error.set('Sign-in failed — check your credentials.'),
    });
  }

  logout(): void {
    this.api.logout();
  }
}
