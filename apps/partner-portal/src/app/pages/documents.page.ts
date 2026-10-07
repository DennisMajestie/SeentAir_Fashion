import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import {
  SeActivityComponent,
  SeActivityEntry,
  SeBadgeComponent,
  SeButtonDirective,
  SeCardComponent,
  SeEmptyStateComponent,
  SeFieldComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMetricCardComponent,
  SeMoneyPipe,
  SePageComponent,
} from '@seentair/ui';
import { PortalStore } from '../portal.store';

/**
 * Screen P8, Shareholder Documents & Direct Management Desk. The corporate
 * vault has no document endpoint yet (honest empty states); the message desk
 * shows the live in-platform inbox delivered to this account (notifications).
 */
@Component({
  selector: 'app-documents-page',
  imports: [
    DecimalPipe,
    SeActivityComponent,
    SeBadgeComponent,
    SeButtonDirective,
    SeCardComponent,
    SeEmptyStateComponent,
    SeFieldComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMetricCardComponent,
    SeMoneyPipe,
    SePageComponent,
  ],
  template: `
    @if (store.dash(); as d) {
      <se-page
        title="Shareholder Documents & Direct Management Desk"
        description="Executed corporate governance agreements, share certificates, and private encrypted inquiries with executive leadership."
      >
        <se-badge sePageStatus tone="neutral">Repository awaiting first upload</se-badge>

        <div class="se-metric-grid">
          <se-metric-card
            label="Active holding"
            [value]="(d.investmentInformation.shares | number) + ' shares'"
            hint="Ordinary shares (Class A)"
          />
          <se-metric-card
            label="Capital on registry"
            [value]="d.investmentInformation.investedAmount | seMoney"
            hint="Subscribed & fully paid"
          />
          <se-metric-card label="Vault records" value="0" hint="Verified documents shared to you" />
        </div>

        <div class="se-detail">
          <div class="se-detail__main">
            <se-card title="Corporate document vault">
              <div class="doc-grid">
                <se-empty-state
                  heading="No documents yet"
                  text="Your shareholders' agreement, CAC filings and share certificate appear here once released."
                />
                <se-empty-state
                  heading="No letters yet"
                  text="The Managing Director's quarterly letters are filed here with each distribution cycle."
                />
                <se-empty-state
                  heading="No filings yet"
                  text="Withholding-tax credit notes and statutory receipts are deposited here."
                />
              </div>
            </se-card>
          </div>

          <aside class="se-detail__aside">
            <se-card title="Message management">
              <p class="doc-note">
                Confidential shareholder liaison from the executive desk, routed directly to Seentair
                leadership. No support requests are handled here.
              </p>
              <se-activity
                [entries]="activity()"
                emptyText="Quarterly briefings, distribution notices and desk replies land here."
              />
              <se-field label="New management inquiry">
                <textarea
                  seInput
                  rows="4"
                  disabled
                  placeholder="Submitting an inquiry is not yet enabled: reply via your liaison desk contact."
                ></textarea>
              </se-field>
              <button seButton variant="primary" type="button" disabled>Send secure message</button>
            </se-card>

            <se-card title="Statutory governance office">
              <dl seKv>
                <div seKvItem label="Legal & Secretarial Secretariat">
                  For physical AGM proxies, share re-allotments, or direct trust deeds, lodge a
                  governance query via the direct desk once enabled.
                </div>
              </dl>
            </se-card>
          </aside>
        </div>
      </se-page>
    }
  `,
  styles: [
    `
      .doc-note {
        margin: 0 0 var(--se-space-4);
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
      .doc-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--se-space-4);
      }
    `,
  ],
})
export class DocumentsPage {
  readonly store = inject(PortalStore);

  readonly activity = computed<SeActivityEntry[]>(() =>
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
}
