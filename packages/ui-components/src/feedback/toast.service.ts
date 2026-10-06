import { Injectable } from '@angular/core';

export interface SeToastOptions {
  /** `danger` for a failure; anything else is a plain confirmation. */
  tone?: 'default' | 'danger';
  /** Milliseconds on screen. Defaults to 3s, or 5s when there is an action. */
  duration?: number;
  /** One follow-up, e.g. Undo or View. */
  action?: { label: string; run: () => void };
}

/**
 * A toast: a brief confirmation of something the person just did, at the bottom
 * of the screen. One at a time; a new one replaces the old.
 *
 *     toast.show('Supplier saved');
 *     toast.show('Order could not be refunded', { tone: 'danger' });
 *     toast.show('3 orders archived', { action: { label: 'Undo', run: () => this.restore() } });
 *
 * Not for anything the person must read or act on: a toast disappears, so an
 * error they can fix belongs inline and a problem they cannot belongs in a
 * banner.
 */
@Injectable({ providedIn: 'root' })
export class SeToastService {
  private host: HTMLElement | null = null;
  private dismissCurrent: (() => void) | null = null;

  show(text: string, options: SeToastOptions = {}): void {
    if (typeof document === 'undefined') return;
    this.dismissCurrent?.();

    const toast = document.createElement('div');
    toast.className = `se-toast${options.tone === 'danger' ? ' se-toast--danger' : ''}`;
    // A failure interrupts; a confirmation waits its turn.
    toast.setAttribute('role', options.tone === 'danger' ? 'alert' : 'status');
    const mark = document.createElement('span');
    mark.className = 'se-toast__mark';
    mark.setAttribute('aria-hidden', 'true');
    const message = document.createElement('span');
    message.className = 'se-toast__text';
    message.textContent = text;
    toast.append(mark, message);

    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      if (this.dismissCurrent === close) this.dismissCurrent = null;
      toast.classList.remove('se-toast--in');
      setTimeout(() => toast.remove(), 250);
    };
    const arm = (): void => {
      clearTimeout(timer);
      timer = setTimeout(close, options.duration ?? (options.action ? 5000 : 3000));
    };

    if (options.action) {
      const action = options.action;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'se-toast__action';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        close();
        action.run();
      });
      toast.append(button);
    }
    // Reading it holds it open: hover or keyboard focus pauses the clock.
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
    toast.addEventListener('mouseleave', arm);
    toast.addEventListener('focusin', () => clearTimeout(timer));
    toast.addEventListener('focusout', arm);

    this.dismissCurrent = close;
    this.hostElement().append(toast);
    requestAnimationFrame(() => toast.classList.add('se-toast--in'));
    arm();
  }

  /** Removes the toast on screen, if any. */
  clear(): void {
    this.dismissCurrent?.();
  }

  private hostElement(): HTMLElement {
    if (!this.host || !this.host.isConnected) {
      this.host = document.createElement('div');
      this.host.className = 'se-toast-host';
      document.body.append(this.host);
    }
    return this.host;
  }
}
