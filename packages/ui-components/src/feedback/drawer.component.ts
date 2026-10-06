import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  model,
  viewChild,
} from '@angular/core';
import { SeButtonDirective } from '../button/button.directive';
import { SeIconComponent } from '../icon/icon.component';

let nextDrawerId = 0;

/**
 * A side drawer: a short form or a detail view that opens over the page from
 * the right, keeping the list behind it in place.
 *
 *     <se-drawer title="Add supplier" [(open)]="adding">
 *       ...fields...
 *       <ng-container seDrawerFooter>
 *         <button seButton (click)="adding.set(false)">Cancel</button>
 *         <button seButton variant="primary" (click)="save()">Save supplier</button>
 *       </ng-container>
 *     </se-drawer>
 *
 * A native <dialog> shown modally: focus is trapped inside, Escape and the
 * backdrop close it, and focus returns to whatever opened it.
 */
@Component({
  selector: 'se-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeButtonDirective, SeIconComponent],
  template: `
    <dialog
      #dialog
      class="se-drawer"
      [attr.aria-labelledby]="titleId"
      (close)="open.set(false)"
      (click)="backdrop($event)"
    >
      <header class="se-drawer__header">
        <h2 class="se-drawer__title" [id]="titleId">{{ title() }}</h2>
        <button
          seButton
          variant="ghost"
          iconOnly
          type="button"
          aria-label="Close"
          (click)="open.set(false)"
        >
          <se-icon name="close" />
        </button>
      </header>
      <div class="se-drawer__body"><ng-content /></div>
      <footer class="se-drawer__footer"><ng-content select="[seDrawerFooter]" /></footer>
    </dialog>
  `,
})
export class SeDrawerComponent {
  readonly title = input.required<string>();
  readonly open = model(false);

  readonly titleId = `se-drawer-${++nextDrawerId}-title`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) el.showModal();
      else if (!this.open() && el.open) el.close();
    });
  }

  /** A click on the dialog element itself is a click on the backdrop. */
  backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.open.set(false);
  }
}
