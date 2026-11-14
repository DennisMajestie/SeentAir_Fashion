import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { SeMoneyPipe } from '@seentair/ui';
import { PortalStore } from '../portal.store';

@Component({
  selector: 'app-documents-page',
  imports: [DatePipe, DecimalPipe, SeMoneyPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="pg">
        <section class="card hero">
          <div class="eyebrow">Shareholder Documents & Desk</div>
          <h1>Documents & Messages</h1>
          <p class="muted">Executed governance agreements, share certificates, and private inquiries with executive leadership.</p>
          <span class="chip">Repository awaiting first upload</span>
        </section>

        <section class="metrics">
          <div class="metric card"><span>Active holding</span><strong>{{ d.investmentInformation.shares | number }} shares</strong><small>Ordinary shares (Class A)</small></div>
          <div class="metric card"><span>Capital on registry</span><strong>{{ d.investmentInformation.investedAmount | seMoney }}</strong><small>Subscribed & fully paid</small></div>
          <div class="metric card"><span>Vault records</span><strong>0</strong><small>Verified documents shared</small></div>
          <div class="metric card"><span>Messages</span><strong>{{ activity().length }}</strong><small>In-platform inbox items</small></div>
        </section>

        <section class="card">
          <div class="sec-head"><h2>Corporate document vault</h2></div>
          <div class="empty-grid">
            <div class="ebox"><strong>No documents yet</strong><span>Shareholders' agreement, CAC filings and share certificate appear here once released.</span></div>
            <div class="ebox"><strong>No letters yet</strong><span>Managing Director's quarterly letters filed with each distribution cycle.</span></div>
            <div class="ebox"><strong>No filings yet</strong><span>Withholding-tax credit notes and statutory receipts deposited here.</span></div>
          </div>
        </section>

        <section class="card">
          <div class="sec-head"><h2>Message management</h2><span class="muted small">Executive desk</span></div>
          <p class="muted small">Confidential shareholder liaison routed directly to Seentair leadership. No support requests handled here.</p>
          @if (activity().length) {
            <div class="list mt">
              @for (m of activity(); track m.at + m.text) {
                <div class="msg">
                  <div class="dtop"><span class="actor">{{ m.actor }}</span><span class="muted small mono">{{ m.at | date:'mediumDate' }}</span></div>
                  <p>{{ m.text }}</p>
                  <span class="chip sm" [class.ok]="m.tone==='info'" [class.bad]="m.tone==='danger'">{{ m.tone === 'danger' ? 'Failed' : m.tone === 'info' ? 'Sent' : 'Notice' }}</span>
                </div>
              }
            </div>
          } @else {
            <p class="muted small mt">Quarterly briefings, distribution notices and desk replies land here.</p>
          }
          <div class="compose mt">
            <label>New management inquiry</label>
            <textarea rows="4" disabled placeholder="Submitting an inquiry is not yet enabled — reply via your liaison desk contact."></textarea>
            <button type="button" disabled>Send secure message</button>
          </div>
        </section>

        <section class="card">
          <div class="sec-head"><h2>Statutory governance office</h2></div>
          <p class="muted small">For physical AGM proxies, share re-allotments, or direct trust deeds, lodge a governance query via the direct desk once enabled.</p>
        </section>
      </div>
    }
  `,
  styles: [`
    :host{display:block;font-family:'Urbanist',sans-serif;}
    .pg{display:flex;flex-direction:column;gap:12px;} .card{background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;padding:14px;box-shadow:0 8px 24px -4px rgba(27,25,22,.05);}
    .eyebrow{font:700 10px/1 'JetBrains Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#c88a12;margin-bottom:4px;}
    h1{margin:0;font:700 20px/1.2 Urbanist,sans-serif;} h2{margin:0;font:700 14px/1.2 Urbanist,sans-serif;} p{margin:6px 0 0;font-size:13px;color:#1b1916;}
    .chip{display:inline-block;margin-top:8px;font:600 11px/1 Urbanist,sans-serif;padding:5px 9px;border-radius:999px;background:#f1ede5;border:1px solid #e8e1d3;}
    .chip.ok{background:rgba(35,128,77,.12);color:#23804d;border-color:rgba(35,128,77,.25);} .chip.bad{background:rgba(177,49,49,.12);color:#b13131;border-color:rgba(177,49,49,.25);} .chip.sm{margin:6px 0 0;font-size:10px;padding:4px 8px;}
    .metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .metric{display:flex;flex-direction:column;gap:4px;padding:12px;} .metric span{color:#7b756a;font-size:11px;} .metric strong{font:700 16px/1.1 'JetBrains Mono',monospace;color:#1b1916;}
    .sec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;}
    .empty-grid,.list{display:flex;flex-direction:column;gap:8px;}
    .ebox{padding:10px;border:1px dashed #d8cfbf;border-radius:10px;background:#fbf8f2;display:flex;flex-direction:column;gap:4px;}
    .ebox strong{font:700 12px/1.2 Urbanist,sans-serif;color:#1b1916;} .ebox span{font:500 11px/1.35 Urbanist,sans-serif;color:#7b756a;}
    .msg{padding:10px;border:1px solid #e8e1d3;border-radius:10px;background:#fff;}
    .dtop{display:flex;justify-content:space-between;gap:8px;align-items:center;}
    .actor{font:700 12px/1 Urbanist,sans-serif;color:#1b1916;}
    .compose{display:flex;flex-direction:column;gap:8px;}
    .compose label{font:600 12px/1 Urbanist,sans-serif;color:#1b1916;}
    .compose textarea{width:100%;padding:10px;border:1px solid #e8e1d3;border-radius:10px;background:#f7f2ea;font:500 13px/1.4 Urbanist,sans-serif;color:#7b756a;resize:vertical;}
    .compose button{padding:12px;border-radius:12px;border:0;background:#d8cfbf;color:#fff;font:700 13px/1 Urbanist,sans-serif;}
    .muted{color:#7b756a;} .small{font-size:11px;} .mono{font-family:'JetBrains Mono',monospace;} .mt{margin-top:10px;}
    @media (max-width:360px){.metrics{grid-template-columns:1fr;}}
  `],
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
