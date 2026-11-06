import { Component, input } from '@angular/core';

/**
 * A shimmering skeleton placeholder. Renders a rounded rect with a moving
 * highlight so a page feels like it is loading rather than broken.
 *
 * `width`/`height` default to the card ratios used across the storefront so
 * callers can drop one in where a product card, category tile or price line
 * will eventually land without layout shift.
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [],
  template: `
    <span class="skeleton" [style.width]="width()" [style.height]="height()" aria-hidden="true"></span>
  `,
  styles: [`
    :host { display: inline-block; vertical-align: top; }
  `],
})
export class SkeletonComponent {
  readonly width = input<string>('100%');
  readonly height = input<string>('200px');
}
