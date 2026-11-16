import { Injectable, inject, signal } from '@angular/core';
import { ApiService, ChatThread, ChatThreadDetail } from './api.service';

const GUEST_KEY = 'seentair.chat.guest';

interface GuestIdentity {
  id: string;
  token: string;
}

/** The conversation panel's shared state: which thread is open, unread count. */
@Injectable({ providedIn: 'root' })
export class ChatService {
  /** Public so the account page can open a thread without going through us. */
  readonly api = inject(ApiService);

  /** Panel visibility. */
  readonly open = signal(false);
  /** The thread shown inside the panel; null means the thread list. */
  readonly openThreadId = signal<string | null>(null);
  readonly detail = signal<ChatThreadDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');

  /** The signed-in customer's threads; refreshed on open. */
  readonly threads = signal<ChatThread[]>([]);
  readonly unread = signal(0);

  private guest(): GuestIdentity | null {
    if (this.api.isLoggedIn) return null;
    try {
      const raw = localStorage.getItem(GUEST_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<GuestIdentity>;
      if (typeof parsed.id === 'string' && typeof parsed.token === 'string') {
        return { id: parsed.id, token: parsed.token };
      }
    } catch {
      // Corrupt storage behaves as if there is no guest thread.
    }
    return null;
  }

  private saveGuest(identity: GuestIdentity): void {
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify(identity));
    } catch {
      // Private mode: the thread still works this session.
    }
  }

  /** Guests keep exactly one thread, remembered locally. */
  guestIdentity(): GuestIdentity | null {
    return this.guest();
  }

  /**
   * Unread customer-side count for the launcher badge: the signed-in list from
   * the API, or 1 while a guest has an unseen thread (the guest list endpoint
   * is account-scoped, so the badge simply nudges until they open the panel).
   */
  refresh(): void {
    if (this.api.isLoggedIn) {
      this.api.myThreads().subscribe({
        next: (rows) => {
          this.threads.set(rows);
          this.unread.set(rows.reduce((sum, t) => sum + (t.unreadCustomer ?? 0), 0));
        },
        error: () => undefined,
      });
    } else if (this.guest()) {
      const guest = this.guest()!;
      this.api.threadDetail(guest.id, guest.token).subscribe({
        next: (detail) => this.unread.set(detail.conversation.unreadCustomer ?? 0),
        error: () => {
          // The thread was deleted or the token lost: drop the stale identity.
          try {
            localStorage.removeItem(GUEST_KEY);
          } catch {
            // Nothing to recover.
          }
          this.unread.set(0);
        },
      });
    }
  }

  showPanel(): void {
    this.open.set(true);
    // A remembered guest thread opens straight into the conversation; everyone
    // else lands on the thread list / start form.
    const guest = this.guest();
    if (!this.api.isLoggedIn && guest) {
      this.openThread(guest.id);
      return;
    }
    this.refresh();
  }

  dismissPanel(): void {
    this.open.set(false);
    this.openThreadId.set(null);
    this.detail.set(null);
  }

  openThread(id: string): void {
    this.open.set(true);
    this.openThreadId.set(id);
    this.loadThread(id);
  }

  openGuestThread(identity: GuestIdentity): void {
    this.saveGuest(identity);
    this.openThread(identity.id);
  }

  loadThread(id: string): void {
    const guest = this.guest();
    this.detailLoading.set(true);
    this.detailError.set('');
    this.api.threadDetail(id, guest && guest.id === id ? guest.token : undefined).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.detailLoading.set(false);
        // Opening the thread is what reads it; keep the list in step.
        if (detail.conversation.unreadCustomer > 0) {
          this.api.markThreadRead(id, guest && guest.id === id ? guest.token : undefined).subscribe({
            complete: () => this.refresh(),
          });
        }
      },
      error: (err) => {
        this.detailLoading.set(false);
        this.detailError.set(err?.error?.message ?? 'This conversation could not be opened.');
        // A guest thread that no longer exists is dead: drop the stale token
        // so the next panel open offers a fresh start.
        const guest = this.guest();
        if (guest && guest.id === id) this.forgetGuestThread();
      },
    });
  }

  send(body: string, onDone?: () => void, onError?: (message: string) => void): void {
    const id = this.openThreadId();
    const guest = this.guest();
    if (!id) return;
    this.api.sendMessage(id, body, guest && guest.id === id ? guest.token : undefined).subscribe({
      next: () => {
        this.loadThread(id);
        onDone?.();
      },
      error: (err) => onError?.(err?.error?.message ?? 'Your message could not be sent.'),
    });
  }

  startThread(body: string, subject: string | null, onDone?: () => void, onError?: (message: string) => void): void {
    this.api.startThread(body, subject ?? undefined).subscribe({
      next: (created) => {
        onDone?.();
        this.openThread(created.id);
      },
      error: (err) => onError?.(err?.error?.message ?? 'The conversation could not be started.'),
    });
  }

  startGuestThread(name: string, body: string, onDone?: () => void, onError?: (message: string) => void): void {
    this.api.startGuestThread(name, body).subscribe({
      next: (created) => {
        const identity = { id: created.conversation.id, token: created.guestToken };
        this.saveGuest(identity);
        onDone?.();
        this.openThread(identity.id);
      },
      error: (err) => onError?.(err?.error?.message ?? 'The conversation could not be started.'),
    });
  }

  forgetGuestThread(): void {
    try {
      localStorage.removeItem(GUEST_KEY);
    } catch {
      // Nothing to recover.
    }
    this.refresh();
  }
}
