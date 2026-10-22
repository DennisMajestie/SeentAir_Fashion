import {
  DestroyRef,
  Directive,
  ElementRef,
  Signal,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { booleanish } from '../button/button.directive';
import { extent, labelEvery, linearScale, niceTicks } from './scale';

/** One line on a line chart. A `null` value is a gap: the line breaks there. */
export interface SeChartSeries {
  name: string;
  values: readonly (number | null)[];
}
export type SeChartHeight = 'sm' | 'md';

/** A series as the chart draws it: `slot` is its colour, 1 to 5, in the order given. */
export interface ChartRow extends SeChartSeries {
  slot: number;
}

/** The drawn height of each size, in pixels. Loading, empty and drawn states all use it. */
const HEIGHTS: Record<SeChartHeight, number> = { sm: 160, md: 240 };
/** Width of one character of axis text (the caption role, tabular figures), rounded up. */
const CHAR = 7.5;
const TOP = 12;
const BOTTOM = 28;
const AXIS_GAP = 8;

const plain = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
let nextChartId = 0;

/**
 * What the line chart and the bar chart have in common, which is nearly
 * everything: the inputs, the measured width, the axes and grid, the active
 * position with its tooltip, the keyboard, and the hidden data table. A chart
 * adds only its marks. Not exported from the package.
 */
@Directive({
  host: {
    class: 'se-chart',
    '[class.se-chart--sm]': 'height() === "sm"',
  },
})
export abstract class SeChartBase {
  /** The accessible name: what this chart shows. Also the caption of its data table. */
  readonly title = input.required<string>();
  /** The categories along the x axis, oldest first. */
  readonly labels = input.required<readonly string[]>();
  /**
   * How a value is written on the axis, in the tooltip and in the data table.
   * Pass the app's currency formatter for money: the chart never assumes a currency.
   */
  readonly formatValue = input<(value: number) => string>((n) => plain.format(n));
  readonly height = input<SeChartHeight>('md');
  /** Shows a skeleton of the same height while the data is on its way. */
  readonly loading = input(false, { transform: booleanish });

  /** The series to draw. Bars are bands along the x axis; line points sit on its ends. */
  protected abstract readonly rows: Signal<ChartRow[]>;
  protected abstract readonly banded: boolean;
  /** Whether the value axis must start from zero (bars and filled areas measure from it). */
  protected abstract readonly fromZero: Signal<boolean>;

  protected readonly hintId = `se-chart-hint-${++nextChartId}`;
  protected readonly h = computed(() => HEIGHTS[this.height()]);
  /** The active position: the label the pointer or the keyboard is on. */
  readonly active = signal<number | null>(null);
  protected readonly announcement = signal('');
  private readonly width = signal(0);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');

  private readonly range = computed(() => extent(this.rows().map((r) => r.values)));
  protected readonly empty = computed(() => !this.labels().length || !this.range());

  /** Everything the template draws, in pixels, at the element's real width. */
  protected readonly frame = computed(() => {
    const w = this.width();
    const range = this.range();
    const labels = this.labels();
    if (w < 80 || !range || !labels.length) return null;
    const h = this.h();
    const fmt = this.formatValue();

    let [min, max] = range;
    if (this.fromZero()) [min, max] = [Math.min(min, 0), Math.max(max, 0)];
    const values = niceTicks(min, max, this.height() === 'sm' ? 3 : 4);
    const texts = values.map(fmt);
    const widest = (list: readonly string[]) => Math.max(...list.map((t) => t.length)) * CHAR;

    const labelWidth = widest(labels);
    // Room for the tick labels on the left, capped so a long currency string
    // cannot swallow a phone-width plot. Line charts centre a label on each
    // end of the plot, so they keep half a label clear on both sides.
    const overhang = this.banded ? 0 : Math.min(labelWidth / 2, 28);
    const left = Math.min(Math.max(widest(texts) + AXIS_GAP + 4, overhang), w * 0.4);
    const right = w - Math.max(AXIS_GAP, overhang);
    const bottom = h - BOTTOM;
    const n = labels.length;
    const band = (right - left) / (this.banded ? n : Math.max(1, n - 1));
    const x = (i: number) =>
      this.banded ? left + (i + 0.5) * band : n === 1 ? (left + right) / 2 : left + i * band;
    const y = linearScale([values[0], values[values.length - 1]], [bottom, TOP]);

    const every = labelEvery(band, labelWidth);
    return {
      w,
      h,
      left,
      right,
      top: TOP,
      bottom,
      band,
      x,
      y,
      /** Where bars and areas grow from: zero, or the nearest edge of the axis to it. */
      base: y(Math.min(Math.max(0, values[0]), values[values.length - 1])),
      tickX: left - AXIS_GAP,
      labelY: h - 8,
      ticks: values.map((value, i) => ({ value, text: texts[i], y: y(value), zero: value === 0 })),
      xLabels: labels.map((text, i) => ({ i, text, x: x(i) })).filter((l) => l.i % every === 0),
    };
  });

  /** The tooltip for the active position, flipped to whichever side keeps it inside the chart. */
  protected readonly tip = computed(() => {
    const f = this.frame();
    const i = this.active();
    if (!f || i === null || i >= this.labels().length) return null;
    const x = f.x(i);
    const fmt = this.formatValue();
    return {
      i,
      x,
      flip: x > f.w / 2,
      label: this.labels()[i],
      bandX: x - f.band / 2,
      rows: this.rows().map((r) => {
        const v = r.values[i] ?? null;
        return {
          name: r.name,
          slot: r.slot,
          y: v === null ? null : f.y(v),
          text: this.cell(v, fmt),
        };
      }),
    };
  });

  /** The same data as a table, for a screen reader: the picture itself is hidden from it. */
  protected readonly table = computed(() => {
    const fmt = this.formatValue();
    const rows = this.rows();
    return this.labels().map((label, i) => ({
      label,
      cells: rows.map((r) => this.cell(r.values[i] ?? null, fmt)),
    }));
  });

  constructor() {
    let observer: ResizeObserver | undefined;
    afterNextRender(() => {
      const el = this.body().nativeElement;
      this.width.set(Math.floor(el.clientWidth));
      observer = new ResizeObserver(([entry]) =>
        this.width.set(Math.floor(entry.contentRect.width)),
      );
      observer.observe(el);
    });
    inject(DestroyRef).onDestroy(() => observer?.disconnect());
  }

  private cell(v: number | null, fmt: (n: number) => string): string {
    return v === null || !Number.isFinite(v) ? 'No data' : fmt(v);
  }

  protected point(event: PointerEvent): void {
    const f = this.frame();
    if (!f) return;
    const px = event.clientX - (event.currentTarget as HTMLElement).getBoundingClientRect().left;
    const at = this.banded
      ? Math.floor((px - f.left) / f.band)
      : Math.round((px - f.left) / f.band);
    this.active.set(Math.min(Math.max(at || 0, 0), this.labels().length - 1));
  }

  protected clear(): void {
    this.active.set(null);
    this.announcement.set('');
  }

  protected key(event: KeyboardEvent): void {
    const last = this.labels().length - 1;
    const now = this.active();
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = now === null ? 0 : Math.min(now + 1, last);
        break;
      case 'ArrowLeft':
        next = now === null ? last : Math.max(now - 1, 0);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      case 'Escape':
        return this.clear();
      default:
        return;
    }
    event.preventDefault();
    this.active.set(next);
    const tip = this.tip();
    if (!tip) return;
    const values = tip.rows.map((r) => (tip.rows.length > 1 ? `${r.name} ${r.text}` : r.text));
    this.announcement.set(`${tip.label}: ${values.join(', ')}`);
  }
}

