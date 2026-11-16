import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ChatService } from './chat.service';

/**
 * The floating chat panel: the customer's direct line to the shop team.
 *
 * Signed-in shoppers see their threads; guests get one remembered conversation
 * (the token lives in localStorage, exactly once, like the order guest links).
 * The launcher sits above the mobile tab bar on the left, mirrored from the
 * WhatsApp float on the right; see .chat-float in styles.scss.
 */
@Component({
  selector: 'app-chat-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe],
  template: `
    @if (chat.open()) {
      <div class="chat-panel" role="dialog" aria-label="Chat with Seentair" (keydown.escape)="close()">
        <header class="chat-panel__head">
          <h2>Chat with us</h2>
          <button type="button" class="chat-close" aria-label="Close chat" (click)="close()">×</button>
        </header>

        @if (chat.detailLoading()) {
          <p class="chat-status">Loading…</p>
        } @else if (chat.detailError()) {
          <p class="chat-status" role="alert">{{ chat.detailError() }}</p>
        } @else if (chat.detail(); as d) {
          <p class="chat-status">
            @switch (d.conversation.status) {
              @case ('closed') {
                This conversation is closed. <button type="button" class="linkish" (click)="startNew()">Start a new one</button>
              }
              @case ('pending') {
                We have replied — take a look below.
              }
              @default {
                We usually reply within a day.
              }
            }
          </p>
          <ol class="chat-log" aria-label="Messages">
            @for (m of d.messages; track m.id) {
              <li class="chat-msg" [class.out]="m.direction === 'out'">
                <p class="chat-msg__body">{{ m.body }}</p>
                <span class="chat-msg__meta">
                  {{ m.createdAt | date: 'MMM d, HH:mm' }}
                  @if (m.direction === 'out' && m.readAt) { · read }
                </span>
              </li>
            }
          </ol>
          @if (d.conversation.status !== 'closed') {
            <form class="chat-composer" (ngSubmit)="send()">
              <label class="visually-hidden" for="chat-draft">Your message</label>
              <input
                id="chat-draft"
                name="draft"
                [(ngModel)]="draft"
                [placeholder]="chat.unread() ? '' : 'Type a message…'"
                autocomplete="off"
                maxlength="4000"
              />
              <button type="submit" aria-label="Send message">Send</button>
            </form>
          }
        } @else if (api.isLoggedIn) {
          @if (chat.threads().length > 0) {
            <ul class="chat-threads">
              @for (t of chat.threads(); track t.id) {
                <li>
                  <button type="button" class="chat-thread" (click)="chat.openThread(t.id)">
                    <span class="chat-thread__title">
                      {{ t.subject ?? t.lastMessagePreview ?? 'Conversation' }}
                    </span>
                    <span class="chat-thread__meta">
                      @if (t.unreadCustomer > 0) {
                        <b>{{ t.unreadCustomer }} new</b> ·
                      }
                      {{ t.lastMessageAt ? (t.lastMessageAt | date: 'MMM d') : 'Just started' }}
                    </span>
                  </button>
                </li>
              }
            </ul>
          }
          <form class="chat-composer chat-composer--start" (ngSubmit)="start()">
            <label class="visually-hidden" for="chat-subject">Subject</label>
            <input
              id="chat-subject"
              name="subject"
              [(ngModel)]="subject"
              placeholder="What is it about? (optional)"
              autocomplete="off"
              maxlength="180"
            />
            <label class="visually-hidden" for="chat-first">First message</label>
            <textarea
              id="chat-first"
              name="first"
              rows="3"
              [(ngModel)]="firstMessage"
              placeholder="Write your message…"
              maxlength="4000"
            ></textarea>
            <button type="submit">Start conversation</button>
            @if (startError()) {
              <p class="chat-error" role="alert">{{ startError() }}</p>
            }
          </form>
        } @else {
          <p class="chat-status">Tell us who you are and what you need — no account required.</p>
          <form class="chat-composer chat-composer--start" (ngSubmit)="startGuest()">
            <label class="visually-hidden" for="chat-name">Your name</label>
            <input
              id="chat-name"
              name="guestName"
              [(ngModel)]="guestName"
              placeholder="Your name"
              autocomplete="name"
              maxlength="120"
            />
            <label class="visually-hidden" for="chat-first-guest">Your message</label>
            <textarea
              id="chat-first-guest"
              name="firstGuest"
              rows="3"
              [(ngModel)]="firstMessage"
              placeholder="Write your message…"
              maxlength="4000"
            ></textarea>
            <button type="submit">Start conversation</button>
            @if (startError()) {
              <p class="chat-error" role="alert">{{ startError() }}</p>
            }
          </form>
        }
      </div>
    }

    <button
      type="button"
      class="chat-float"
      aria-label="Chat with us"
      [attr.aria-expanded]="chat.open()"
      (click)="toggle()"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16 4C9.4 4 4 8.7 4 14.5c0 3.2 1.6 6 4.2 8L7.6 27l4.9-2.3c1.1.3 2.3.5 3.5.5 6.6 0 12-4.7 12-10.7S22.6 4 16 4z"
        />
      </svg>
      @if (chat.unread() > 0 && !chat.open()) {
        <span class="chat-float__badge" aria-hidden="true">{{ chat.unread() }}</span>
      }
    </button>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .chat-panel {
        position: fixed;
        z-index: 40;
        display: flex;
        flex-direction: column;
        inset-inline: 12px;
        bottom: calc(74px + env(safe-area-inset-bottom));
        max-height: min(62vh, 520px);
        overflow: hidden;
        background: var(--card, #16161a);
        color: var(--ink, #f4f2ee);
        border: 1px solid var(--line, rgb(255 255 255 / 12%));
        border-radius: 18px 18px 6px 6px;
        box-shadow: 0 18px 44px rgb(0 0 0 / 35%);
      }
      .chat-panel__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.8rem 1rem;
        border-bottom: 1px solid var(--line, rgb(255 255 255 / 12%));
      }
      .chat-panel__head h2 {
        margin: 0;
        font-size: var(--type-body, 1rem);
        font-weight: 650;
        letter-spacing: 0;
      }
      .chat-close {
        border: 0;
        background: none;
        color: inherit;
        font-size: 1.4rem;
        line-height: 1;
        cursor: pointer;
        padding: 0.15rem 0.4rem;
      }
      .chat-status {
        margin: 0;
        padding: 0.7rem 1rem 0.2rem;
        font-size: var(--type-body-sm, 0.85rem);
        color: var(--muted, rgb(244 242 238 / 60%));
      }
      .linkish {
        border: 0;
        background: none;
        color: var(--primary-fill, #e2c26a);
        text-decoration: underline;
        cursor: pointer;
        font: inherit;
        padding: 0;
      }
      .chat-log {
        flex: 1;
        overflow-y: auto;
        list-style: none;
        margin: 0;
        padding: 0.8rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }
      .chat-msg {
        max-width: 85%;
        align-self: flex-start;
        background: var(--container, rgb(255 255 255 / 6%));
        border: 1px solid var(--line, rgb(255 255 255 / 10%));
        border-radius: 14px 14px 14px 4px;
        padding: 0.55rem 0.75rem;
      }
      .chat-msg.out {
        align-self: flex-end;
        border-radius: 14px 14px 4px 14px;
        border-color: color-mix(in srgb, var(--primary-fill, #e2c26a) 45%, transparent);
      }
      .chat-msg__body {
        margin: 0;
        white-space: pre-wrap;
        font-size: var(--type-body-sm, 0.9rem);
      }
      .chat-msg__meta {
        display: block;
        margin-top: 0.2rem;
        font-size: var(--type-caption, 0.7rem);
        color: var(--muted, rgb(244 242 238 / 55%));
      }
      .chat-threads {
        list-style: none;
        margin: 0;
        padding: 0.6rem 0.8rem;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .chat-thread {
        display: grid;
        gap: 0.15rem;
        width: 100%;
        text-align: left;
        border: 1px solid var(--line, rgb(255 255 255 / 10%));
        background: var(--container, rgb(255 255 255 / 4%));
        color: inherit;
        border-radius: 12px;
        padding: 0.55rem 0.75rem;
        cursor: pointer;
        font: inherit;
      }
      .chat-thread__title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }
      .chat-thread__meta {
        font-size: var(--type-caption, 0.7rem);
        color: var(--muted, rgb(244 242 238 / 55%));
      }
      .chat-composer {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 0.5rem;
        padding: 0.7rem 0.8rem calc(0.7rem);
        border-top: 1px solid var(--line, rgb(255 255 255 / 10%));
      }
      .chat-composer--start {
        grid-template-columns: 1fr;
      }
      .chat-composer input,
      .chat-composer textarea {
        width: 100%;
        background: var(--container, rgb(255 255 255 / 6%));
        color: inherit;
        border: 1px solid var(--line, rgb(255 255 255 / 14%));
        border-radius: 10px;
        padding: 0.55rem 0.7rem;
        font: inherit;
        font-size: var(--type-body-sm, 0.9rem);
      }
      .chat-composer button {
        border: 0;
        border-radius: 10px;
        padding: 0.55rem 0.9rem;
        background: var(--primary-fill, #e2c26a);
        color: #16161a;
        font-weight: 650;
        cursor: pointer;
        align-self: end;
      }
      .chat-error {
        grid-column: 1 / -1;
        margin: 0;
        font-size: var(--type-caption, 0.75rem);
        color: #ff9b8a;
      }
      .chat-float {
        position: fixed;
        z-index: 31;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        left: 16px;
        bottom: calc(74px + env(safe-area-inset-bottom));
        border: 0;
        border-radius: 50%;
        background: var(--primary-fill, #e2c26a);
        color: #16161a;
        cursor: pointer;
        box-shadow: 0 8px 22px rgb(0 0 0 / 30%);
      }
      .chat-float svg {
        width: 22px;
        height: 22px;
      }
      .chat-float__badge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 18px;
        height: 18px;
        display: grid;
        place-items: center;
        padding: 0 4px;
        border-radius: 999px;
        background: #d64541;
        color: #fff;
        font-size: 0.65rem;
        font-weight: 700;
      }
      @media (min-width: 900px) {
        .chat-panel {
          inset-inline: auto 24px;
          width: 380px;
          bottom: 88px;
          border-radius: 18px 18px 6px 6px;
        }
        .chat-float {
          left: auto;
          right: 24px;
          bottom: 88px;
          width: 52px;
          height: 52px;
        }
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
    `,
  ],
})
export class ChatWidgetComponent {
  protected readonly api = inject(ChatService).api;
  protected readonly chat = inject(ChatService);

