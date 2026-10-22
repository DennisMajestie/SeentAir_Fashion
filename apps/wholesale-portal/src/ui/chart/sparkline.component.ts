import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A sparkline: the shape of a trend with no axes, for a metric card or a table
 * cell. It shows direction, not values, so it always sits beside the number it
 * belongs to.
 *
 *     <se-sparkline [values]="lastThirtyDays" label="Sales over the last 30 days, rising" />
 */
@Component({
  selector: 'se-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'se-sparkline',
    role: 'img',
    '[attr.aria-label]': 'label()',
  },
  template: `
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" focusable="false" aria-hidden="true">
      @if (area(); as a) {
        <path class="se-sparkline__area" [attr.d]="a" />
        <path class="se-sparkline__line" [attr.d]="line()" />
      }
    </svg>
  `,
})
export class SeSparklineComponent {
  readonly values = input.required<readonly number[]>();
  /** What the trend is, in words. Required: the picture says nothing to a screen reader. */
  readonly label = input.required<string>();

  private readonly points = computed(() => {
    const v = this.values();
    if (v.length < 2) return [];
    const min = Math.min(...v);
    const span = Math.max(...v) - min || 1;
    // 2 units of headroom top and bottom so the stroke is never clipped.
    return v.map((y, i) => [(i / (v.length - 1)) * 100, 30 - ((y - min) / span) * 28] as const);
  });
  readonly line = computed(() =>
    this.points()
      .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(' '),
  );
  readonly area = computed(() => (this.points().length ? `${this.line()} L100 32 L0 32 Z` : ''));
}
