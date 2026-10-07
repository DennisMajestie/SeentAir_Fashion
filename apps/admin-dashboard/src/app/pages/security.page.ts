import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SeBadgeComponent,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeConfirmService,
  SeFieldComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SePageComponent,
  SeSkeletonComponent,
  SeToastService,
} from '@seentair/ui';
import { ApiService } from '../api.service';
import { roleLabel } from './staff.page';

/**
 * The signed-in person's own two-factor setup. No module gate: everyone may
 * protect their own account. Turning it off signs every session out, so it
 * is confirmed before the code is sent.
 */
@Component({
  selector: 'app-security',
  imports: [
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
    SeSkeletonComponent,
  ],
  template: `
    <se-page title="Security" width="narrow">
      @if (loadError()) {
        <se-banner
          tone="danger"
          title="Your account could not be loaded"
          actionLabel="Try again"
          (action)="refresh()"
        >
          The server did not respond. Nothing has been changed.
        </se-banner>
      } @else if (!me()) {
        <div aria-busy="true"><se-skeleton shape="detail" /></div>
      } @else if (me(); as profile) {
        <se-card title="Two-factor sign-in">
          <ng-container seCardActions>
            <se-badge [tone]="profile.totpEnabled ? 'success' : 'warning'">
              {{ profile.totpEnabled ? 'On' : 'Off' }}
            </se-badge>
          </ng-container>
          <dl seKv>
            <div seKvItem label="Account">{{ profile.name }}</div>
            <div seKvItem label="Role">{{ roleLabel(profile.role) }}</div>
          </dl>

          @if (!profile.totpEnabled && !setup()) {
            <p>Each sign-in will also ask for a six-digit code from an authenticator app.</p>
          }
          @if (!profile.totpEnabled && !setup()) {
            <ng-container seCardFooter>
              <button seButton variant="primary" type="button" (click)="startSetup()">
                Turn on two-factor
              </button>
            </ng-container>
          }

          @if (setup(); as s) {
            <form class="se-form" (ngSubmit)="enable()">
              <se-field
                label="Secret key"
                hint="Enter this in your authenticator app, then enter the code it shows"
              >
                <input seInput name="secret" [value]="s.secret" readonly />
              </se-field>
              <se-field label="Code from the app" [error]="codeError()">
                <input
                  seInput
                  name="code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  [(ngModel)]="code"
                />
              </se-field>
              <div class="se-form__actions">
                <button seButton type="button" (click)="cancelSetup()">Cancel</button>
                <button seButton variant="primary" type="submit" [loading]="saving()">
                  Turn on two-factor
                </button>
              </div>
            </form>
          }

          @if (profile.totpEnabled) {
            <form class="se-form" (ngSubmit)="disable()">
              <se-field label="Code from the app" [error]="codeError()">
                <input
                  seInput
                  name="code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  [(ngModel)]="code"
                />
              </se-field>
              <div class="se-form__actions">
                <button seButton variant="danger" type="submit" [loading]="saving()">
                  Turn off two-factor
                </button>
              </div>
            </form>
          }
        </se-card>
      }
    </se-page>
  `,
})
export class SecurityPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);

  readonly me = signal<{ name: string; role: string; totpEnabled: boolean } | null>(null);
  readonly roleLabel = roleLabel;
  readonly loadError = signal(false);
  readonly setup = signal<{ secret: string; otpauthUrl: string } | null>(null);
  readonly codeError = signal<string | null>(null);
  readonly saving = signal(false);
  code = '';

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.api.me().subscribe({
      next: (profile) => {
        this.me.set(profile);
        this.loadError.set(false);
      },
      error: () => this.loadError.set(true),
    });
  }

  startSetup(): void {
    this.codeError.set(null);
    this.api.setup2fa().subscribe({
      next: (res) => this.setup.set(res),
      error: (err) =>
        this.toast.show(err?.error?.message ?? 'Two-factor setup could not start', {
          tone: 'danger',
          action: { label: 'Try again', run: () => this.startSetup() },
        }),
    });
  }

  cancelSetup(): void {
    this.setup.set(null);
    this.code = '';
    this.codeError.set(null);
  }

  private validCode(): boolean {
    if (!/^\d{6}$/.test(this.code.trim())) {
      this.codeError.set('Enter the six-digit code from your authenticator app.');
      return false;
    }
    this.codeError.set(null);
    return true;
  }

  enable(): void {
    if (!this.validCode()) return;
    this.saving.set(true);
    this.api.enable2fa(this.code).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.show('Two-factor is on. Your next sign-in will ask for a code.');
        this.setup.set(null);
        this.code = '';
        this.refresh();
      },
      error: (err) => {
        this.saving.set(false);
        this.codeError.set(err?.error?.message ?? 'That code is not right. Try the next one.');
      },
    });
  }

  async disable(): Promise<void> {
    if (!this.validCode()) return;
    const ok = await this.confirm.ask({
      title: 'Turn off two-factor sign-in?',
      consequence:
        'Your account will be protected by your password alone and every session, including this one, is signed out. You can turn it on again after signing back in.',
      confirmLabel: 'Turn off two-factor',
      danger: true,
    });
    if (!ok) return;
    this.saving.set(true);
    this.api.disable2fa(this.code).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.show('Two-factor is off. All sessions were signed out.');
        this.code = '';
        this.refresh();
      },
      error: (err) => {
        this.saving.set(false);
        this.codeError.set(err?.error?.message ?? 'That code is not right. Try the next one.');
      },
    });
  }
}
