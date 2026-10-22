import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { SeButtonDirective } from '../button/button.directive';

/**
 * What a screen shows when there is nothing to list: a heading, one line that
 * says why or what to do, and at most one action. No illustration.
 *
 *     <se-empty-state
 *       heading="No suppliers yet"
 *       text="Add the first supplier to start recording purchases."
 *       actionLabel="Add supplier"
 *       (action)="openDrawer()"
 *     />
 */
@Component({
  selector: 'se-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeButtonDirective],
  host: { class: 'se-empty' },
  template: `
    <p class="se-empty__heading">{{ heading() }}</p>
    @if (text()) {
      <p class="se-empty__text">{{ text() }}</p>
    }
    @if (actionLabel()) {
      <button seButton type="button" (click)="action.emit()">{{ actionLabel() }}</button>
    }
  `,
})
export class SeEmptyStateComponent {
  readonly heading = input.required<string>();
  readonly text = input('');
  readonly actionLabel = input('');
  readonly action = output<void>();
}
