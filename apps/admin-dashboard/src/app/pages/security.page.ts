import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

/** Staff self-service 2FA enrolment — recommended for every internal account. */
@Component({
  selector: 'app-security',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Account security</h1>
    @if (me(); as profile) {
      <section class="panel">
        <p>
          Signed in as <strong>{{ profile.name }}</strong>
          (<code>{{ profile.role }}</code>) — two-factor authentication is
          <strong [class.success]="profile.totpEnabled" [class.error]="!profile.totpEnabled">
            {{ profile.totpEnabled ? 'ON' : 'OFF' }}
          </strong>
        </p>

        @if (!profile.totpEnabled) {
          @if (!setup()) {
            <p class="muted">
              Add a second factor: after setup, signing in also requires a 6-digit code from an
              authenticator app (Google Authenticator, Authy, 1Password…). Strongly recommended
              for every staff account.
            </p>
            <button class="cta" (click)="startSetup()">Set up 2FA</button>
          } @else {
            <ol class="muted small">
              <li>In your authenticator app choose "Add account" → "Enter key manually".</li>
              <li>Account name: your Seentair email. Key: the secret below.</li>
              <li>Enter the 6-digit code the app shows to finish.</li>
            </ol>
            <p>Secret: <code>{{ setup()!.secret }}</code></p>
            <p class="muted small">Or open this link on a device with your authenticator: <code>{{ setup()!.otpauthUrl }}</code></p>
            <form (ngSubmit)="enable()">
              <label class="inline">Code <input [(ngModel)]="code" name="code" inputmode="numeric" maxlength="6" required /></label>
              <button class="cta small" type="submit">Activate 2FA</button>
            </form>
          }
        } @else {
          <p class="muted">Disabling requires a current code and signs out all sessions.</p>
          <form (ngSubmit)="disable()">
            <label class="inline">Code <input [(ngModel)]="code" name="code" inputmode="numeric" maxlength="6" required /></label>
            <button class="danger small" type="submit">Disable 2FA</button>
          </form>
        }
        @if (message()) { <p class="success">{{ message() }}</p> }
        @if (error()) { <p class="error">{{ error() }}</p> }
      </section>
    }
  `,
})
export class SecurityPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly me = signal<{ name: string; role: string; totpEnabled: boolean } | null>(null);
  readonly setup = signal<{ secret: string; otpauthUrl: string } | null>(null);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  code = '';

  ngOnInit(): void {
    this.refresh();
  }

  private refresh(): void {
    this.api.me().subscribe((profile) => this.me.set(profile));
  }

  startSetup(): void {
    this.error.set(null);
    this.api.setup2fa().subscribe({
      next: (res) => this.setup.set(res),
      error: (err) => this.error.set(err?.error?.message ?? 'Setup failed.'),
    });
  }

  enable(): void {
    this.error.set(null);
    this.api.enable2fa(this.code).subscribe({
      next: () => {
        this.message.set('2FA is on — your next sign-in will ask for a code.');
        this.setup.set(null);
        this.code = '';
        this.refresh();
      },
      error: (err) => this.error.set(err?.error?.message ?? 'Incorrect code.'),
    });
  }

  disable(): void {
    this.error.set(null);
    this.api.disable2fa(this.code).subscribe({
      next: () => {
        this.message.set('2FA disabled. All sessions were signed out.');
        this.code = '';
        this.refresh();
      },
      error: (err) => this.error.set(err?.error?.message ?? 'Incorrect code.'),
    });
  }
}
