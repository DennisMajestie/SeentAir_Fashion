import { Injectable } from '@angular/core';

type Icon = 'success' | 'error' | 'warning' | 'info' | 'question';

/** Options for a branded confirmation dialog. */
export interface AlertConfirm {
  title: string;
  /** Supporting sentence under the title. Rendered as text, never as markup. */
  html?: string;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
  icon?: Icon;
}

/** Options for a non-blocking notification toast. */
export interface AlertToast {
  icon?: Icon;
  timer?: number;
  /** One follow-up the notice can offer, e.g. "View cart". */
  action?: { label: string; run: () => void };
}

/** Stroke paths on a 24px grid, one per tone. */
const ICON_PATHS: Record<Icon, string[]> = {
  success: ['M5 12.5l4.5 4.5L19 7.5'],
  error: ['M7 7l10 10', 'M17 7 7 17'],
  warning: ['M12 6.5v7', 'M12 17v.5'],
  info: ['M12 10.5v7', 'M12 6.5v.5'],
  question: ['M9.2 9.2a2.9 2.9 0 1 1 4.3 2.5c-.9.5-1.5 1.1-1.5 2.1', 'M12 17v.5'],
};

const SVG_NS = 'http://www.w3.org/2000/svg';
let nextId = 0;

/**
 * Seentair's own notices: a toast and a dialog, built on the platform rather
 * than on a popup library.
 *
 * The toast is a small ink pill at the bottom of the screen. It never covers
 * what the person is doing, a new one replaces the old one instead of stacking,
 * and it can carry a single follow-up action.
 *
 * The dialog is a native <dialog>, so focus trapping, Escape and the inert
 * page behind it come from the browser. It is a bottom sheet on a phone and a
 * centred card on a wide screen. All styling lives in styles.scss under .ba-*.
 */
@Injectable({ providedIn: 'root' })
export class BrandAlertService {
  private host: HTMLElement | null = null;
  private closeToast: (() => void) | null = null;

  /** Non-blocking toast for confirmations and errors. Resolves when it leaves. */
  toast(text: string, opts: AlertToast = {}): Promise<void> {
    if (typeof document === 'undefined') return Promise.resolve();
    // One notice at a time: a second add-to-cart replaces the first.
    this.closeToast?.();

    const tone = opts.icon ?? 'success';
    const el = document.createElement('div');
    el.className = `ba-toast ba-toast--${tone}`;
    el.setAttribute('role', tone === 'error' ? 'alert' : 'status');

    const message = document.createElement('span');
    message.className = 'ba-toast__text';
    message.textContent = text;
    el.append(this.icon(tone, 'ba-toast__icon'), message);

    return new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        if (this.closeToast === close) this.closeToast = null;
        el.classList.remove('is-in');
        // Long enough for the exit transition, then out of the DOM.
        setTimeout(() => el.remove(), 220);
        resolve();
      };
      const arm = (): void => {
        clearTimeout(timer);
        timer = setTimeout(close, opts.timer ?? (opts.action ? 4200 : 2600));
      };

      if (opts.action) {
        const action = opts.action;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ba-toast__action';
        btn.textContent = action.label;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          close();
          action.run();
        });
        el.append(btn);
      }

      // Tap to dismiss; reading it (hover or keyboard focus) holds it open.
      el.addEventListener('click', close);
      el.addEventListener('mouseenter', () => clearTimeout(timer));
      el.addEventListener('mouseleave', arm);
      el.addEventListener('focusin', () => clearTimeout(timer));
      el.addEventListener('focusout', arm);

      this.closeToast = close;
      this.toastHost().append(el);
      // Next frame, so the entry transition has a starting state to run from.
      requestAnimationFrame(() => el.classList.add('is-in'));
      arm();
    });
  }

  /** Branded confirmation. Resolves true only when the user confirms. */
  confirm(opts: AlertConfirm): Promise<boolean> {
    return this.dialog({
      title: opts.title,
      body: opts.html,
      tone: opts.icon ?? 'question',
      confirm: opts.confirm ?? 'Confirm',
      cancel: opts.cancel ?? 'Cancel',
      danger: opts.danger === true,
    });
  }

  /** Branded informational alert. */
  async alert(text: string, title = 'Seentair', icon: Icon = 'info'): Promise<void> {
    await this.dialog({ title, body: text, tone: icon, confirm: 'Close', danger: false });
  }

  private dialog(o: {
    title: string;
    body?: string;
    tone: Icon;
    confirm: string;
    cancel?: string;
    danger: boolean;
  }): Promise<boolean> {
    if (typeof document === 'undefined') return Promise.resolve(false);
    const id = `ba-dialog-${++nextId}`;
    const dlg = document.createElement('dialog');
    dlg.className = 'ba-dialog' + (o.danger || o.tone === 'error' ? ' ba-dialog--danger' : '');
    dlg.setAttribute('aria-labelledby', `${id}-title`);

    const card = document.createElement('div');
    card.className = 'ba-dialog__card';

    // A div with a heading role, not an <h2>: every app styles its headings
    // globally (display face, capitals, rules) and none of that belongs here.
    const title = document.createElement('div');
    title.className = 'ba-dialog__title';
    title.id = `${id}-title`;
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '2');
    title.textContent = o.title;
    card.append(this.icon(o.tone, 'ba-dialog__icon'), title);

    if (o.body) {
      const body = document.createElement('div');
      body.className = 'ba-dialog__body';
      body.id = `${id}-body`;
      body.textContent = o.body;
      dlg.setAttribute('aria-describedby', body.id);
      card.append(body);
    }

    const actions = document.createElement('div');
    actions.className = 'ba-dialog__actions';
    const button = (label: string, cls: string, value: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ba-btn ${cls}`;
      b.textContent = label;
      b.addEventListener('click', () => dlg.close(value));
      actions.append(b);
      return b;
    };
    const cancel = o.cancel ? button(o.cancel, 'ba-cancel', 'cancel') : null;
    const confirm = button(o.confirm, o.danger ? 'ba-danger' : 'ba-confirm', 'confirm');
    // A destructive choice should not be one stray Enter away.
    (o.danger && cancel ? cancel : confirm).autofocus = true;
    card.append(actions);
    dlg.append(card);

    return new Promise<boolean>((resolve) => {
      // A click that lands on the dialog element itself is on the backdrop.
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) dlg.close('cancel');
      });
      // Fires for the buttons, the backdrop and Escape alike.
      dlg.addEventListener('close', () => {
        dlg.remove();
        resolve(dlg.returnValue === 'confirm');
      });
      document.body.append(dlg);
      dlg.showModal();
    });
  }

  /** One polite live region, created on first use and reused for every toast. */
  private toastHost(): HTMLElement {
    if (!this.host || !this.host.isConnected) {
      this.host = document.createElement('div');
      this.host.className = 'ba-toast-host';
      document.body.append(this.host);
    }
    return this.host;
  }

  private icon(tone: Icon, className: string): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = className;
    wrap.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('focusable', 'false');
    for (const d of ICON_PATHS[tone]) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    wrap.append(svg);
    return wrap;
  }
}
