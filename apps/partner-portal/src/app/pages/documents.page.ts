import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { PortalStore } from '../portal.store';

/**
 * Screen P8 — Shareholder Documents & Direct Management Desk. The corporate
 * vault has no document endpoint yet (honest empty states); the message desk
 * shows the live in-platform inbox delivered to this account (notifications).
 */
@Component({
  selector: 'app-documents-page',
  imports: [CommonModule],
  template: `
    @if (store.dash(); as d) {
      <div class="page-head">
        <div class="page-head-main">
          <p class="page-kicker">Registry &amp; Communications // Secure Vault</p>
          <h1 class="page-title">Shareholder Documents &amp; Direct Management Desk</h1>
          <p class="page-sub">
            Executed corporate governance agreements, share certificates, and private encrypted
            inquiries with executive leadership.
          </p>
        </div>
        <div class="page-head-side">
          <div class="kpi mini">
            <span class="kpi-label">Repository status</span>
            <span class="kpi-value sm">Awaiting first upload</span>
          </div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi accent">
          <span class="kpi-label">Active holding</span>
          <span class="kpi-value">{{ d.investmentInformation.shares | number }}</span>
          <span class="kpi-sub">Ordinary shares (Class A)</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Capital on registry</span>
          <span class="kpi-value">₦{{ d.investmentInformation.investedAmount | number: '1.0-0' }}</span>
          <span class="kpi-sub">Subscribed &amp; fully paid</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Vault records</span>
          <span class="kpi-value">0</span>
          <span class="kpi-sub">Verified documents shared to you</span>
        </div>
      </div>

      <div class="split">
        <section class="panel">
          <div class="panel-head">
            <h2>Corporate document vault</h2>
            <span class="panel-note">Format: digital cert PDF</span>
          </div>

          <p class="num-head"><span class="num">1.</span> Shareholder &amp; governance agreements <span class="tail">0 records</span></p>
          <!-- GAP: no document-library endpoint — executed agreements, CAC forms and share
               certificates appear here as downloadable rows once the API ships one. -->
          <div class="empty-state">
            <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
            <h2 class="empty-state-title">No documents yet</h2>
            <p class="empty-state-sub">Your shareholders' agreement, CAC filings and share certificate appear here once released.</p>
          </div>

          <p class="num-head"><span class="num">2.</span> Quarterly investor letters &amp; briefings <span class="tail">0 records</span></p>
          <div class="empty-state">
            <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
            <h2 class="empty-state-title">No letters yet</h2>
            <p class="empty-state-sub">The Managing Director's quarterly letters are filed here with each distribution cycle.</p>
          </div>

          <p class="num-head"><span class="num">3.</span> Tax &amp; statutory filings <span class="tail">0 records</span></p>
          <div class="empty-state">
            <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
            <h2 class="empty-state-title">No filings yet</h2>
            <p class="empty-state-sub">Withholding-tax credit notes and statutory receipts are deposited here.</p>
          </div>
        </section>

        <div>
          <section class="panel">
            <div class="panel-head">
              <h2>Message management</h2>
              <span class="panel-note">Secure inbox · {{ inboxCount() }}</span>
            </div>
            <p class="desk-copy">
              Confidential shareholder liaison from the executive desk — communications are routed
              directly to Seentair leadership. No customer data or support requests are routed
              here.
            </p>
            @if (store.messages(); as inbox) {
              @if (inbox.length > 0) {
                <div class="inbox" role="list">
                  @for (m of inbox; track m.id) {
                    <div class="inbox-row" role="listitem">
                      <div class="inbox-top">
                        <span class="chip">{{ channelLabel(m.channel) }}</span>
                        <time class="inbox-date" [attr.datetime]="m.sentAt">{{ m.sentAt | date: 'MMM d, yyyy · HH:mm' }}</time>
                      </div>
                      <p class="inbox-msg">{{ m.message }}</p>
                      <span class="inbox-type">{{ typeLabel(m.type) }} · {{ statusLabel(m.status) }}</span>
                    </div>
                  }
                </div>
              } @else {
                <div class="empty-state">
                  <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
                  <h2 class="empty-state-title">No messages yet</h2>
                  <p class="empty-state-sub">Quarterly briefings, distribution notices and desk replies land here.</p>
                </div>
              }
            } @else {
              <p class="gap-note">Loading secure inbox…</p>
            }
            <label class="field" for="inquiry">New management inquiry</label>
            <textarea
              id="inquiry"
              rows="4"
              disabled
              placeholder="Submitting an inquiry is not yet enabled — reply via your liaison desk contact."
            ></textarea>
            <button class="cta block" type="button" disabled>Send secure message</button>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2>Statutory governance office</h2>
            </div>
            <!-- GAP: registered-office / secretariat contact details are not exposed by the API. -->
            <div class="doc-row">
              <span class="doc-ico">§</span>
              <div class="doc-main">
                <strong>Legal &amp; Secretarial Secretariat</strong>
                <span>For physical AGM proxies, share re-allotments, or direct trust deeds, lodge
                  a governance query via the direct desk once enabled.</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div class="notice">
        All legal instruments available to this registry are verified through corporate counsel and
        retained under legal hold. Partner communications never expose customer records — the
        partner boundary excludes all customer PII by design.
      </div>
    }
  `,
  styles: [
    `
      .kpi.mini { padding: 0.6rem 0.8rem; }
      .kpi-value.sm { font-size: 0.95rem; }
      .desk-copy { margin: 0 0 0.7rem; font-size: var(--type-body-sm); color: var(--ink-dim); }
      label.field { margin-bottom: 0.2rem; }
      textarea {
        display: block; width: 100%; resize: vertical; padding: 0.6rem; margin: 0.3rem 0 0.7rem;
        background: var(--obsidian); border: 1px solid var(--hairline); color: var(--ink);
        font-family: inherit; font-size: var(--type-body-sm); border-radius: var(--radius-field);
        &:disabled { opacity: 0.55; }
      }
      .doc-main span { white-space: normal; }
      .inbox { display: flex; flex-direction: column; margin-bottom: 0.8rem; }
      .inbox-row { border: 1px solid var(--hairline); background: var(--panel-2); padding: 0.65rem 0.75rem;
        border-radius: var(--radius-field); margin-bottom: 0.5rem;
        &:last-child { margin-bottom: 0; } }
      .inbox-top { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem; }
      .inbox-date { font-size: var(--type-label-sm); color: var(--ink-dim); }
      .inbox-msg { margin: 0 0 0.35rem; font-size: var(--type-body-sm); }
      .inbox-type { font-size: var(--type-label-sm); color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.08em; }
    `,
  ],
})
export class DocumentsPage {
  readonly store = inject(PortalStore);

  readonly inboxCount = computed(() => this.store.messages()?.length ?? 0);

  channelLabel(channel: string): string {
    if (channel === 'in_platform') return 'Terminal';
    return channel.charAt(0).toUpperCase() + channel.slice(1);
  }

  typeLabel(type: string): string {
    const map: Record<string, string> = {
      order_status: 'Order update',
      payment: 'Payment',
      return: 'Return',
      approval: 'Approval',
      generic: 'Notice',
    };
    const label: string | undefined = map[type];
    if (label) return label;
    return type.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }

  statusLabel(status: string): string {
    return status === 'sent' ? 'Delivered' : status.charAt(0).toUpperCase() + status.slice(1);
  }
}
