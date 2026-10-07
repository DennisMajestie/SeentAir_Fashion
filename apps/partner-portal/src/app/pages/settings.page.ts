import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SeBadgeComponent,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeFieldComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SePageComponent,
} from '@seentair/ui';
import { ApiService } from '../api.service';
import { PortalStore } from '../portal.store';
import { ThemeService } from '../theme.service';

/**
 * Investor Settings: profile record, two-step verification enrolment (live
 * auth/2fa endpoints) and terminal theme.
 */
@Component({
  selector: 'app-settings-page',
  imports: [
    DecimalPipe,
    FormsModule,
    SeBadgeComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeFieldComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SePageComponent,
  ],
  template: `
    <se-page
      title="Investor Settings"
      description="Profile record, two-step hardware verification, and terminal preferences for this partner account."
      width="narrow"
    >
      <se-card title="Profile record">
        <se-badge seCardActions tone="neutral">Read-only</se-badge>
        <dl seKv>
          <div seKvItem label="Account name">{{ store.me()?.name ?? '-' }}</div>
          <div seKvItem label="Authorized email">{{ store.me()?.email ?? '-' }}</div>
          <div seKvItem label="Role">{{ roleLabel() }}</div>
          @if (store.dash(); as d) {
            <div seKvItem label="Equity" numeric>
              {{ d.investmentInformation.equityPercentage }}% ·
              {{ d.investmentInformation.shares | number }} shares
            </div>
          }
        </dl>
        <p class="set-note">
          Registry changes (name, email, payout instrument) are made by Seentair's company secretary
          — contact the desk via Documents &amp; Messages.
        </p>
      </se-card>

      <se-card title="Two-step verification">
        <se-badge seCardActions [tone]="store.me()?.totpEnabled ? 'success' : 'neutral'">
          {{ store.me()?.totpEnabled ? 'Enrolled' : 'Not enrolled' }}
        </se-badge>

        @if (store.me()?.totpEnabled) {
          <p class="set-copy">
            Two-step hardware verification is <strong>active</strong> on this account. Every sign-in
            requires a rotating 6-digit code from your authenticator app.
          </p>
          <se-field label="Live code to disable">
            <input seInput type="text" inputmode="numeric" maxlength="6" [(ngModel)]="code" name="code" />
          </se-field>
          <button
            seButton
            variant="danger"
            type="button"
            [disabled]="busy() || code.length < 6"
            (click)="disable()"
          >
            Disable two-step verification
          </button>
        } @else if (setup(); as s) {
          <p class="set-copy">
            Add this secret to your authenticator app, then confirm with a live code to activate.
          </p>
          <p class="set-secret">{{ s.secret }}</p>
          <se-field label="Live 6-digit code">
            <input seInput type="text" inputmode="numeric" maxlength="6" [(ngModel)]="code" name="code" />
          </se-field>
          <button
            seButton
            variant="primary"
            type="button"
            [disabled]="busy() || code.length < 6"
            (click)="enable()"
          >
            Activate two-step verification
          </button>
        } @else {
          <p class="set-copy">
            Protect the terminal with a rotating 6-digit challenge at sign-in (authenticator app,
            TOTP standard).
          </p>
          <button seButton variant="primary" type="button" [disabled]="busy()" (click)="beginSetup()">
            Begin enrolment
          </button>
        }

        @if (message(); as m) {
          <div class="set-msg">
            <se-banner [tone]="m.kind === 'ok-msg' ? 'success' : 'danger'">{{ m.text }}</se-banner>
          </div>
        }
      </se-card>

      <se-card title="Terminal preferences">
        <dl seKv>
          <div seKvItem label="Theme">
            <button seButton size="sm" variant="secondary" type="button" (click)="theme.toggle()">
              Switch to {{ theme.theme() === 'dark' ? 'light' : 'dark' }} mode
            </button>
          </div>
          <div seKvItem label="Currency display">₦ Naira (company configuration)</div>
        </dl>
      </se-card>
    </se-page>
  `,
  styles: [
    `
      .set-note,
      .set-copy {
        margin: 0 0 var(--se-space-4);
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
      .set-copy strong {
        color: var(--se-color-text);
      }
      .set-secret {
        margin: 0 0 var(--se-space-3);
        padding: var(--se-space-3) var(--se-space-4);
        border: 1px dashed var(--se-color-border-strong);
        background: var(--se-color-surface-sunken);
        font: var(--se-type-body-strong);
        letter-spacing: 0.12em;
        overflow-wrap: anywhere;
      }
      .set-msg {
        margin-top: var(--se-space-4);
      }
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
    return role
      ? role.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
      : 'Partner / Investor';
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
        this.message.set({
          kind: 'error',
          text: err?.error?.message ?? 'Enrolment could not be started.',
        });
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
        this.message.set({ kind: 'error', text: 'Incorrect code: verification not activated.' });
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
          text: 'Two-step verification disabled: all other sessions were revoked.',
        });
        this.refreshMe();
      },
      error: () => {
        this.busy.set(false);
        this.message.set({ kind: 'error', text: 'Incorrect code: verification stays enabled.' });
      },
    });
  }

  private refreshMe(): void {
    this.api.me().subscribe({ next: (m) => this.store.me.set(m), error: () => undefined });
  }
}
