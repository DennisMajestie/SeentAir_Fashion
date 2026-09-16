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
        @if (!challengeToken()) {
          <form class="panel auth" (ngSubmit)="signIn()">
            <h1>SEENTAIR <em>Operations</em></h1>
            <label>Email <input type="email" [(ngModel)]="email" name="email" required /></label>
            <label>Password <input type="password" [(ngModel)]="password" name="password" required autocomplete="current-password" /></label>
            <button class="cta" type="submit">Sign in</button>
            @if (error()) { <p class="error">{{ error() }}</p> }
          </form>
        } @else {
          <form class="panel auth" (ngSubmit)="submitCode()">
            <h1>Two-factor check</h1>
            <p class="muted">Enter the 6-digit code from your authenticator app.</p>
            <label>Code <input [(ngModel)]="code" name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code" /></label>
            <button class="cta" type="submit">Verify</button>
            <button class="link" type="button" (click)="challengeToken.set(null)">Back</button>
            @if (error()) { <p class="error">{{ error() }}</p> }
          </form>
        }
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
            <a routerLink="/security" routerLinkActive="active">Security</a>
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
  readonly challengeToken = signal<string | null>(null);
  email = '';
  password = '';
  code = '';

  signIn(): void {
    this.error.set(null);
    this.api.login(this.email, this.password).subscribe({
      next: (res) => {
        if (res.requires2fa && res.challengeToken) {
          this.challengeToken.set(res.challengeToken);
        }
        // Token storage is handled by ApiService (in memory + httpOnly cookie).
      },
      error: () => this.error.set('Sign-in failed — staff accounts only.'),
    });
  }

  submitCode(): void {
    const token = this.challengeToken();
    if (!token) return;
    this.error.set(null);
    this.api.verify2fa(token, this.code).subscribe({
      next: () => {
        this.challengeToken.set(null);
        this.code = '';
      },
      error: () => this.error.set('Incorrect or expired code.'),
    });
  }

  logout(): void {
    this.api.logout();
  }
}
