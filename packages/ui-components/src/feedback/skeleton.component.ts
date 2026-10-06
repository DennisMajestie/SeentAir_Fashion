import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SeSkeletonShape = 'text' | 'title' | 'block' | 'table' | 'metric' | 'form' | 'detail';

/**
 * A loading placeholder in the shape of what is about to appear, so the page
 * does not jump when the data lands. Never a spinner on a whole page.
 *
 *     <se-skeleton shape="table" [rows]="8" [columns]="5" />
 *     <se-skeleton shape="metric" />
 *
 * Shapes: `text` (lines of copy), `title`, `block` (a chart or image), `table`,
 * `metric` (a metric card), `form` (label + control pairs), `detail` (a detail
 * page: header, then key/value rows).
 *
 * It is decorative: put `aria-busy="true"` on the region that is loading.
 */
@Component({
  selector: 'se-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'se-skeleton se-skeleton--' + shape()", 'aria-hidden': 'true' },
  template: `
    @switch (shape()) {
      @case ('table') {
        @for (r of rowList(); track r) {
          <div class="se-skeleton__row">
            @for (c of columnList(); track c) {
              <span class="se-skeleton__bar"></span>
            }
          </div>
        }
      }
      @case ('metric') {
        <span class="se-skeleton__bar se-skeleton__bar--short"></span>
        <span class="se-skeleton__bar se-skeleton__bar--tall"></span>
        <span class="se-skeleton__bar se-skeleton__bar--short"></span>
      }
      @case ('form') {
        @for (r of rowList(); track r) {
          <span class="se-skeleton__bar se-skeleton__bar--short"></span>
          <span class="se-skeleton__bar se-skeleton__bar--control"></span>
        }
      }
      @case ('detail') {
        <span class="se-skeleton__bar se-skeleton__bar--tall se-skeleton__bar--half"></span>
        @for (r of rowList(); track r) {
          <div class="se-skeleton__row">
            <span class="se-skeleton__bar"></span>
            <span class="se-skeleton__bar"></span>
          </div>
        }
      }
      @case ('title') {
        <span class="se-skeleton__bar se-skeleton__bar--tall se-skeleton__bar--half"></span>
      }
      @case ('block') {
        <span class="se-skeleton__bar se-skeleton__bar--block"></span>
      }
      @default {
        @for (r of rowList(); track r; let last = $last) {
          <span class="se-skeleton__bar" [class.se-skeleton__bar--half]="last"></span>
        }
      }
    }
  `,
})
export class SeSkeletonComponent {
  readonly shape = input<SeSkeletonShape>('text');
  /** Lines, table rows, form fields or detail rows, depending on the shape. */
  readonly rows = input(3);
  /** Table columns. */
  readonly columns = input(4);

  readonly rowList = computed(() => Array.from({ length: Math.max(1, this.rows()) }, (_, i) => i));
  readonly columnList = computed(() =>
    Array.from({ length: Math.max(1, this.columns()) }, (_, i) => i),
  );
}
