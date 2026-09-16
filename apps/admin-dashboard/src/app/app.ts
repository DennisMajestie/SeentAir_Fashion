import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from './api.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (!api.isLoggedIn) {
      <main class="login-wrap">
        <form class="panel auth" (ngSubmit)="signIn()">
          <h1>SEENTAIR <em>Operations</em></h1>
          <label>Email <input type="email" [(ngModel)]="email" name="email" required /></label>
          <label>Password <input type="password" [(ngModel)]="password" name="password" required /></label>
          <button class="cta" type="submit">Sign in</button>
          @if (error()) { <p class="error">{{ error() }}</p> }
        </form>
      </main>
    } @else {
      <div class="layout">
        <aside class="sidebar">
          <span class="logo">SEENTAIR<br /><em>Operations</em></span>
          <nav>
            <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Dashboard</a>
            <a routerLink="/approvals" routerLinkActive="active">Approvals</a>
            <a routerLink="/production" routerLinkActive="active">Production</a>
            <a routerLink="/orders" routerLinkActive="active">Orders</a>
            <a routerLink="/returns" routerLinkActive="active">Returns</a>
            <a routerLink="/audit" routerLinkActive="active">Audit log</a>
          </nav>
          <button class="link" (click)="logout()">Sign out</button>
        </aside>
        <main>
          <router-outlet />
        </main>
      </div>
    }
  `,
})
export class App {
  readonly api = inject(ApiService);
  readonly error = signal<string | null>(null);
  email = '';
  password = '';

  signIn(): void {
    this.api.login(this.email, this.password).subscribe({
      next: (tokens) => {
        this.api.storeToken(tokens.accessToken);
        this.error.set(null);
      },
      error: () => this.error.set('Sign-in failed — staff accounts only.'),
    });
  }

  logout(): void {
    this.api.logout();
  }
}