/**
 * The chart template up to the marks, and from the marks on. Each chart puts
 * its own SVG marks between the two, inside `<svg>`, with `f` (the frame) and
 * the component in scope.
 */
export const CHART_OPEN = `
  @if (rows().length > 1) {
    <ul class="se-chart__legend">
      @for (r of rows(); track r.slot) {
        <li class="se-chart__key">
          <span [class]="'se-chart__swatch se-chart__series--' + r.slot"></span>{{ r.name }}
        </li>
      }
    </ul>
  }
  <div #body class="se-chart__body" [style.height.px]="h()" [attr.aria-busy]="loading() ? 'true' : null">
    @if (loading()) {
      <div class="se-chart__skeleton"></div>
      <span class="se-sr-only">Loading {{ title() }}</span>
    } @else if (empty()) {
      <p class="se-chart__empty">No data for this period</p>
    } @else if (frame(); as f) {
      <div
        class="se-chart__plot se-focusable"
        tabindex="0"
        role="application"
        [attr.aria-label]="title()"
        [attr.aria-describedby]="hintId"
        (pointermove)="point($event)"
        (pointerdown)="point($event)"
        (pointerleave)="clear()"
        (blur)="clear()"
        (keydown)="key($event)"
      >
        <svg
          [attr.width]="f.w"
          [attr.height]="f.h"
          [attr.viewBox]="'0 0 ' + f.w + ' ' + f.h"
          focusable="false"
          aria-hidden="true"
        >
          @if (banded) {
            @if (tip(); as t) {
              <rect
                class="se-chart__band"
                [attr.x]="t.bandX"
                [attr.y]="f.top"
                [attr.width]="f.band"
                [attr.height]="f.bottom - f.top"
              />
            }
          }
          @for (t of f.ticks; track t.value) {
            <line
              class="se-chart__grid"
              [class.se-chart__grid--zero]="t.zero"
              [attr.x1]="f.left"
              [attr.x2]="f.right"
              [attr.y1]="t.y"
              [attr.y2]="t.y"
            />
            <text class="se-chart__tick" text-anchor="end" dy="0.32em" [attr.x]="f.tickX" [attr.y]="t.y">
              {{ t.text }}
            </text>
          }
          @for (l of f.xLabels; track l.i) {
            <text class="se-chart__tick" text-anchor="middle" [attr.x]="l.x" [attr.y]="f.labelY">
              {{ l.text }}
            </text>
          }
`;

