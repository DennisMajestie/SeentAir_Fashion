import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';
import { PortalStore } from '../portal.store';
import { ThemeService } from '../theme.service';

@Component({
  selector: 'app-settings-page',
  imports: [DecimalPipe, FormsModule],
  template: `
    <div class="pg">
      <section class="card hero">
        <div class="eyebrow">Investor Settings</div>
        <h1>Settings</h1>
        <p class="muted">Profile record, two-step verification, and terminal preferences for this partner account.</p>
      </section>

      <section class="card">
        <div class="sec-head"><h2>Profile record</h2><span class="chip">Read-only</span></div>
        <div class="kv">
          <div><span>Account name</span><strong>{{ store.me()?.name ?? '-' }}</strong></div>
          <div><span>Authorized email</span><strong>{{ store.me()?.email ?? '-' }}</strong></div>
          <div><span>Role</span><strong>{{ roleLabel() }}</strong></div>
          @if (store.dash(); as d) {
            <div><span>Equity</span><strong class="mono">{{ d.investmentInformation.equityPercentage }}% · {{ d.investmentInformation.shares | number }} shares</strong></div>
          }
        </div>
        <p class="muted small note">Registry changes (name, email, payout instrument) are made by the company secretary — contact the desk via Documents & Messages.</p>
      </section>

      <section class="card">
        <div class="sec-head"><h2>Two-step verification</h2><span class="chip" [class.ok]="store.me()?.totpEnabled">{{ store.me()?.totpEnabled ? 'Enrolled' : 'Not enrolled' }}</span></div>
        @if (store.me()?.totpEnabled) {
          <p class="muted small">Two-step hardware verification is <strong>active</strong>. Every sign-in requires a rotating 6-digit code from your authenticator app.</p>
          <label class="field">Live code to disable<input type="text" inputmode="numeric" maxlength="6" [(ngModel)]="code" name="code" /></label>
          <button class="btn danger" type="button" [disabled]="busy() || code.length < 6" (click)="disable()">Disable two-step verification</button>
        } @else if (setup(); as s) {
          <p class="muted small">Add this secret to your authenticator app, then confirm with a live code to activate.</p>
          <div class="secret mono">{{ s.secret }}</div>
          <label class="field">Live 6-digit code<input type="text" inputmode="numeric" maxlength="6" [(ngModel)]="code" name="code" /></label>
          <button class="btn primary" type="button" [disabled]="busy() || code.length < 6" (click)="enable()">Activate two-step verification</button>
        } @else {
          <p class="muted small">Protect the terminal with a rotating 6-digit challenge at sign-in (authenticator app, TOTP standard).</p>
          <button class="btn primary" type="button" [disabled]="busy()" (click)="beginSetup()">Begin enrolment</button>
        }
        @if (message(); as m) {
          <div class="msg" [class.ok]="m.kind==='ok-msg'" [class.err]="m.kind==='error'">{{ m.text }}</div>
        }
      </section>

      <section class="card">
        <div class="sec-head"><h2>Terminal preferences</h2></div>
        <div class="kv">
          <div><span>Theme</span><button class="btn sm" type="button" (click)="theme.toggle()">Switch to {{ theme.theme() === 'dark' ? 'light' : 'dark' }} mode</button></div>
          <div><span>Currency display</span><strong>NGN Naira (company configuration)</strong></div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    :host{display:block;font-family:'Urbanist',sans-serif;}
    .pg{display:flex;flex-direction:column;gap:12px;} .card{background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;padding:14px;box-shadow:0 8px 24px -4px rgba(27,25,22,.05);}
    .eyebrow{font:700 10px/1 'JetBrains Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#c88a12;margin-bottom:4px;}
    h1{margin:0;font:700 20px/1.2 Urbanist,sans-serif;} h2{margin:0;font:700 14px/1.2 Urbanist,sans-serif;} p{margin:6px 0 0;}
    .chip{font:600 11px/1 Urbanist,sans-serif;padding:5px 9px;border-radius:999px;background:#f1ede5;border:1px solid #e8e1d3;}
    .chip.ok{background:rgba(35,128,77,.12);color:#23804d;border-color:rgba(35,128,77,.25);}
    .sec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;}
    .kv{display:flex;flex-direction:column;gap:8px;font-size:13px;}
    .kv>div{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(232,225,211,.6);} .kv>div:last-child{border-bottom:0;}
    .kv span,.muted{color:#7b756a;} .small{font-size:11px;} .mono{font-family:'JetBrains Mono',monospace;} .note{margin-top:10px;}
    .field{display:flex;flex-direction:column;gap:6px;margin:10px 0;font:600 12px/1 Urbanist,sans-serif;color:#1b1916;}
    .field input{padding:12px;border:1px solid #e8e1d3;border-radius:10px;background:#fff;font:600 16px/1 Urbanist,sans-serif;letter-spacing:.2em;}
    .secret{margin:10px 0;padding:10px;border:1px dashed #d8cfbf;border-radius:10px;background:#fbf8f2;font-size:13px;letter-spacing:.08em;word-break:break-all;}
    .btn{margin-top:8px;width:100%;padding:12px;border-radius:12px;border:1px solid #e8e1d3;background:#f1ede5;color:#1b1916;font:700 13px/1 Urbanist,sans-serif;}
    .btn.primary{background:#c88a12;color:#fff;border-color:#c88a12;} .btn.danger{background:#fff;color:#b13131;border-color:rgba(177,49,49,.3);} .btn.sm{width:auto;margin:0;padding:8px 10px;font-size:12px;}
    .btn:disabled{opacity:.5;}
    .msg{margin-top:10px;padding:10px;border-radius:10px;font:600 12px/1.3 Urbanist,sans-serif;}
    .msg.ok{background:rgba(35,128,77,.12);color:#23804d;} .msg.err{background:rgba(177,49,49,.12);color:#b13131;}
  `],
})
export class SettingsPage {
  private readonly api = inject(ApiService);
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

  beginSetup(): void {
    this.busy.set(true); this.message.set(null);
    this.api.setup2fa().subscribe({
      next: (s) => { this.busy.set(false); this.setup.set(s); },
      error: (err: { error?: { message?: string } }) => { this.busy.set(false); this.message.set({ kind: 'error', text: err?.error?.message ?? 'Enrolment could not be started.' }); },
    });
  }
  enable(): void {
    this.busy.set(true); this.message.set(null);
    this.api.enable2fa(this.code).subscribe({
      next: () => { this.busy.set(false); this.setup.set(null); this.code = ''; this.message.set({ kind: 'ok-msg', text: 'Two-step verification is now active.' }); this.refreshMe(); },
      error: () => { this.busy.set(false); this.message.set({ kind: 'error', text: 'Incorrect code: verification not activated.' }); },
    });
  }
  disable(): void {
    this.busy.set(true); this.message.set(null);
    this.api.disable2fa(this.code).subscribe({
      next: () => { this.busy.set(false); this.code = ''; this.message.set({ kind: 'ok-msg', text: 'Two-step verification disabled: all other sessions were revoked.' }); this.refreshMe(); },
      error: () => { this.busy.set(false); this.message.set({ kind: 'error', text: 'Incorrect code: verification stays enabled.' }); },
    });
  }
  private refreshMe(): void { this.api.me().subscribe({ next: (m) => this.store.me.set(m), error: () => undefined }); }
}
