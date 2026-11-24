import { Injectable } from '@angular/core';

export type SeAlertTone = 'success' | 'neutral' | 'error';

/** A terminal outcome: what happened, plus an optional two-way follow-up. */
export interface SeAlertOptions {
  title: string;
  message: string;
  tone?: SeAlertTone;
  question?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

let nextAlertId = 0;

/**
 * The alert is used by every app, including ones with their own global styles
 * (the storefront is Stitch-verbatim). Inject once so it works everywhere.
 */
const ALERT_CSS = `
.se-alert{width:min(100% - 32px,310px);max-width:none;margin:auto;padding:0;border:0;background:transparent;color:#1b1916;overflow:visible}
.se-alert::backdrop{background:rgba(23,20,17,.55)}
.se-alert__card{display:flex;flex-direction:column;align-items:center;text-align:center;padding:24px 20px 20px;border:1px solid #e8e1d3;border-radius:22px;background:#fffdf9;box-shadow:0 20px 48px -8px rgba(27,25,22,.22)}
.se-alert__disc{display:grid;place-items:center;width:56px;height:56px;margin-bottom:16px;border-radius:999px;background:#23804d;color:#fff;font:700 24px/1 sans-serif}
.se-alert--error .se-alert__disc{background:#bf3a2d}
.se-alert--neutral .se-alert__disc{background:#93600a}
.se-alert__disc svg{width:28px;height:28px}
.se-alert__title{margin:0;font:700 17px/22px sans-serif;letter-spacing:-.2px;color:#1b1916}
.se-alert__message{margin:4px 0 0;font:500 13px/18px sans-serif;color:#7b756a}
.se-alert__divider{width:100%;height:1px;margin:16px 0;background:#e8e1d3}
.se-alert__question{margin:0 0 12px;font:600 13px/18px sans-serif;color:#1b1916}
.se-alert__actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%}
.se-alert__btn{min-height:44px;padding:0 16px;border:1px solid transparent;border-radius:14px;font:600 13px/18px sans-serif;cursor:pointer}
.se-alert__btn:focus-visible{outline:2px solid #c88a12;outline-offset:2px}
.se-alert__btn--quiet{background:#f2ece0;color:#1b1916;border-color:#e8e1d3}
.se-alert__btn--primary{background:#c88a12;color:#1a1405}
.se-alert__btn--wide{width:100%;margin-top:16px}
@media(prefers-color-scheme:dark){.se-alert__card{background:#1f1c18;border-color:#3d3830}.se-alert__title{color:#f7f2ea}.se-alert__message{color:#aba496}.se-alert__divider{background:#3d3830}.se-alert__question{color:#f7f2ea}.se-alert__btn--quiet{background:#2b2721;color:#f7f2ea;border-color:#3d3830}}
@media(prefers-reduced-motion:reduce){.se-alert *{animation:none!important}}
`;

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('se-alert-styles')) return;
  const style = document.createElement('style');
  style.id = 'se-alert-styles';
  style.textContent = ALERT_CSS;
  document.head.append(style);
}

/**
 * The platform confirmation alert: a solid status disc, a headline, a caption,
 * a hairline divider and optional side-by-side actions. Built on native
 * <dialog> so focus is trapped, Escape dismisses, and the page behind is inert.
 *
 *     await alert.show({
 *       title: 'Payment successful',
 *       message: '₦800,800 paid via Access Bank',
 *       question: 'Would you like a receipt?',
 *       cancelLabel: 'No, thanks',
 *       confirmLabel: 'Print receipt',
 *     }); // true when the primary action was chosen
 */
@Injectable({ providedIn: 'root' })
export class SeAlertService {
  show(options: SeAlertOptions): Promise<boolean> {
    if (typeof document === 'undefined') return Promise.resolve(false);
    ensureStyles();
    const id = `se-alert-${++nextAlertId}`;
    const tone = options.tone ?? 'success';
    const dialog = document.createElement('dialog');
    dialog.className = `se-alert se-alert--${tone}`;
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.setAttribute('aria-describedby', `${id}-message`);

    const card = document.createElement('div');
    card.className = 'se-alert__card';

    const disc = document.createElement('div');
    disc.className = 'se-alert__disc';
    disc.innerHTML =
      tone === 'success'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '<span aria-hidden="true">' + (tone === 'error' ? '!' : 'i') + '</span>';

    const title = document.createElement('h2');
    title.className = 'se-alert__title';
    title.id = `${id}-title`;
    title.textContent = options.title;

    const message = document.createElement('p');
    message.className = 'se-alert__message';
    message.id = `${id}-message`;
    message.textContent = options.message;

    card.append(disc, title, message);

    if (options.question) {
      const divider = document.createElement('div');
      divider.className = 'se-alert__divider';
      const question = document.createElement('p');
      question.className = 'se-alert__question';
      question.textContent = options.question;
      card.append(divider, question);

      const actions = document.createElement('div');
      actions.className = 'se-alert__actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'se-alert__btn se-alert__btn--quiet';
      cancel.textContent = options.cancelLabel ?? 'No, thanks';
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'se-alert__btn se-alert__btn--primary';
      confirm.textContent = options.confirmLabel ?? 'Continue';
      actions.append(cancel, confirm);
      card.append(actions);

      return new Promise<boolean>((resolve) => {
        const finish = (result: boolean) => {
          cancel.removeEventListener('click', onCancel);
          confirm.removeEventListener('click', onConfirm);
          dialog.removeEventListener('close', onClose);
          dialog.close();
          dialog.remove();
          resolve(result);
        };
        const onCancel = () => finish(false);
        const onConfirm = () => finish(true);
        const onClose = () => finish(false);
        cancel.addEventListener('click', onCancel);
        confirm.addEventListener('click', onConfirm);
        dialog.addEventListener('close', onClose);
        document.body.append(dialog);
        cancel.focus();
        dialog.showModal();
      });
    }

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'se-alert__btn se-alert__btn--primary se-alert__btn--wide';
    dismiss.textContent = options.confirmLabel ?? 'Done';
    card.append(dismiss);

    return new Promise<boolean>((resolve) => {
      const finish = (result: boolean) => {
        dismiss.removeEventListener('click', onDismiss);
        dialog.removeEventListener('close', onClose);
        if (dialog.open) dialog.close();
        dialog.remove();
        resolve(result);
      };
      const onDismiss = () => finish(true);
      const onClose = () => finish(false);
      dismiss.addEventListener('click', onDismiss);
      dialog.addEventListener('close', onClose);
      document.body.append(dialog);
      dismiss.focus();
      dialog.showModal();
    });
  }
}
