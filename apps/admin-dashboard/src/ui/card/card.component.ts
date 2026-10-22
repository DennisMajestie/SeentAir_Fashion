import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { booleanish } from '../button/button.directive';
import { SeSparklineComponent } from '../chart/sparkline.component';
import { SeIconComponent } from '../icon/icon.component';

/**
 * A content card: an optional titled header with actions, a body, an optional
 * footer.
 *
 *     <se-card title="Production status">
 *       <button seButton size="sm" seCardActions>View all</button>
 *       ...body...
 *       <ng-container seCardFooter><button seButton variant="primary">Save</button></ng-container>
 *     </se-card>
 *
 * `flush` removes the body padding, for a table or a list that runs edge to edge.
 */
@Component({
  selector: 'se-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'se-card', '[class.se-card--flush]': 'flush()' },
  template: `
    @if (title()) {
      <div class="se-card__header">
        <h3 class="se-card__title">{{ title() }}</h3>
        <div class="se-card__actions"><ng-content select="[seCardActions]" /></div>
      </div>
    }
    <div class="se-card__body"><ng-content /></div>
    <div class="se-card__footer"><ng-content select="[seCardFooter]" /></div>
  `,
})
export class SeCardComponent {
  readonly title = input('');
  readonly flush = input(false, { transform: booleanish });
}

/**
 * A metric card: one number the reader came for, what it is, how it moved, and
 * optionally the shape of its trend.
 *
 *     <se-metric-card
 *       label="Sales today"
 *       [value]="salesToday | seMoney"
 *       [change]="12.4"
 *       changeLabel="vs yesterday"
 *       [trend]="lastFourteenDays"
 *       trendLabel="Sales over the last 14 days"
 *     />
 *
 * `change` is a percentage. Up is good by default; for a number where down is
 * good (returns, costs, low-stock items) set `goodDirection="down"` so a fall
 * is shown as good rather than bad.
 */
@Component({
  selector: 'se-metric-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeIconComponent, SeSparklineComponent],
  host: { class: 'se-metric' },
  template: `
    <p class="se-metric__label">{{ label() }}</p>
    <p class="se-metric__value">{{ value() }}</p>
    @if (change() !== null || hint()) {
      <p class="se-metric__change">
        @if (change(); as c) {
          <span class="se-metric__delta" [class]="'se-metric__delta--' + deltaTone()">
            <se-icon [name]="c > 0 ? 'arrow-up' : 'arrow-down'" />
            <span class="se-sr-only">{{ c > 0 ? 'Up' : 'Down' }}</span>
            {{ deltaText() }}
          </span>
        } @else if (change() === 0) {
          <span class="se-metric__delta">No change</span>
        }
        <span>{{ changeLabel() || hint() }}</span>
      </p>
    }
    @if (trend(); as t) {
      @if (t.length > 1) {
        <se-sparkline [values]="t" [label]="trendLabel() || label() + ' trend'" />
      }
    }
  `,
})
export class SeMetricCardComponent {
  readonly label = input.required<string>();
  /** The value, already formatted (money through the seMoney pipe). */
  readonly value = input.required<string | number>();
  /** Percentage change against the comparison period; null hides it. */
  readonly change = input<number | null>(null);
  /** What the change is measured against, e.g. "vs yesterday". */
  readonly changeLabel = input('');
  /** A plain note shown when there is no change figure. */
  readonly hint = input('');
  readonly goodDirection = input<'up' | 'down'>('up');
  readonly trend = input<readonly number[] | null>(null);
  readonly trendLabel = input('');

  readonly deltaText = computed(() => `${Math.abs(this.change() ?? 0).toFixed(1)}%`);
  readonly deltaTone = computed(() => {
    const up = (this.change() ?? 0) > 0;
    return up === (this.goodDirection() === 'up') ? 'good' : 'bad';
  });
}
