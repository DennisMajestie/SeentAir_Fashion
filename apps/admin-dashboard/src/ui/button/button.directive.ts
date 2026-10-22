import { Directive, ElementRef, afterNextRender, inject, input, isDevMode } from '@angular/core';

export type SeButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type SeButtonSize = 'md' | 'sm';

/**
 * Turns a native `<button>` or `<a>` into a system button. The element stays
 * native, so keyboard, focus, forms and links all work as the browser intends.
 *
 *     <button seButton variant="primary" [loading]="saving()">Save order</button>
 *     <a seButton routerLink="/orders">View orders</a>
 *     <button seButton variant="ghost" iconOnly aria-label="Refresh"><se-icon name="refresh" /></button>
 *
 * `loading` keeps the button's width, swaps the label for a spinner and blocks
 * further presses, so a slow save cannot be submitted twice.
 */
@Directive({
  selector: 'button[seButton], a[seButton]',
  host: {
    class: 'se-btn',
    '[class.se-btn--primary]': "variant() === 'primary'",
    '[class.se-btn--secondary]': "variant() === 'secondary'",
    '[class.se-btn--ghost]': "variant() === 'ghost'",
    '[class.se-btn--danger]': "variant() === 'danger'",
    '[class.se-btn--sm]': "size() === 'sm'",
    '[class.se-btn--icon]': 'iconOnly()',
    '[attr.aria-busy]': "loading() ? 'true' : null",
    '[attr.aria-disabled]': "loading() ? 'true' : null",
  },
})
export class SeButtonDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly variant = input<SeButtonVariant>('secondary');
  readonly size = input<SeButtonSize>('md');
  readonly loading = input(false, { transform: booleanish });
  /** A square button holding only an icon. It must carry an `aria-label`. */
  readonly iconOnly = input(false, { transform: booleanish });

  constructor() {
    // A loading button stays focusable (disabling it would throw focus away
    // mid-save), so its click has to be swallowed instead. Capture phase, so
    // this runs before any (click) handler the template put on the element.
    this.host.nativeElement.addEventListener(
      'click',
      (event) => {
        if (this.loading()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      { capture: true },
    );
    afterNextRender(() => {
      const el = this.host.nativeElement;
      if (isDevMode() && this.iconOnly() && !el.getAttribute('aria-label')) {
        console.error('[seButton] An icon-only button needs an aria-label.', el);
      }
    });
  }
}

/** Lets a bare attribute (`<button seButton loading>`) mean true. */
export function booleanish(value: unknown): boolean {
  return value !== false && value !== null && value !== undefined && value !== 'false';
}
