import { ChangeDetectionStrategy, Component, Directive, input } from '@angular/core';
import { SeBadgeTone } from '../badge/badge.component';
import { booleanish } from '../button/button.directive';
import { SeDatePipe } from '../format/format';

/**
 * A key/value list for the facts about one thing, on a detail page or in a
 * drawer. A real description list.
 *
 *     <dl seKv>
 *       <div seKvItem label="Customer">Adaeze O.</div>
 *       <div seKvItem label="Total" numeric>{{ order.total | seMoney }}</div>
 *     </dl>
 */
@Directive({ selector: 'dl[seKv]', host: { class: 'se-kv' } })
export class SeKvDirective {}

@Component({
  selector: 'div[seKvItem]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'se-kv__item' },
  template: `
    <dt class="se-kv__label">{{ label() }}</dt>
    <dd class="se-kv__value" [class.se-num]="numeric()">
      <ng-content />
    </dd>
  `,
})
export class SeKvItemComponent {
  readonly label = input.required<string>();
  /** Right-align with tabular figures, for money and quantities. */
  readonly numeric = input(false, { transform: booleanish });
}

/** One thing that happened to a record. */
export interface SeActivityEntry {
  /** When it happened: an ISO string, a timestamp or a Date. */
  at: string | number | Date;
  /** What happened, as a sentence fragment: "Payment received". */
  text: string;
  /** Who did it, when a person did. */
  actor?: string;
  /** Marks the entry's dot. Leave unset for routine events. */
  tone?: SeBadgeTone;
}

/**
 * The activity history of a record: what happened, who did it, when. Newest
 * first; the caller supplies the order.
 *
 *     <se-activity [entries]="history()" emptyText="Nothing has happened to this order yet." />
 */
@Component({
  selector: 'se-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeDatePipe],
  host: { class: 'se-activity' },
  template: `
    @if (entries().length === 0) {
      <p class="se-activity__empty">{{ emptyText() }}</p>
    } @else {
      <ol class="se-activity__list">
        @for (e of entries(); track $index) {
          <li class="se-activity__entry" [class]="'se-activity__entry--' + (e.tone || 'neutral')">
            <p class="se-activity__text">{{ e.text }}</p>
            <p class="se-activity__meta">
              @if (e.actor) {
                <span>{{ e.actor }}</span>
              }
              <time>{{ e.at | seDate: 'datetime' }}</time>
            </p>
          </li>
        }
      </ol>
    }
  `,
})
export class SeActivityComponent {
  readonly entries = input.required<readonly SeActivityEntry[]>();
  readonly emptyText = input('No activity yet.');
}
