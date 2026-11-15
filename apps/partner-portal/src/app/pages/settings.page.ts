import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';
import { BrandAlertService } from '../brand-alert.service';
import { PortalStore } from '../portal.store';
import { ThemeService } from '../theme.service';

/** Screen P10: partner account, 2FA lifecycle, terminal preferences and sign-out. */
@Component({
  selector: 'app-settings-page',
  imports: [FormsModule],
  template: `
    <div class="stitch">
      <div class="flex flex-col gap-4 md:max-w-3xl md:mx-auto">
        <!-- Partner Profile Card -->
        <section class="profile-card bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex items-center gap-3.5">
          <div class="w-14 h-14 rounded-2xl bg-light-primary text-accent font-bold text-[18px] flex items-center justify-center border border-border flex-shrink-0 shadow-sm">
            {{ initials() }}
          </div>
          <div>
            <div class="flex items-center gap-1.5">
              <h2 class="text-[15px] font-bold text-light-primary">{{ store.me()?.name ?? 'Partner' }}</h2>
              <span class="material-symbols-outlined text-[16px] text-accent">verified</span>
            </div>
            <span class="text-[12px] text-light-secondary font-mono block">{{ store.me()?.email ?? '-' }}</span>
            <span class="text-[11px] text-success font-semibold mt-0.5 block">{{ roleLabel() }}{{ store.dash() ? ' · ' + store.dash()!.investmentInformation.equityPercentage + '% equity' : '' }}</span>
          </div>
        </section>

        <!-- Security & Verification -->
        <section class="security-card bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-3">
          <h3 class="text-[13px] font-bold text-light-primary border-b border-border pb-2 flex items-center justify-between">
            <span>Security &amp; verification</span>
            <span class="text-[11px] font-mono" [class.text-success]="store.me()?.totpEnabled" [class.text-light-secondary]="!store.me()?.totpEnabled">{{ store.me()?.totpEnabled ? 'HIGH ASSURANCE' : 'SETUP AVAILABLE' }}</span>
          </h3>

          <div class="flex items-center justify-between py-1 border-b border-border/70">
            <div>
              <span class="text-[13px] font-semibold text-light-primary block">Two-Step Verification (2FA)</span>
              <span class="text-[11px] text-light-secondary">Authenticator app · TOTP standard</span>
            </div>
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-xs" [class]="store.me()?.totpEnabled ? 'bg-success/15 text-success border-success/30' : 'bg-canvas-tint text-light-secondary border-border'">{{ store.me()?.totpEnabled ? 'Enabled' : 'Not enrolled' }}</span>
          </div>

          @if (store.me()?.totpEnabled) {
            <p class="text-[12px] text-light-secondary leading-normal">Two-step verification is <strong class="text-light-primary">active</strong>. Every sign-in requires a rotating 6-digit code from your authenticator app. Enter a live code to disable it.</p>
            <label class="flex flex-col gap-1.5 text-[12px] font-semibold text-light-primary">Live code to disable
              <input type="text" inputmode="numeric" maxlength="6" [(ngModel)]="code" name="code" aria-label="Live code to disable" class="px-3 py-2.5 rounded-lg border border-border bg-canvas font-mono tracking-[0.2em] text-[14px] text-light-primary" />
            </label>
            <button type="button" [disabled]="busy() || code.length < 6" (click)="disable()" class="w-full py-3 rounded-full bg-light-surface border border-danger/30 text-danger font-semibold text-[13px] disabled:opacity-50">Disable two-step verification</button>
          } @else if (setup(); as s) {
            <p class="text-[12px] text-light-secondary leading-normal">Add this secret to your authenticator app, then confirm with a live code to activate.</p>
            <div class="p-3 rounded-lg border border-dashed border-border bg-canvas/60 font-mono text-[12px] tracking-wider break-all text-light-primary">{{ s.secret }}</div>
            <label class="flex flex-col gap-1.5 text-[12px] font-semibold text-light-primary">Live 6-digit code
              <input type="text" inputmode="numeric" maxlength="6" [(ngModel)]="code" name="code" aria-label="Live 6-digit code" class="px-3 py-2.5 rounded-lg border border-border bg-canvas font-mono tracking-[0.2em] text-[14px] text-light-primary" />
            </label>
            <button type="button" [disabled]="busy() || code.length < 6" (click)="enable()" class="w-full py-3 rounded-full bg-accent text-on-accent font-semibold text-[13px] disabled:opacity-50">Activate two-step verification</button>
          } @else {
            <p class="text-[12px] text-light-secondary leading-normal">Protect the terminal with a rotating 6-digit challenge at sign-in.</p>
            <button type="button" [disabled]="busy()" (click)="beginSetup()" class="w-full py-3 rounded-full bg-accent text-on-accent font-semibold text-[13px] disabled:opacity-50">Begin enrolment</button>
          }
          @if (message(); as m) {
            <div class="p-2.5 rounded-lg text-[12px] font-semibold" [class]="m.kind === 'error' ? 'bg-danger/10 text-danger' : 'bg-success/15 text-success'">{{ m.text }}</div>
          }
        </section>

        <!-- Terminal Preferences -->
        <section class="prefs-card bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-3">
          <h3 class="text-[13px] font-bold text-light-primary border-b border-border pb-2">Terminal preferences</h3>
          <div class="flex items-center justify-between py-1 border-b border-border/70">
            <div>
              <span class="text-[13px] font-semibold text-light-primary block">Theme</span>
              <span class="text-[11px] text-light-secondary">Terminal appearance</span>
            </div>
            <button type="button" (click)="theme.toggle()" class="text-accent text-[12px] font-semibold hover:underline">Switch to {{ theme.theme() === 'dark' ? 'light' : 'dark' }} mode</button>
          </div>
          <div class="flex items-center justify-between py-1">
            <div>
              <span class="text-[13px] font-semibold text-light-primary block">Currency display</span>
              <span class="text-[11px] text-light-secondary">Company configuration</span>
            </div>
            <span class="text-[12px] font-mono text-light-primary font-bold">NGN Naira</span>
          </div>
        </section>

        <!-- Sign Out Action -->
        <div class="pt-2">
          <button type="button" (click)="signOut()" class="w-full py-3.5 rounded-full bg-light-surface border border-danger/30 text-danger font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-danger/10 transition-colors shadow-sm">
            <span class="material-symbols-outlined text-[18px]">logout</span>
            <span>Sign Out of Partner Portal</span>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class SettingsPage {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(BrandAlertService);
  private readonly router = inject(Router);
  readonly store = inject(PortalStore);
  readonly theme = inject(ThemeService);

  readonly busy = signal(false);
  readonly setup = signal<{ secret: string; otpauthUrl: string } | null>(null);
  readonly message = signal<{ kind: 'ok-msg' | 'error'; text: string } | null>(null);
  code = '';

  readonly roleLabel = computed(() => {
    const role = this.store.me()?.role ?? '';
    if (role === 'partner_investor') return 'Partner / Investor';
    return role ? role.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Partner / Investor';
  });

  readonly initials = computed(() => {
    const name = this.store.me()?.name ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') : 'P';
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
        this.message.set({ kind: 'ok-msg', text: 'Two-step verification disabled: all other sessions were revoked.' });
        this.refreshMe();
      },
      error: () => {
        this.busy.set(false);
        this.message.set({ kind: 'error', text: 'Incorrect code: verification stays enabled.' });
      },
    });
  }
  signOut(): void {
    this.api.logout();
    this.store.clear();
    this.alerts.toast('Signed out of the partner portal');
    void this.router.navigateByUrl('/login');
  }
  private refreshMe(): void {
    this.api.me().subscribe({ next: (m) => this.store.me.set(m), error: () => undefined });
  }
}
