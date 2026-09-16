import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../api.service';

/** Landing point for the emailed reset link (?token=…). */
@Component({
  selector: 'app-reset-password',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <form class="auth-box" (ngSubmit)="submit()">
      <h1>Set a new password</h1>
      @if (!token) {
        <p class="error">This reset link is incomplete — request a new one from your <a routerLink="/account">account page</a>.</p>
      } @else if (done()) {
        <p class="success">{{ done() }}</p>
        <a class="cta" routerLink="/account">Sign in</a>
      } @else {
        <label>
          New password (min 8 characters)
          <input type="password" [(ngModel)]="password" name="password" required minlength="8" autocomplete="new-password" />
        </label>
        <button class="cta" type="submit" [disabled]="password.length < 8">Update password</button>
        @if (error()) { <p class="error">{{ error() }}</p> }
      }
    </form>
  `,
})
export class ResetPasswordPage {
  private readonly api = inject(ApiService);
  readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';
  readonly done = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  password = '';

  submit(): void {
    this.error.set(null);
    this.api.resetPassword(this.token, this.password).subscribe({
      next: (res) => this.done.set(res.message),
      error: (err) =>
        this.error.set(err?.error?.message ?? 'Reset failed — the link may have expired.'),
    });
  }
}