  draft = '';
  subject = '';
  firstMessage = '';
  guestName = '';

  private readonly startErrorValue = signal('');
  protected readonly startError = this.startErrorValue.asReadonly();

  toggle(): void {
    if (this.chat.open()) {
      this.close();
    } else {
      this.startErrorValue.set('');
      this.chat.showPanel();
    }
  }

  close(): void {
    this.chat.dismissPanel();
    this.draft = '';
    this.startErrorValue.set('');
  }

  startNew(): void {
    this.chat.dismissPanel();
    this.chat.showPanel();
  }

  send(): void {
    const message = this.draft.trim();
    if (!message) return;
    this.chat.send(
      message,
      () => {
        this.draft = '';
      },
      (message) => this.startErrorValue.set(message),
    );
  }

  start(): void {
    const message = this.firstMessage.trim();
    if (!message) {
      this.startErrorValue.set('Write your message first.');
      return;
    }
    this.startErrorValue.set('');
    this.chat.startThread(
      message,
      this.subject.trim() || null,
      () => {
        this.firstMessage = '';
        this.subject = '';
      },
      (message) => this.startErrorValue.set(message),
    );
  }

  startGuest(): void {
    const name = this.guestName.trim();
    const message = this.firstMessage.trim();
    if (!name) {
      this.startErrorValue.set('Tell us your name first.');
      return;
    }
    if (!message) {
      this.startErrorValue.set('Write your message first.');
      return;
    }
    this.startErrorValue.set('');
    this.chat.startGuestThread(
      name,
      message,
      () => {
        this.firstMessage = '';
        this.guestName = '';
      },
      (message) => this.startErrorValue.set(message),
    );
  }
}
