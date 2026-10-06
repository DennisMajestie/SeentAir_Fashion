import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { SeIconComponent } from '../icon/icon.component';

/**
 * A search box: icon, input and a clear button once there is text.
 *
 *     <se-search label="Search orders" [(value)]="query" />
 *
 * `label` is the accessible name and is required; the placeholder is only a
 * hint and disappears as soon as someone types.
 */
@Component({
  selector: 'se-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeIconComponent],
  host: { class: 'se-search' },
  template: `
    <se-icon name="search" />
    <input
      #box
      class="se-input"
      type="search"
      autocomplete="off"
      spellcheck="false"
      [attr.aria-label]="label()"
      [placeholder]="placeholder()"
      [value]="value()"
      (input)="value.set(box.value)"
    />
    @if (value()) {
      <button
        class="se-search__clear"
        type="button"
        aria-label="Clear search"
        (click)="value.set(''); box.focus()"
      >
        <se-icon name="close" />
      </button>
    }
  `,
})
export class SeSearchComponent {
  readonly label = input.required<string>();
  readonly placeholder = input('Search');
  readonly value = model('');
}
