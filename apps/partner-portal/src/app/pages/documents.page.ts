import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SeAlertService, SeMoneyPipe } from '@seentair/ui';
import { ApiService, type PartnerInquiry } from '../api.service';
import { PortalStore } from '../portal.store';

/** Screen P9: shareholder document vault (awaiting first release) + executive message desk. */
@Component({
  selector: 'app-documents-page',
  imports: [DatePipe, DecimalPipe, SeMoneyPipe, FormsModule],
  template: `
    @if (store.dash(); as d) {
      <div class="stitch">
        <div class="flex flex-col gap-3.5 md:grid md:grid-cols-2 md:items-start">
          <!-- Vault Encryption Notice -->
          <div class="p-3.5 rounded-xl bg-canvas-tint/70 border border-border flex items-start gap-2.5 shadow-xs md:col-span-2">
            <span class="material-symbols-outlined text-accent text-[20px] mt-0.5">enhanced_encryption</span>
            <div class="text-[12px] leading-relaxed text-light-primary">
              <strong class="font-semibold text-light-primary">Document vault:</strong> Instruments shared by the governance desk will be listed here. Inquiry threads go to the management desk.
            </div>
          </div>

          <!-- Holding Metrics Ribbon -->
          <section class="metrics grid grid-cols-2 gap-2 text-[12px] md:grid-cols-4">
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
              <span class="text-[10px] text-light-secondary font-mono block">Inquiries</span>
              <strong class="font-mono text-light-primary text-[15px] block mt-0.5">{{ inquiries().length }}</strong>
              <span class="text-[10px] text-light-secondary font-semibold">Opened with the desk</span>
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
              <span class="text-[11px] font-mono text-light-secondary">{{ inquiries().length }} INQUIRIES</span>
            </div>
            <div class="bg-light-surface rounded-xl p-4 border border-border shadow-xs">
              <p class="text-[12px] text-light-primary">No documents have been shared yet.</p>
              <p class="text-[11px] text-light-secondary mt-1">
                Agreements, quarterly letters and statutory receipts will appear here when the
                governance desk releases them. Use the inquiry form to request a copy.
              </p>
            </div>

            @if (inquiries().length) {
              <div class="flex flex-col gap-2">
                @for (q of inquiries(); track q.id) {
                  <article class="bg-light-surface rounded-xl p-3 border border-border shadow-xs">
                    <div class="flex items-center justify-between gap-2">
                      <strong class="text-[12px] text-light-primary">{{ q.subject ?? 'Partner inquiry' }}</strong>
                      <span class="text-[10px] font-mono text-light-secondary">{{ q.lastMessageAt ? (q.lastMessageAt | date: 'mediumDate') : '' }}</span>
                    </div>
                    <p class="text-[11px] text-light-secondary mt-1">{{ q.lastMessagePreview }}</p>
                    <span class="text-[10px] font-mono text-warning">{{ q.status }}</span>
                  </article>
                }
              </div>
            }
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
              <textarea id="inquiry" rows="4" [(ngModel)]="draft" placeholder="Write your question to the management desk…" class="w-full p-2.5 border border-border rounded-lg bg-canvas text-[12px] text-light-primary resize-none"></textarea>
              <button type="button" [disabled]="busy() || !draft.trim()" (click)="send()" class="px-4 py-3 rounded-lg bg-accent text-on-accent text-[13px] font-bold disabled:opacity-60">
                {{ busy() ? 'Sending…' : 'Send secure message' }}
              </button>
              @if (error()) { <p class="text-[11px] text-danger" role="alert">{{ error() }}</p> }
            </div>
          </section>

          <!-- Statutory Governance Office -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)]">
            <h3 class="text-[13px] font-bold text-light-primary border-b border-border pb-2">Statutory governance office</h3>
            <p class="text-[12px] text-light-secondary mt-2 leading-normal">For AGM proxies, share re-allotments or trust deeds, send an inquiry above and the governance desk will respond.</p>
          </section>
        </div>
      </div>
    }
  `,
})
export class DocumentsPage {
  readonly store = inject(PortalStore);
  private readonly api = inject(ApiService);
  private readonly alert = inject(SeAlertService);

  readonly inquiries = signal<PartnerInquiry[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  draft = '';

  constructor() {
    this.api.myInquiries().subscribe({
      next: (rows) => this.inquiries.set(rows ?? []),
      error: () => this.inquiries.set([]),
    });
  }

  send(): void {
    const body = this.draft.trim();
    if (!body || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.createInquiry(body).subscribe({
      next: (thread) => {
        this.inquiries.update((rows) => [thread, ...rows]);
        this.draft = '';
        this.busy.set(false);
        void this.alert.show({
          title: 'Inquiry sent',
          message: 'The management desk has your message and will reply here.',
          confirmLabel: 'Done',
        });
      },
      error: () => {
        this.error.set('The inquiry could not be sent. Try again.');
        this.busy.set(false);
      },
    });
  }

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
