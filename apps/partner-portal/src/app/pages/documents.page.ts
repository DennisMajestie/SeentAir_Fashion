import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { PortalStore } from '../portal.store';

/**
 * Screen P8 — Shareholder Documents & Direct Management Desk. No document or
 * messaging endpoints exist yet; the approved vault + desk layout renders with
 * honest empty states and a disabled composer.
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
              <span class="panel-note">Direct desk</span>
            </div>
            <p class="desk-copy">
              Private shareholder liaison: communications are confidential and routed directly to
              executive leadership. No customer data or support requests are routed here.
            </p>
            <!-- GAP: no secure-messaging endpoint — thread history and the composer activate when
                 the messaging module ships; composer renders disabled, never fake threads. -->
            <p class="gap-note">
              Secure messaging is not yet enabled on the partner terminal. Message history with the
              executive desk will appear here.
            </p>
            <label class="field" for="inquiry">New management inquiry</label>
            <textarea
              id="inquiry"
              rows="4"
              disabled
              placeholder="Submit an inquiry or governance question to executive management… (not yet enabled)"
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
    `,
  ],
})
export class DocumentsPage {
  readonly store = inject(PortalStore);
}
