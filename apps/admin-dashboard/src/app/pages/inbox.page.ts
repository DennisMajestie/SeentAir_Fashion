import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  SeBadgeComponent,
  SeBannerComponent,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeDatePipe,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilterBarComponent,
  SeFilter,
  SeInputDirective,
  SePageComponent,
  SeTableComponent,
  SeToastService,
  formatDate,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import {
  ApiService,
  ConversationMessage,
  ConversationSummary,
} from '../api.service';
import { orderRef } from './order-format';

export interface InboxThread {
  id: string;
  who: string;
  channel: ConversationSummary['channel'];
  status: ConversationSummary['status'];
  unread: number;
  preview: string;
  lastMessageAt: string | null;
  relatedOrderId: string | null;
  subject: string | null;
}

export function threadFrom(c: ConversationSummary): InboxThread {
  const who =
    c.customerName ?? c.guestName ?? c.guestEmail ?? c.guestPhone ?? 'Customer';
  return {
    id: c.id,
    who,
    channel: c.channel,
    status: c.status,
    unread: c.unreadStaff,
    preview: c.lastMessagePreview ?? '',
    lastMessageAt: c.lastMessageAt,
    relatedOrderId: c.relatedOrderId,
    subject: c.subject,
  };
}

export function chatChannelLabel(channel: string): string {
  switch (channel) {
    case 'whatsapp':
      return 'WhatsApp';
    case 'sms':
      return 'SMS';
    case 'email':
      return 'Email';
    default:
      return 'In-app';
  }
}

export function statusMeaningFor(
  status: string,
): { label: string; tone: 'info' | 'warning' | 'neutral' } {
  switch (status) {
    case 'open':
      return { label: 'Open', tone: 'info' };
    case 'pending':
      return { label: 'Waiting on reply', tone: 'warning' };
    default:
      return { label: 'Closed', tone: 'neutral' };
  }
}

/** Canned starters for the reply composer; text only, there is no macro backend. */
export const INBOX_MACROS = [
  {
    label: 'Send tracking',
    text: 'Hello! Your order is with the courier; we will share the live tracking link as soon as it is dispatched.',
  },
  {
    label: 'Size exchange',
    text: 'Thanks for reaching out. Size exchanges follow the returns window: request within 12 hours of receipt and we will guide you through the swap.',
  },
  {
    label: 'Payment reminder',
    text: 'Hi! Your order is reserved and awaiting full payment; it ships as soon as payment is confirmed.',
  },
];

type StatusFilter = '' | 'unread' | 'open' | 'pending' | 'closed';/**
 * The conversation inbox. Threads opened by customers and guests on the
 * storefront (and, later, WhatsApp) land here; staff reply on the thread and
 * the customer sees it in their account or chat widget.
 */
