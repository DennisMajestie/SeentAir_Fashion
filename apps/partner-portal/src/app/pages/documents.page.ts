import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { SeMoneyPipe } from '@seentair/ui';
import { PortalStore } from '../portal.store';

/** Screen P9: shareholder document vault (awaiting first release) + executive message desk. */
@Component({
  selector: 'app-documents-page',
  imports: [DatePipe, DecimalPipe, SeMoneyPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="stitch">
        <div class="flex flex-col gap-3.5">
          <!-- Vault Encryption Notice -->
          <div class="p-3.5 rounded-xl bg-canvas-tint/70 border border-border flex items-start gap-2.5 shadow-xs">
            <span class="material-symbols-outlined text-accent text-[20px] mt-0.5">enhanced_encryption</span>
            <div class="text-[12px] leading-relaxed text-light-primary">
              <strong class="font-semibold text-light-primary">Secured Enclave:</strong> All executed instruments are watermarked with your partner reference upon download and released through the governance desk.
            </div>
          </div>

          <!-- Holding Metrics Ribbon -->
          <section class="metrics grid grid-cols-2 gap-2 text-[12px]">
            <div class="p-2.5 rounded-lg bg-light-surface border border-border shadow-xs">
              <span class="text-[10px] text-light-secondary font-mono block">Active holding</span>
              <strong class="font-mono text-light-primary text-[15px] block mt-0.5">{{ d.investmentInformation.shares | number }} shares</strong>
              <span class="text-[10px] text-light-secondary font-semibold">Ordinary shares (Class A)</span>
            </div>
            <div class="p-2.5 rounded-lg bg-light-surface border border-border shadow-xs">
              <span class="text-[10px] text-light-secondary font-mono block">Capital on registry</span>
              <strong class="font-mono text-accent text-[15px] block mt-0.5">{{ d.investmentInformation.investedAmount | seMoney }}</strong>
              <span class="text-[10px] text-light-secondary font-semibold">Subscribed &amp; fully paid</span>
            </div>
            <div class="p-2.5 rounded-lg bg-light-surface border border-border shadow-xs">
              <span class="text-[10px] text-light-secondary font-mono block">Vault records</span>
              <strong class="font-mono text-light-primary text-[15px] block mt-0.5">0</strong>
              <span class="text-[10px] text-light-secondary font-semibold">Verified documents shared</span>
            </div>
            <div class="p-2.5 rounded-lg bg-light-surface border border-border shadow-xs">
              <span class="text-[10px] text-light-secondary font-mono block">Messages</span>
              <strong class="font-mono text-light-primary text-[15px] block mt-0.5">{{ activity().length }}</strong>
              <span class="text-[10px] text-light-secondary font-semibold">In-platform inbox items</span>
            </div>
          </section>

          <!-- Document Vault List -->
          <section class="vault flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <h3 class="text-[15px] font-bold text-light-primary">Corporate document vault</h3>
              <span class="text-[11px] font-mono text-light-secondary">0 VAULT ITEMS</span>
            </div>

            <article class="vault-item bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-xl bg-accent/15 text-warning flex items-center justify-center flex-shrink-0 shadow-xs">
                  <span class="material-symbols-outlined text-[22px]">verified_user</span>
                </div>
                <div>
                  <h2 class="text-[13px] font-bold text-light-primary leading-tight">Shareholders' Agreement &amp; CAC filings</h2>
                  <span class="text-[11px] text-light-secondary font-mono block mt-0.5">Legal operating covenant</span>
                  <span class="text-[10px] text-light-secondary">Awaiting release</span>
                </div>
              </div>
              <span class="text-[10px] text-light-secondary">Not yet shared</span>
            </article>

            <article class="vault-item bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-xl bg-canvas-tint text-light-primary flex items-center justify-center flex-shrink-0 shadow-xs">
                  <span class="material-symbols-outlined text-[22px]">mark_email_read</span>
                </div>
                <div>
                  <h2 class="text-[13px] font-bold text-light-primary leading-tight">Managing Director's quarterly letters</h2>
                  <span class="text-[11px] text-light-secondary font-mono block mt-0.5">Filed with each distribution cycle</span>
                  <span class="text-[10px] text-light-secondary">Awaiting release</span>
                </div>
              </div>
              <span class="text-[10px] text-light-secondary">Not yet shared</span>
            </article>

            <article class="vault-item bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-xl bg-canvas-tint text-light-primary flex items-center justify-center flex-shrink-0 shadow-xs">
                  <span class="material-symbols-outlined text-[22px]">receipt_long</span>
                </div>
                <div>
                  <h2 class="text-[13px] font-bold text-light-primary leading-tight">Statutory receipts &amp; tax credit notes</h2>
                  <span class="text-[11px] text-light-secondary font-mono block mt-0.5">Withholding-tax deposits</span>
                  <span class="text-[10px] text-light-secondary">Awaiting release</span>
                </div>
              </div>
              <span class="text-[10px] text-light-secondary">Not yet shared</span>
            </article>
          </section>

          <!-- Message Management -->
          <section class="desk bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-2.5">
            <div class="flex items-center justify-between border-b border-border pb-2.5">
              <div>
                <h2 class="text-[13px] font-bold text-light-primary">Message management</h2>
                <span class="text-[11px] text-light-secondary">Executive desk</span>
              </div>
              <span class="text-[11px] font-mono text-light-secondary font-semibold">{{ activity().length }} ITEMS</span>
            </div>
            <p class="text-[12px] text-light-secondary">Confidential shareholder liaison routed directly to Seentair leadership. No support requests handled here.</p>
            @if (activity().length) {
              <div class="inbox flex flex-col gap-2 mt-1">
                @for (m of activity(); track m.at + m.text) {
                  <div class="p-3 border border-border rounded-lg bg-canvas/50 flex flex-col gap-1.5">
                    <div class="flex justify-between items-center gap-2">
                      <span class="text-[12px] font-bold text-light-primary">{{ m.actor }}</span>
                      <span class="text-[11px] text-light-secondary font-mono">{{ m.at | date: 'mediumDate' }}</span>
                    </div>
                    <p class="text-[12px] text-light-primary leading-normal">{{ m.text }}</p>
                    <span class="self-start px-2 py-0.5 rounded-full text-[10px] font-semibold border" [class]="m.tone === 'danger' ? 'bg-danger/10 text-danger border-danger/30' : m.tone === 'info' ? 'bg-success/15 text-success border-success/30' : 'bg-canvas-tint text-light-primary border-border'">{{ m.tone === 'danger' ? 'Failed' : m.tone === 'info' ? 'Sent' : 'Notice' }}</span>
                  </div>
                }
              </div>
            } @else {
              <p class="text-[12px] text-light-secondary mt-1">Quarterly briefings, distribution notices and desk replies land here.</p>
            }
            <div class="compose flex flex-col gap-2 mt-1">
              <label for="inquiry" class="text-[12px] font-semibold text-light-primary">New management inquiry</label>
              <textarea id="inquiry" rows="4" disabled placeholder="Submitting an inquiry is not yet enabled — reply via your liaison desk contact." class="w-full p-2.5 border border-border rounded-lg bg-canvas text-[12px] text-light-secondary resize-none"></textarea>
              <button type="button" disabled class="px-4 py-3 rounded-lg bg-light-surface-variant text-light-on-surface-variant text-[13px] font-bold">Send secure message</button>
            </div>
          </section>

          <!-- Statutory Governance Office -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)]">
            <h3 class="text-[13px] font-bold text-light-primary border-b border-border pb-2">Statutory governance office</h3>
            <p class="text-[12px] text-light-secondary mt-2 leading-normal">For physical AGM proxies, share re-allotments, or direct trust deeds, lodge a governance query via the direct desk once enabled.</p>
          </section>
        </div>
      </div>
    }
  `,
})
export class DocumentsPage {
  readonly store = inject(PortalStore);

  readonly activity = computed(() =>
    (this.store.messages() ?? []).map((m) => ({
      at: m.sentAt,
      text: m.message,
      actor: `${this.channelLabel(m.channel)} · ${this.typeLabel(m.type)}`,
      tone: m.status === 'sent' ? 'info' : m.status === 'failed' ? 'danger' : 'neutral',
    })),
  );

  private channelLabel(channel: string): string {
    if (channel === 'in_platform') return 'Terminal';
    return channel.charAt(0).toUpperCase() + channel.slice(1);
  }
  private typeLabel(type: string): string {
    const map: Record<string, string> = { order_status: 'Order update', payment: 'Payment', return: 'Return', approval: 'Approval', generic: 'Notice' };
    return map[type] ?? type.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }
}
