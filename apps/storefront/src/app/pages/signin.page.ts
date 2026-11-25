import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../api.service';

type Mode = 'signin' | 'register' | 'forgot';

/** Customer account entry: sign in, create an account, or request a reset link. */
@Component({
  selector: 'app-signin-page',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="auth">
      <h1 class="auth__title">{{ title() }}</h1>
      <p class="auth__lead">{{ lead() }}</p>

      @if (mode() === 'forgot') {
        <form class="auth__form" (ngSubmit)="requestReset()">
          <label class="auth__field">
            <span>Email</span>
            <input type="email" [(ngModel)]="email" name="email" required />
          </label>
          <button class="auth__submit" type="submit" [disabled]="busy() || !email.trim()">
            {{ busy() ? 'Sending…' : 'Send reset link' }}
          </button>
        </form>
        @if (info()) { <p class="auth__info" role="status">{{ info() }}</p> }
      } @else {
        <form class="auth__form" (ngSubmit)="submit()">
          @if (mode() === 'register') {
            <label class="auth__field">
              <span>Name</span>
              <input type="text" [(ngModel)]="name" name="name" required />
            </label>
            <label class="auth__field">
              <span>Phone (optional)</span>
              <input type="tel" [(ngModel)]="phone" name="phone" />
            </label>
          }
          <label class="auth__field">
            <span>Email</span>
            <input type="email" [(ngModel)]="email" name="email" required />
          </label>
          <label class="auth__field">
            <span>Password</span>
            <input type="password" [(ngModel)]="password" name="password" required minlength="8" />
          </label>
          <button class="auth__submit" type="submit" [disabled]="busy() || !email.trim() || password.length < 8">
            {{ busy() ? 'Working…' : mode() === 'register' ? 'Create account' : 'Sign in' }}
          </button>
        </form>
        @if (error()) { <p class="auth__error" role="alert">{{ error() }}</p> }
      }

      <div class="auth__links">
        @if (mode() === 'signin') {
          <button type="button" (click)="setMode('forgot')">Forgot password?</button>
          <button type="button" (click)="setMode('register')">Create an account</button>
        } @else {
          <button type="button" (click)="setMode('signin')">Back to sign in</button>
        }
        <a routerLink="/shop">Continue shopping</a>
      </div>
    </main>
  `,
  styles: `
    .auth { max-width: 420px; margin: 48px auto; padding: 24px; display: grid; gap: 16px; }
    .auth__title { font-size: 24px; font-weight: 700; margin: 0; }
    .auth__lead { color: var(--muted, #7b756a); font-size: 14px; margin: 0; }
    .auth__form { display: grid; gap: 12px; }
    .auth__field { display: grid; gap: 4px; font-size: 13px; font-weight: 600; }
    .auth__field input { height: 42px; padding: 0 12px; border: 1px solid var(--line, #e8e1d3); border-radius: 10px; }
    .auth__submit { height: 44px; border: 0; border-radius: 999px; background: var(--accent, #c88a12); color: #1a1405; font-weight: 700; cursor: pointer; }
    .auth__submit:disabled { opacity: .6; cursor: not-allowed; }
    .auth__error { color: var(--bad, #bf3a2d); font-size: 13px; margin: 0; }
    .auth__info { color: var(--good, #23804d); font-size: 13px; margin: 0; }
    .auth__links { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; }
    .auth__links button { border: 0; background: none; color: inherit; text-decoration: underline; cursor: pointer; padding: 0; }
  `,
})
export class SigninPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly mode = signal<Mode>('signin');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);

  name = '';
  email = '';
  phone = '';
  password = '';

  readonly title = () =>
    this.mode() === 'register'
      ? 'Create your account'
      : this.mode() === 'forgot'
        ? 'Reset your password'
        : 'Sign in';

  readonly lead = () =>
    this.mode() === 'register'
      ? 'Track orders and check out faster next time.'
      : this.mode() === 'forgot'
        ? 'We will email you a link to choose a new password.'
        : 'Welcome back to Seentair.';

  setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.info.set(null);
  }

  submit(): void {
    this.busy.set(true);
    this.error.set(null);
    const request =
      this.mode() === 'register'
        ? this.api.register(this.name.trim(), this.email.trim(), this.phone.trim(), this.password)
        : this.api.login(this.email.trim(), this.password);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigate(['/account']);
      },
      error: (err: { error?: { message?: string } }) => {
        this.busy.set(false);
        this.error.set(err?.error?.message ?? 'Sign-in failed. Check your details and try again.');
      },
    });
  }

  requestReset(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.forgotPassword(this.email.trim()).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.info.set(result.message ?? 'If the address is registered, a reset link is on its way.');
      },
      error: () => {
        this.busy.set(false);
        this.error.set('The reset request could not be sent. Try again.');
      },
    });
  }
}