@Component({
  selector: 'app-inbox',
  imports: [
    FormsModule,
    RouterLink,
    SeBadgeComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCellDirective,
    SeDatePipe,
    SeDrawerComponent,
    SeFieldComponent,
    SeFilterBarComponent,
    SeInputDirective,
    SePageComponent,
    SeTableComponent,
  ],
  template: `
    <se-page
      title="Inbox"
      description="Customer conversations from the storefront, all in one place. Replies reach the customer on their account or in the chat widget."
    >
      <se-table
        caption="Conversations"
        [columns]="columns"
        [rows]="rows()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        activatable
        (rowActivate)="open($event)"
        emptyHeading="No conversations"
        emptyText="When a customer or guest starts a chat on the storefront, it appears here."
      >
        <se-filter-bar
          seTableToolbar
          searchLabel=""
          [filters]="threadFilters"
          [(value)]="filterValue"
        />
        <ng-template seCell="who" let-row>
          <button seButton type="button" (click)="open(row)">{{ row.who }}</button>
        </ng-template>
        <ng-template seCell="unread" let-row>
          @if (row.unread > 0) {
            <span class="unread-chip">{{ row.unread }} new</span>
          } @else {
            <span class="read-quiet">—</span>
          }
        </ng-template>
        <ng-template seCell="status" let-row>
          <se-badge [tone]="statusMeaningFor(row.status).tone">
            {{ statusMeaningFor(row.status).label }}
          </se-badge>
        </ng-template>
        <ng-template seCell="lastMessageAt" let-row>
          {{ row.lastMessageAt ? (row.lastMessageAt | seDate: 'datetime') : '—' }}
        </ng-template>
      </se-table>

      <se-drawer [title]="title()" [(open)]="drawerOpen">
        @if (detail(); as d) {
          @if (d.conversation.relatedOrderId) {
            <p class="order-link">
              About order
              <a routerLink="/orders/{{ d.conversation.relatedOrderId }}">
                {{ orderRef(d.conversation.relatedOrderId) }}
              </a>
            </p>
          }
          <ol class="thread" aria-label="Conversation messages">
            @for (m of d.messages; track m.id) {
              <li class="bubble" [class.out]="m.direction === 'out'">
                <span class="bubble-author">
                  {{ m.direction === 'out' ? (m.authorName ?? 'You') : who() }}
                </span>
                <p class="bubble-body">{{ m.body }}</p>
                <span class="bubble-meta">
                  {{ m.createdAt | seDate: 'datetime' }}
                  @if (m.direction === 'out' && m.readAt) {
                    · read
                  }
                </span>
              </li>
            }
          </ol>

          @if (canReply && d.conversation.status !== 'closed') {
            <form class="se-form" id="reply" (ngSubmit)="send()">
              <se-field label="Reply" [error]="draftError()">
                <textarea seInput name="draft" rows="3" [(ngModel)]="draft"></textarea>
              </se-field>
              <div class="macros" role="group" aria-label="Starter replies">
                @for (m of macros; track m.label) {
                  <button seButton size="sm" type="button" (click)="applyMacro(m.text)">
                    {{ m.label }}
                  </button>
                }
              </div>
            </form>
          } @else if (d.conversation.status === 'closed') {
            <se-banner tone="info">This conversation is closed.</se-banner>
          } @else {
            <se-banner tone="info">Your role can read conversations but not reply.</se-banner>
          }
        }
        <ng-container seDrawerFooter>
          @if (canReply && detail()?.conversation?.status !== 'closed') {
            <button
              seButton
              type="button"
              [loading]="closing()"
              (click)="setStatus('closed')"
            >
              Close
            </button>
            <button
              seButton
              variant="primary"
              type="submit"
              form="reply"
              [loading]="sending()"
            >
              Send reply
            </button>
          }
        </ng-container>
      </se-drawer>
    </se-page>
  `,
  styles: [
    `
      .unread-chip {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 999px;
        background: var(--se-color-brand, #7c3aed);
        color: #fff;
        font: var(--se-type-caption);
      }
      .read-quiet {
        color: var(--se-color-text-muted);
      }
      .order-link {
        margin: 0 0 var(--se-space-4);
      }
      .thread {
        list-style: none;
        margin: 0 0 var(--se-space-5);
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--se-space-3);
      }
      .bubble {
        max-width: 85%;
        align-self: flex-start;
        background: var(--se-color-surface-raised, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--se-color-border, rgba(255, 255, 255, 0.1));
        border-radius: 14px 14px 14px 4px;
        padding: var(--se-space-3) var(--se-space-4);
      }
      .bubble.out {
        align-self: flex-end;
        border-radius: 14px 14px 4px 14px;
        border-color: color-mix(in srgb, var(--se-color-brand, #7c3aed) 45%, transparent);
      }
      .bubble-author {
        display: block;
        font: var(--se-type-caption);
        color: var(--se-color-text-muted);
      }
      .bubble-body {
        margin: var(--se-space-1) 0;
        white-space: pre-wrap;
      }
      .bubble-meta {
        font: var(--se-type-caption);
        color: var(--se-color-text-muted);
      }
      .macros {
        display: flex;
        flex-wrap: wrap;
        gap: var(--se-space-2);
      }
    `,
  ],
})
export class InboxPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly toast = inject(SeToastService);

  /** Replying is a write on the communication module; reads only need view. */
  readonly canReply = this.access.can('communication', 'full');

  readonly threads = signal<InboxThread[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly macros = INBOX_MACROS;
  readonly orderRef = orderRef;
  readonly statusMeaningFor = statusMeaningFor;
  readonly chatChannelLabel = chatChannelLabel;

  /** Server-side status filter, applied like the approvals history's. */
  readonly filterValue = signal<Record<string, string>>({});
  readonly threadFilters: SeFilter[] = [
    {
      key: 'status',
      label: 'Show',
      anyLabel: 'All conversations',
      options: [
        { value: 'unread', label: 'Unread' },
        { value: 'open', label: 'Open' },
        { value: 'pending', label: 'Waiting on reply' },
        { value: 'closed', label: 'Closed' },
      ],
    },
  ];

  readonly rows = computed(() => this.threads());

  readonly columns: SeColumn<InboxThread>[] = [
    { key: 'who', header: 'Customer', sortable: true },
    { key: 'preview', header: 'Latest message', value: (t) => t.preview },
    {
      key: 'channel',
      header: 'Channel',
      value: (t) => chatChannelLabel(t.channel),
    },
    { key: 'unread', header: 'Unread', numeric: true, value: (t) => t.unread },
    {
      key: 'status',
      header: 'Status',
      value: (t) => statusMeaningFor(t.status).label,
    },
    {
      key: 'lastMessageAt',
      header: 'Last activity',
      sortable: true,
      format: (v) => (v ? formatDate(v as string) : '—'),
    },
  ];

  // ---- thread drawer ----
  readonly drawerOpen = signal(false);
  readonly selectedId = signal<string | null>(null);
  readonly detail = signal<{ conversation: ConversationSummary; messages: ConversationMessage[] } | null>(
    null,
  );
  readonly sending = signal(false);
  readonly closing = signal(false);
  readonly draftError = signal('');
  draft = '';

  readonly title = computed(() => {
    const selected = this.threads().find((t) => t.id === this.selectedId());
    return selected?.who ?? 'Conversation';
  });
  readonly who = computed(() => {
    const selected = this.threads().find((t) => t.id === this.selectedId());
    return selected?.who ?? 'Customer';
  });

  private lastFilter = '';

  constructor() {
    // Threads are filtered by the server, so a changed filter re-reads them.
    effect(() => {
      const value = this.filterValue()['status'] ?? '';
      untracked(() => {
        if (value !== this.lastFilter) {
          this.lastFilter = value;
          this.load();
        }
      });
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const filter = this.filterValue()['status'] ?? '';
    this.loading.set(true);
    this.api
      .threads({
        status: filter === '' || filter === 'unread' ? undefined : filter,
        unreadOnly: filter === 'unread',
        limit: 100,
      })
      .subscribe({
        next: (res) => {
          this.threads.set(res.data.map(threadFrom));
          this.total.set(res.total);
          this.loading.set(false);
          this.error.set('');
        },
        error: (err) => {
          this.loading.set(false);
          if (this.threads().length === 0) {
            this.error.set(err?.error?.message ?? 'The server did not respond.');
          }
        },
      });
  }

  open(thread: InboxThread): void {
    this.selectedId.set(thread.id);
    this.draft = '';
    this.draftError.set('');
    this.drawerOpen.set(true);
    this.markReadQuietly(thread.id);
    this.api.threadDetail(thread.id).subscribe({
      next: (detail) => this.detail.set(detail),
      error: (err) => {
        this.detail.set(null);
        this.error.set(err?.error?.message ?? 'The conversation could not be opened.');
      },
    });
  }

  private markReadQuietly(id: string): void {
    this.api.markThreadRead(id).subscribe({
      next: () => {
        this.threads.update((list) =>
          list.map((t) => (t.id === id ? { ...t, unread: 0 } : t)),
        );
      },
      error: () => undefined,
    });
  }

  applyMacro(text: string): void {
    this.draft = this.draft.trim() ? `${this.draft.trim()}\n${text}` : text;
  }

  send(): void {
    const id = this.selectedId();
    const message = this.draft.trim();
    if (!id || !message) {
      this.draftError.set('Write the reply first.');
      return;
    }
    this.draftError.set('');
    this.sending.set(true);
    this.api.replyToThread(id, message).subscribe({
      next: () => {
        this.sending.set(false);
        this.draft = '';
        this.toast.show('Reply sent');
        this.api.threadDetail(id).subscribe({ next: (d) => this.detail.set(d) });
        this.load();
      },
      error: (err) => {
        this.sending.set(false);
        this.draftError.set(err?.error?.message ?? 'The reply could not be sent.');
      },
    });
  }

  async setStatus(status: 'closed' | 'open' | 'pending'): Promise<void> {
    const id = this.selectedId();
    if (!id) return;
    this.closing.set(true);
    this.api.updateThread(id, { status }).subscribe({
      next: () => {
        this.closing.set(false);
        this.toast.show(status === 'closed' ? 'Conversation closed' : 'Conversation reopened');
        this.api.threadDetail(id).subscribe({ next: (d) => this.detail.set(d) });
        this.load();
      },
      error: () => {
        this.closing.set(false);
        this.toast.show('That change could not be saved.');
      },
    });
  }
}
