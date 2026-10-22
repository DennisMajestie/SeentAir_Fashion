import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { SeButtonDirective } from '../button/button.directive';
import { SeSearchComponent } from '../field/search.component';
import { SeIconComponent } from '../icon/icon.component';

/** One filter: a named choice from a fixed list. */
export interface SeFilter {
  key: string;
  /** Singular noun: "Status", "Payment", "Category". */
  label: string;
  options: { value: string; label: string }[];
  /** Wording of the "no filter" choice. Defaults to "Any status" etc. */
  anyLabel?: string;
}

/** The chosen value per filter key. A key that is absent or empty is not filtering. */
export type SeFilterValue = Record<string, string>;

/**
 * The filter bar for every list: search first, then the filters, then what is
 * currently applied as removable chips with one "Clear all".
 *
 *     <se-filter-bar
 *       seTableToolbar
 *       searchLabel="Search orders"
 *       [(query)]="query"
 *       [filters]="filters"
 *       [(value)]="filterValue"
 *       summary="37 orders"
 *     />
 *
 * Put it in the table's toolbar (`seTableToolbar`), or in the page's
 * `[sePageFilters]` slot for a list that is not a table. It only holds the
 * choices; the screen applies them to its data and should mirror them in the
 * URL so a filtered list can be bookmarked and shared.
 */
@Component({
  selector: 'se-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeButtonDirective, SeIconComponent, SeSearchComponent],
  host: { class: 'se-filter-bar' },
  template: `
    <div class="se-filter-bar__controls" role="group" aria-label="Filters">
      @if (searchLabel()) {
        <se-search
          [label]="searchLabel()"
          [placeholder]="searchPlaceholder() || searchLabel()"
          [(value)]="query"
        />
      }
      @for (f of filters(); track f.key) {
        <select
          class="se-input se-filter-bar__select"
          [attr.aria-label]="'Filter by ' + f.label.toLowerCase()"
          [value]="value()[f.key] || ''"
          (change)="set(f.key, $any($event.target).value)"
        >
          <option value="">{{ f.anyLabel || 'Any ' + f.label.toLowerCase() }}</option>
          @for (o of f.options; track o.value) {
            <option [value]="o.value" [selected]="value()[f.key] === o.value">{{ o.label }}</option>
          }
        </select>
      }
      @if (summary()) {
        <span class="se-filter-bar__summary" aria-live="polite">{{ summary() }}</span>
      }
    </div>
    @if (chips().length > 0) {
      <div class="se-filter-bar__chips">
        @for (chip of chips(); track chip.key) {
          <button
            class="se-filter-bar__chip se-focusable"
            type="button"
            [attr.aria-label]="'Remove filter ' + chip.text"
            (click)="remove(chip.key)"
          >
            <span>{{ chip.text }}</span>
            <se-icon name="close" />
          </button>
        }
        <button seButton variant="ghost" size="sm" type="button" (click)="clear()">
          Clear all
        </button>
      </div>
    }
  `,
})
export class SeFilterBarComponent {
  /** Accessible name of the search box. Leave empty for a bar with no search. */
  readonly searchLabel = input('');
  readonly searchPlaceholder = input('');
  readonly query = model('');
  readonly filters = input<SeFilter[]>([]);
  readonly value = model<SeFilterValue>({});
  /** How many results the current filters give, in words: "37 orders". */
  readonly summary = input('');

  /** What is applied right now, one chip each, search included. */
  readonly chips = computed(() => {
    const chips: { key: string; text: string }[] = [];
    const query = this.query().trim();
    if (query) chips.push({ key: '__query', text: `Search: ${query}` });
    for (const f of this.filters()) {
      const chosen = this.value()[f.key];
      if (!chosen) continue;
      const option = f.options.find((o) => o.value === chosen);
      chips.push({ key: f.key, text: `${f.label}: ${option?.label ?? chosen}` });
    }
    return chips;
  });

  set(key: string, chosen: string): void {
    const next = { ...this.value() };
    if (chosen) next[key] = chosen;
    else delete next[key];
    this.value.set(next);
  }

  remove(key: string): void {
    if (key === '__query') this.query.set('');
    else this.set(key, '');
  }

  /** Clears every filter and the search in one go. */
  clear(): void {
    this.query.set('');
    this.value.set({});
  }
}
