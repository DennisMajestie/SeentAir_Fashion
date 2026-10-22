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

/** A confirmation that also collects why: rejecting a request, cancelling an order. */
export interface SeReasonOptions extends SeConfirmOptions {
  /** The label of the reason field: "Reason for rejection". */
  reasonLabel: string;
  reasonHint?: string;
  /** Whether a reason must be given. Defaults to true. */
  reasonRequired?: boolean;
}

let nextDialogId = 0;

/**
 * The confirmation dialog for destructive and approval actions. One pattern in
 * every app: the title names the action, the body states the consequence, the
 * confirm button repeats the verb.
 *
 *     const ok = await confirm.ask({
 *       title: 'Delete supplier Aba Textile Mills?',
 *       consequence: 'The supplier is removed from the list. This cannot be undone.',
 *       confirmLabel: 'Delete supplier',
 *       danger: true,
 *     });
 *
 *     const reason = await confirm.askWithReason({
 *       title: 'Reject this price change?',
 *       consequence: 'The request is closed and the price stays as it is. Your reason is sent to the requester and written to the audit log.',
 *       confirmLabel: 'Reject request',
 *       reasonLabel: 'Reason for rejection',
 *       danger: true,
 *     });   // the reason, or null if they backed out
 *
 * Built on the native <dialog>: focus is trapped, Escape cancels, the page
 * behind is inert.
 */
@Injectable({ providedIn: 'root' })
export class SeConfirmService {
  /** Resolves true only on confirm. */
  ask(options: SeConfirmOptions): Promise<boolean> {
    return this.open(options, null).then((result) => result !== null);
  }

  /** Resolves the reason typed (possibly empty when not required), or null when cancelled. */
  askWithReason(options: SeReasonOptions): Promise<string | null> {
    return this.open(options, options);
  }

  private open(options: SeConfirmOptions, reason: SeReasonOptions | null): Promise<string | null> {
    if (typeof document === 'undefined') return Promise.resolve(null);
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

    // The reason field, built to the same contract as <se-field>: a real
    // label, a hint, and an error in a live region that exists beforehand.
    let textarea: HTMLTextAreaElement | null = null;
    let error: HTMLElement | null = null;
    if (reason) {
      const field = document.createElement('div');
      field.className = 'se-field se-dialog__reason';
      const label = document.createElement('label');
      label.className = 'se-field__label';
      label.htmlFor = `${id}-reason`;
      label.textContent = reason.reasonLabel;
      textarea = document.createElement('textarea');
      textarea.className = 'se-input';
      textarea.id = `${id}-reason`;
      textarea.rows = 3;
      error = document.createElement('p');
      error.className = 'se-field__error';
      error.id = `${id}-reason-error`;
      error.setAttribute('aria-live', 'polite');
      textarea.setAttribute('aria-describedby', error.id);
      field.append(label, textarea);
      if (reason.reasonHint) {
        const hint = document.createElement('p');
        hint.className = 'se-field__hint';
        hint.id = `${id}-reason-hint`;
        hint.textContent = reason.reasonHint;
        textarea.setAttribute('aria-describedby', `${hint.id} ${error.id}`);
        field.append(hint);
      }
      field.append(error);
      body.append(field);
    }

    const actions = document.createElement('div');
    actions.className = 'se-dialog__actions';
    const button = (label: string, variant: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `se-btn se-btn--${variant}`;
      b.textContent = label;
      actions.append(b);
      return b;
    };
    const cancel = button(options.cancelLabel ?? 'Cancel', 'secondary');
    const confirm = button(options.confirmLabel, options.danger ? 'danger' : 'primary');
    cancel.addEventListener('click', () => dialog.close('cancel'));
    confirm.addEventListener('click', () => {
      if (
        reason &&
        textarea &&
        error &&
        reason.reasonRequired !== false &&
        !textarea.value.trim()
      ) {
        // Say what is missing and put the cursor where it goes.
        error.textContent = `Enter the ${reason.reasonLabel.toLowerCase()} to continue.`;
        textarea.setAttribute('aria-invalid', 'true');
        textarea.focus();
        return;
      }
      dialog.close('confirm');
    });
    // With a reason to type, start in the field. Otherwise a destructive
    // choice starts on Cancel, so it is not one stray Enter away.
    (textarea ?? (options.danger ? cancel : confirm)).autofocus = true;
    dialog.append(body, actions);

    return new Promise<string | null>((resolve) => {
      // A click on the dialog element itself landed on the backdrop.
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close('cancel');
      });
      // Buttons, backdrop and Escape all end here.
      dialog.addEventListener('close', () => {
        dialog.remove();
        resolve(dialog.returnValue === 'confirm' ? (textarea?.value.trim() ?? '') : null);
      });
      document.body.append(dialog);
      dialog.showModal();
    });
  }
}
