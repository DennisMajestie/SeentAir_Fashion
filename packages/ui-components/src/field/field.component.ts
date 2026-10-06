import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { booleanish } from '../button/button.directive';
import { SeIconComponent } from '../icon/icon.component';

let nextFieldId = 0;

/**
 * A form field: a real `<label>`, the control, an optional hint and an error
 * that is announced as well as coloured.
 *
 *     <se-field label="Supplier name" hint="As it appears on their invoice" [error]="nameError()">
 *       <input seInput [(ngModel)]="name" />
 *     </se-field>
 *
 * The field wires the label, hint and error to the control for you
 * (`for`/`id`, `aria-describedby`, `aria-invalid`), so they cannot drift apart.
 *
 * For a set of checkboxes or radios, add `group`: the field becomes a
 * `<fieldset>` with a `<legend>`, which is what makes the question itself
 * announced with each option.
 */
@Component({
  selector: 'se-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, SeIconComponent],
  host: { class: 'se-field', '[class.se-field--invalid]': '!!error()' },
  template: `
    <ng-template #control><ng-content /></ng-template>

    @if (group()) {
      <fieldset class="se-field__set" [attr.aria-describedby]="describedBy()">
        <legend class="se-field__label" [class.se-sr-only]="hideLabel()">
          {{ label() }}
          @if (optional()) {
            <span class="se-field__optional">optional</span>
          }
        </legend>
        <div class="se-field__options"><ng-container [ngTemplateOutlet]="control" /></div>
      </fieldset>
    } @else {
      <label class="se-field__label" [attr.for]="controlId()" [class.se-sr-only]="hideLabel()">
        {{ label() }}
        @if (optional()) {
          <span class="se-field__optional">optional</span>
        }
      </label>
      <ng-container [ngTemplateOutlet]="control" />
    }

    @if (hint() && !error()) {
      <p class="se-field__hint" [id]="hintId">{{ hint() }}</p>
    }
    <!-- Always in the DOM: a live region only announces changes to content it
         already owns, so the error text is inserted into it, not with it. -->
    <p class="se-field__error" [id]="errorId" aria-live="polite">
      @if (error()) {
        <se-icon name="alert" />
        <span>{{ error() }}</span>
      }
    </p>
  `,
})
export class SeFieldComponent {
  readonly label = input.required<string>();
  readonly hint = input<string>('');
  /** The problem with the current value, in words. Empty or null means valid. */
  readonly error = input<string | null | undefined>('');
  /** Marks the field as not required. Required is the default and is unmarked. */
  readonly optional = input(false, { transform: booleanish });
  /** Keeps the label for assistive technology but hides it visually (toolbars). */
  readonly hideLabel = input(false, { transform: booleanish });
  /** Render as fieldset + legend, for a set of checkboxes or radios. */
  readonly group = input(false, { transform: booleanish });

  private readonly uid = `se-field-${++nextFieldId}`;
  readonly controlId = signal(`${this.uid}-control`);
  readonly hintId = `${this.uid}-hint`;
  readonly errorId = `${this.uid}-error`;

  /** What the control (or the fieldset) is described by right now. */
  readonly describedBy = computed(() =>
    this.error() ? this.errorId : this.hint() ? this.hintId : null,
  );
}

/**
 * Marks the control inside a field: `<input seInput>`, `<select seInput>` or
 * `<textarea seInput>`. Applies the system styling and, inside an `<se-field>`,
 * takes its id and its described-by/invalid state from the field.
 *
 * Used alone (a filter in a toolbar, say) it must be given an `aria-label`.
 */
@Directive({
  selector: 'input[seInput], select[seInput], textarea[seInput]',
  host: {
    class: 'se-input',
    '[attr.id]': 'field ? field.controlId() : null',
    '[attr.aria-describedby]': 'field ? field.describedBy() : null',
    '[attr.aria-invalid]': "field && field.error() ? 'true' : null",
  },
})
export class SeInputDirective {
  readonly field = inject(SeFieldComponent, { optional: true });

  constructor() {
    // An id the author wrote wins: the label is pointed at it instead.
    const own = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.id;
    if (own && this.field) this.field.controlId.set(own);
  }
}
