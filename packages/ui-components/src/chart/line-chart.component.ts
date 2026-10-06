import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { booleanish } from '../button/button.directive';
import { CHART_CLOSE, CHART_OPEN, ChartRow, SeChartBase, SeChartSeries } from './chart-base';

type Point = readonly [x: number, y: number];
const n = (value: number): string => value.toFixed(1);
const trace = (run: readonly Point[]): string =>
  run.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join(' ');

/**
 * A line chart: how one to five measures change over time, on one shared
 * value axis.
 *
 *     <se-line-chart
 *       title="Daily sales, last 30 days"
 *       [labels]="days"
 *       [series]="[{ name: 'Retail', values: retail }, { name: 'Wholesale', values: wholesale }]"
 *       [formatValue]="money"
 *     />
 *
 * Series take the chart colours in the order given, so keep that order the
 * same wherever the same series appear. Only the first five are drawn: a sixth
 * line is a sign the chart should be split up. `area` fills under a single
 * series and starts the axis at zero; it is ignored when there are several.
 */
@Component({
  selector: 'se-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'se-line-chart' },
  template: `
    ${CHART_OPEN}
    @if (areaPath(); as a) {
      <path class="se-line-chart__area se-chart__series--1" [attr.d]="a" />
    }
    @for (l of lines(); track l.slot) {
      <path [attr.class]="'se-line-chart__line se-chart__series--' + l.slot" [attr.d]="l.d" />
    }
    @if (tip(); as t) {
      <line
        class="se-chart__guide"
        [attr.x1]="t.x"
        [attr.x2]="t.x"
        [attr.y1]="f.top"
        [attr.y2]="f.bottom"
      />
      @for (r of t.rows; track r.slot) {
        @if (r.y !== null) {
          <circle
            [attr.class]="'se-line-chart__dot se-chart__series--' + r.slot"
            [attr.cx]="t.x"
            [attr.cy]="r.y"
            r="4"
          />
        }
      }
    }
    ${CHART_CLOSE}
  `,
})
export class SeLineChartComponent extends SeChartBase {
  readonly series = input.required<readonly SeChartSeries[]>();
  /** Fill under the line. For a single series only. */
  readonly area = input(false, { transform: booleanish });

  protected readonly banded = false;
  protected readonly rows = computed<ChartRow[]>(() =>
    this.series()
      .slice(0, 5)
      .map((s, i) => ({ ...s, slot: i + 1 })),
  );
  protected readonly fromZero = computed(() => this.area() && this.rows().length === 1);

  /** Each series as runs of consecutive points: a null value ends one run and starts the next. */
  private readonly runs = computed(() => {
    const f = this.frame();
    if (!f) return [];
    return this.rows().map((row) => {
      const runs: Point[][] = [];
      let open = false;
      this.labels().forEach((_, i) => {
        const v = row.values[i] ?? null;
        if (v === null || !Number.isFinite(v)) {
          open = false;
          return;
        }
        if (!open) runs.push([]);
        open = true;
        runs[runs.length - 1].push([f.x(i), f.y(v)]);
      });
      return { slot: row.slot, runs };
    });
  });

  protected readonly lines = computed(() =>
    this.runs().map(({ slot, runs }) => ({
      slot,
      // A lone point between two gaps still shows: a zero-length segment draws its round cap.
      d: runs.map((run) => (run.length > 1 ? trace(run) : `${trace(run)} h0`)).join(' '),
    })),
  );

  protected readonly areaPath = computed(() => {
    const f = this.frame();
    if (!f || !this.fromZero()) return '';
    const base = n(f.base);
    return (this.runs()[0]?.runs ?? [])
      .map(
        (run) => `${trace(run)} L${n(run[run.length - 1][0])} ${base} L${n(run[0][0])} ${base} Z`,
      )
      .join(' ');
  });
}
