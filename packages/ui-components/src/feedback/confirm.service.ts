import { Injectable } from '@angular/core';

export interface SeConfirmOptions {
  /** The question, naming the thing: "Delete supplier Aba Textile Mills?" */
  title: string;
  /**
   * What will happen if they go ahead, stated plainly. Required: a dialog that
   * only asks "Are you sure?" gives no reason to stop and think.
   */
  consequence: string;
  /** The verb for the confirm button: "Delete supplier", not "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Destroys, rejects or cannot be undone: red button, focus starts on Cancel. */
  danger?: boolean;
}

let nextDialogId = 0;

/**
 * The confirmation dialog for destructive and approval actions. One pattern in
 * every app: the title names the action, the body states the consequence, the
 * confirm button repeats the verb.
 *
 *     const ok = await confirm.ask({
 *       title: 'Reject this price change?',
 *       consequence: 'The request is closed and the price stays at 5,000. This is written to the audit log.',
 *       confirmLabel: 'Reject request',
 *       danger: true,
 *     });
 *
 * Built on the native <dialog>: focus is trapped, Escape cancels, the page
 * behind is inert. Resolves true only on confirm.
 */
@Injectable({ providedIn: 'root' })
export class SeConfirmService {
  ask(options: SeConfirmOptions): Promise<boolean> {
    if (typeof document === 'undefined') return Promise.resolve(false);
    const id = `se-dialog-${++nextDialogId}`;
    const dialog = document.createElement('dialog');
    dialog.className = 'se-dialog';
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.setAttribute('aria-describedby', `${id}-body`);

    const body = document.createElement('div');
    body.className = 'se-dialog__body';
    const title = document.createElement('h2');
    title.className = 'se-dialog__title';
    title.id = `${id}-title`;
    title.textContent = options.title;
    const consequence = document.createElement('p');
    consequence.className = 'se-dialog__consequence';
    consequence.id = `${id}-body`;
    consequence.textContent = options.consequence;
    body.append(title, consequence);

    const actions = document.createElement('div');
    actions.className = 'se-dialog__actions';
    const button = (label: string, variant: string, value: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `se-btn se-btn--${variant}`;
      b.textContent = label;
      b.addEventListener('click', () => dialog.close(value));
      actions.append(b);
      return b;
    };
    const cancel = button(options.cancelLabel ?? 'Cancel', 'secondary', 'cancel');
    const confirm = button(options.confirmLabel, options.danger ? 'danger' : 'primary', 'confirm');
    // A destructive choice should not be one stray Enter away.
    (options.danger ? cancel : confirm).autofocus = true;
    dialog.append(body, actions);

    return new Promise<boolean>((resolve) => {
      // A click on the dialog element itself landed on the backdrop.
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close('cancel');
      });
      // Buttons, backdrop and Escape all end here.
      dialog.addEventListener('close', () => {
        dialog.remove();
        resolve(dialog.returnValue === 'confirm');
      });
      document.body.append(dialog);
      dialog.showModal();
    });
  }
}
