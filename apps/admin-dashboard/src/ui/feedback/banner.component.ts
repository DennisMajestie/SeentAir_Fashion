import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { booleanish, SeButtonDirective } from '../button/button.directive';
import { SeIconComponent, SeIconName } from '../icon/icon.component';

export type SeTone = 'info' | 'success' | 'warning' | 'danger';

const TONE_ICON: Record<SeTone, SeIconName> = {
  info: 'info',
  success: 'check-circle',
  warning: 'alert',
  danger: 'x-circle',
};

/**
 * An inline banner: a message that belongs to the page or section it sits in
 * and stays until the situation changes.
 *
 *     <se-banner tone="danger" title="Orders could not be loaded" actionLabel="Try again" (action)="reload()">
 *       The server did not respond. Nothing has been changed.
 *     </se-banner>
 *
 * Warning and danger banners are announced immediately (role="alert"); info and
 * success are announced politely (role="status").
 */
@Component({
  selector: 'se-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeButtonDirective, SeIconComponent],
  host: {
    '[class]': "'se-banner se-banner--' + tone()",
    '[attr.role]': 'role()',
  },
  template: `
    <se-icon [name]="icon()" />
    <div class="se-banner__body">
      @if (title()) {
        <p class="se-banner__title">{{ title() }}</p>
      }
      <div class="se-banner__text"><ng-content /></div>
    </div>
    @if (actionLabel()) {
      <button seButton size="sm" type="button" (click)="action.emit()">{{ actionLabel() }}</button>
    }
    @if (dismissible()) {
      <button
        seButton
        variant="ghost"
        size="sm"
        iconOnly
        type="button"
        aria-label="Dismiss"
        (click)="dismiss.emit()"
      >
        <se-icon name="close" />
      </button>
    }
  `,
})
export class SeBannerComponent {
  readonly tone = input<SeTone>('info');
  readonly title = input('');
  readonly actionLabel = input('');
  readonly dismissible = input(false, { transform: booleanish });
  readonly action = output<void>();
  readonly dismiss = output<void>();

  readonly icon = computed(() => TONE_ICON[this.tone()]);
  readonly role = computed(() =>
    this.tone() === 'danger' || this.tone() === 'warning' ? 'alert' : 'status',
  );
}
