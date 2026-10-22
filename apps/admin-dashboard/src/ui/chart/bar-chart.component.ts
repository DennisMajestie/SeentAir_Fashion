import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CHART_CLOSE, CHART_OPEN, ChartRow, SeChartBase } from './chart-base';

/** A bar from the baseline `y0` to its value `y1`: square on the baseline, rounded at the data end. */
function bar(x: number, y0: number, y1: number, width: number): string {
  const r = Math.min(4, width / 2, Math.abs(y1 - y0));
  const back = y1 < y0 ? r : -r;
  const n = (value: number) => value.toFixed(1);
  return (
    `M${n(x)} ${n(y0)} V${n(y1 + back)} Q${n(x)} ${n(y1)} ${n(x + r)} ${n(y1)} ` +
    `H${n(x + width - r)} Q${n(x + width)} ${n(y1)} ${n(x + width)} ${n(y1 + back)} V${n(y0)} Z`
  );
}

/**
 * A bar chart: one measure compared across a handful of categories or
 * periods. Bars always grow from zero, so their lengths can be compared, and
 * a negative value hangs below the zero line.
 *
 *     <se-bar-chart title="Monthly profit" [labels]="months" [values]="profit" [formatValue]="money" />
 */
@Component({
  selector: 'se-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'se-bar-chart' },
  template: `
    ${CHART_OPEN}
    @for (b of bars(); track b.i) {
      <path
        class="se-bar-chart__bar se-chart__series--1"
        [class.se-bar-chart__bar--negative]="b.negative"
        [attr.d]="b.d"
      />
    }
    ${CHART_CLOSE}
  `,
})
export class SeBarChartComponent extends SeChartBase {
  /** One value per label. */
  readonly values = input.required<readonly number[]>();

  protected readonly banded = true;
  protected readonly fromZero = computed(() => true);
  protected readonly rows = computed<ChartRow[]>(() => [
    { name: 'Value', slot: 1, values: this.labels().map((_, i) => this.values()[i] ?? null) },
  ]);

  protected readonly bars = computed(() => {
    const f = this.frame();
    if (!f) return [];
    // Thin bars with air between them; never wider than a thumb on a wide chart.
    const width = Math.max(1, Math.min(f.band * 0.64, 40));
    return this.rows()[0].values.flatMap((v, i) => {
      if (v === null || !Number.isFinite(v)) return [];
      return [{ i, negative: v < 0, d: bar(f.x(i) - width / 2, f.base, f.y(v), width) }];
    });
  });
}
