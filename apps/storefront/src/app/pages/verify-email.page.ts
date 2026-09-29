import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../api.service';

/**
 * Lands from the confirmation email. Confirming the address is what lets the
 * API attach any order placed as a guest with it, so this page's real job is to
 * report how many orders just moved into the account.
 */
@Component({
  selector: 'app-verify-email',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="auth-wrap">
      <h1 class="page-title">Confirming your email</h1>

      @if (state() === 'working') {
        <p class="muted">One moment…</p>
      }

      @if (state() === 'done') {
        <div class="notice notice-ok u-rise" role="status">
          <span>
            <span class="notice-title">Email confirmed</span>
            @if (claimed() > 0) {
              {{ claimed() }} order{{ claimed() === 1 ? '' : 's' }} you placed as a guest
              {{ claimed() === 1 ? 'is' : 'are' }} now in your account.
            } @else {
              Your account is ready.
            }
          </span>
        </div>
        <p class="cta-wrap">
          <a class="cta" routerLink="/account">View my orders</a>
        </p>
      }

      @if (state() === 'failed') {
        <div class="notice notice-error u-rise" role="alert">
          <span>
            <span class="notice-title">That link did not work</span>
            {{ error() }}
          </span>
        </div>
        <form class="auth-box" (ngSubmit)="resend()">
          <label
            >Send a new link to
            <input
              type="email"
              name="email"
              [value]="email()"
              (input)="email.set($any($event.target).value)"
              placeholder="you@example.com"
              required
            />
          </label>
          <button class="cta" type="submit" [disabled]="resent()">
            {{ resent() ? 'Sent — check your inbox' : 'Send a new link' }}
          </button>
        </form>
      }
    </div>
  `,
})
export class VerifyEmailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<'working' | 'done' | 'failed'>('working');
  readonly claimed = signal(0);
  readonly error = signal('');
  readonly email = signal('');
  readonly resent = signal(false);

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set('failed');
      this.error.set('The link is missing its confirmation code.');
      return;
    }
    this.api.verifyEmail(token).subscribe({
      next: (res) => {
        this.claimed.set(res.ordersClaimed);
        this.state.set('done');
      },
      error: (err) => {
        this.state.set('failed');
        this.error.set(
          err?.error?.message ?? 'It may have expired or already been used. Ask for a new one.',
        );
      },
    });
  }

  /** Enumeration-safe on the API: the response never reveals whether the address exists. */
  resend(): void {
    const address = this.email().trim();
    if (!address) return;
    this.api.resendVerification(address).subscribe({ next: () => this.resent.set(true) });
  }
}