export const CHART_CLOSE = `
        </svg>
        @if (tip(); as t) {
          <div class="se-chart__tooltip" [class.se-chart__tooltip--flip]="t.flip" [style.left.px]="t.x">
            <span class="se-chart__tooltip-label">{{ t.label }}</span>
            @for (r of t.rows; track r.slot) {
              <span class="se-chart__tooltip-row">
                <span [class]="'se-chart__swatch se-chart__series--' + r.slot"></span>
                @if (t.rows.length > 1) {
                  <span class="se-chart__tooltip-name">{{ r.name }}</span>
                }
                <span class="se-chart__tooltip-value">{{ r.text }}</span>
              </span>
            }
          </div>
        }
      </div>
    }
  </div>
  @if (!loading() && !empty()) {
    <table class="se-sr-only">
      <caption>{{ title() }}</caption>
      <thead>
        <tr>
          <td></td>
          @for (r of rows(); track r.slot) {
            <th scope="col">{{ r.name }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of table(); track $index) {
          <tr>
            <th scope="row">{{ row.label }}</th>
            @for (c of row.cells; track $index) {
              <td>{{ c }}</td>
            }
          </tr>
        }
      </tbody>
    </table>
  }
  <span class="se-sr-only" [id]="hintId">Use the left and right arrow keys to read each value.</span>
  <span class="se-sr-only se-chart__live" aria-live="polite">{{ announcement() }}</span>
`;
