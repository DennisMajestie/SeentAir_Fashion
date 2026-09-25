import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';
import { PortalStore } from '../portal.store';
import { ThemeService } from '../theme.service';

/**
 * Investor Settings (sidebar item on every approved screen) — profile record,
 * two-step verification enrolment (live auth/2fa endpoints), terminal theme.
 */
@Component({
  selector: 'app-settings-page',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div class="page-head-main">
        <p class="page-kicker">Account Controls // Terminal Security</p>
        <h1 class="page-title">Investor Settings</h1>
        <p class="page-sub">
          Profile record, two-step hardware verification, and terminal preferences for this
          partner account.
        </p>
      </div>
    </div>

    <div class="split-half">
      <section class="panel">
        <div class="panel-head"><h2>Profile record</h2><span class="panel-note">Read-only</span></div>
        <div class="rail-rows">
          <div class="rail-row"><span>Account name</span><strong>{{ store.me()?.name ?? '—' }}</strong></div>
          <div class="rail-row"><span>Authorized email</span><strong class="mono">{{ store.me()?.email ?? '—' }}</strong></div>
          <div class="rail-row"><span>Role</span><strong>{{ roleLabel() }}</strong></div>
          @if (store.dash(); as d) {
            <div class="rail-row"><span>Equity</span><strong>{{ d.investmentInformation.equityPercentage }}% · {{ d.investmentInformation.shares | number }} shares</strong></div>
          }
        </div>
        <p class="gap-note" style="margin-top: 0.7rem">
          Registry changes (name, email, payout instrument) are made by Seentair's company
          secretary — contact the desk via Documents &amp; Messages.
        </p>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Two-step verification</h2>
          <span class="panel-note">
            @if (store.me()?.totpEnabled) { Enrolled } @else { Not enrolled }
          </span>
        </div>

        @if (store.me()?.totpEnabled) {
          <p class="sec-copy">
            Two-step hardware verification is <strong>active</strong> on this account. Every
            sign-in requires a rotating 6-digit code from your authenticator app.
          </p>
          <label class="field">
            Live code to disable
            <input type="text" inputmode="numeric" maxlength="6" [(ngModel)]="code" name="code" />
          </label>
          <button class="cta ghost" type="button" [disabled]="busy() || code.length < 6" (click)="disable()">
            Disable two-step verification
          </button>
        } @else if (setup(); as s) {
          <p class="sec-copy">
            Add this secret to your authenticator app, then confirm with a live code to activate.
          </p>
          <div class="secret-box mono">{{ s.secret }}</div>
          <label class="field">
            Live 6-digit code
            <input type="text" inputmode="numeric" maxlength="6" [(ngModel)]="code" name="code" />
          </label>
          <button class="cta" type="button" [disabled]="busy() || code.length < 6" (click)="enable()">
            Activate two-step verification
          </button>
        } @else {
          <p class="sec-copy">
            Protect the terminal with a rotating 6-digit challenge at sign-in (authenticator app,
            TOTP standard).
          </p>
          <button class="cta" type="button" [disabled]="busy()" (click)="beginSetup()">
            Begin enrolment
          </button>
        }
        @if (message(); as m) { <p [class]="m.kind">{{ m.text }}</p> }
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Terminal preferences</h2></div>
        <div class="rail-rows">
          <div class="rail-row">
            <span>Theme</span>
            <button class="link" type="button" (click)="theme.toggle()">
              Switch to {{ theme.theme() === 'dark' ? 'light' : 'dark' }} mode
            </button>
          </div>
          <div class="rail-row"><span>Currency display</span><strong>₦ Naira (company configuration)</strong></div>
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      .rail-rows { display: flex; flex-direction: column; }
      .rail-row { display: flex; justify-content: space-between; gap: 0.8rem; padding: 0.5rem 0;
        border-bottom: 1px solid var(--hairline); font-size: var(--type-body-sm); align-items: center;
        span { color: var(--ink-dim); }
        strong { text-align: right; overflow-wrap: anywhere; }
        &:last-child { border-bottom: 0; } }
      .sec-copy { margin: 0 0 0.7rem; font-size: var(--type-body-sm);
        strong { color: var(--ok); } }
      .secret-box { border: 1px dashed var(--hairline-2); background: var(--panel-2);
        padding: 0.6rem 0.7rem; font-size: var(--type-body-md); letter-spacing: 0.12em;
        overflow-wrap: anywhere; margin-bottom: 0.4rem; }
      .ok-msg { color: var(--ok); font-size: var(--type-body-sm); }
      .error { font-size: var(--type-body-sm); }
    `,
  ],
})
export class SettingsPage {
  private readonly api = inject(ApiService);
  readonly store = inject(PortalStore);
  readonly theme = inject(ThemeService);

  readonly busy = signal(false);
  readonly setup = signal<{ secret: string; otpauthUrl: string } | null>(null);
  readonly message = signal<{ kind: 'ok-msg' | 'error'; text: string } | null>(null);
  code = '';

  /** The role name the API reports for this account (partner_investor → "Partner / Investor"). */
  readonly roleLabel = computed(() => {
    const role = this.store.me()?.role ?? '';
    if (role === 'partner_investor') return 'Partner / Investor';
    return role ? role.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Partner / Investor';
  });

  beginSetup(): void {
    this.busy.set(true);
    this.message.set(null);
    this.api.setup2fa().subscribe({
      next: (s) => {
        this.busy.set(false);
        this.setup.set(s);
      },
      error: (err: { error?: { message?: string } }) => {
        this.busy.set(false);
        this.message.set({ kind: 'error', text: err?.error?.message ?? 'Enrolment could not be started.' });
      },
    });
  }

  enable(): void {
    this.busy.set(true);
    this.message.set(null);
    this.api.enable2fa(this.code).subscribe({
      next: () => {
        this.busy.set(false);
        this.setup.set(null);
        this.code = '';
        this.message.set({ kind: 'ok-msg', text: 'Two-step verification is now active.' });
        this.refreshMe();
      },
      error: () => {
        this.busy.set(false);
        this.message.set({ kind: 'error', text: 'Incorrect code — verification not activated.' });
      },
    });
  }

  disable(): void {
    this.busy.set(true);
    this.message.set(null);
    this.api.disable2fa(this.code).subscribe({
      next: () => {
        this.busy.set(false);
        this.code = '';
        this.message.set({
          kind: 'ok-msg',
          text: 'Two-step verification disabled — all other sessions were revoked.',
        });
        this.refreshMe();
      },
      error: () => {
        this.busy.set(false);
        this.message.set({ kind: 'error', text: 'Incorrect code — verification stays enabled.' });
      },
    });
  }

  private refreshMe(): void {
    this.api.me().subscribe({ next: (m) => this.store.me.set(m), error: () => undefined });
  }
}
