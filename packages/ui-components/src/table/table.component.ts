import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChildren,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { booleanish, SeButtonDirective } from '../button/button.directive';
import { SeBannerComponent } from '../feedback/banner.component';
import { SeEmptyStateComponent } from '../feedback/empty-state.component';
import { SeIconComponent, SeIconName } from '../icon/icon.component';

/** One column of a table. */
export interface SeColumn<T> {
  /** Unique within the table. Also the property read from the row by default. */
  key: string;
  header: string;
  /** How to get this column's value from a row. Defaults to `row[key]`. */
  value?: (row: T) => unknown;
  /** How to print the value. Defaults to the value as text, or a dash when empty. */
  format?: (value: unknown, row: T) => string;
  /** Money, quantities, counts: right-aligned with tabular figures. */
  numeric?: boolean;
  sortable?: boolean;
  /** Custom ordering for this column. Defaults to comparing the values. */
  compare?: (a: T, b: T) => number;
  /** A CSS width, when the column should not size to its content. */
  width?: string;
}

/** An action offered on every row. */
export interface SeRowAction<T> {
  label: string;
  icon?: SeIconName;
  run: (row: T) => void;
  /** Destroys or rejects something: shown in the danger colour. */
  danger?: boolean;
  disabled?: (row: T) => boolean;
  hidden?: (row: T) => boolean;
}

export interface SeSort {
  key: string;
  direction: 'asc' | 'desc';
}
export type SeDensity = 'comfortable' | 'compact';
export type SeRowId = string | number;

/**
 * A custom cell. Put it inside the table; the column with the matching key
 * renders it instead of plain text.
 *
 *     <ng-template seCell="status" let-row>
 *       <se-status kind="order" [value]="row.status" />
 *     </ng-template>
 */
@Directive({ selector: 'ng-template[seCell]' })
export class SeCellDirective {
  readonly seCell = input.required<string>();
  readonly template = inject<TemplateRef<{ $implicit: unknown; value: unknown }>>(TemplateRef);
}

/**
 * The data table. Every list screen in the three apps uses this one.
 *
 *     <se-table
 *       caption="Orders"
 *       [columns]="columns"
 *       [rows]="orders()"
 *       [loading]="loading()"
 *       [error]="error()"
 *       (retry)="load()"
 *       selectable
 *       [(selection)]="selected"
 *       [pageSize]="25"
 *       [actions]="rowActions"
 *       emptyHeading="No orders yet"
 *       emptyText="Orders appear here as soon as a customer checks out."
 *     >
 *       <ng-template seCell="status" let-row><se-status kind="order" [value]="row.status" /></ng-template>
 *     </se-table>
 *
 * It sorts and pages the rows it is given. With `serverSide`, it does neither:
 * it reports the sort and page it wants through `[(sort)]` and `[(page)]`, and
 * the caller supplies that page of rows and the `total`.
 */
@Component({
  selector: 'se-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    SeButtonDirective,
    SeBannerComponent,
    SeEmptyStateComponent,
    SeIconComponent,
  ],
  host: { class: 'se-table', '[class.se-table--compact]': "density() === 'compact'" },
  template: `
    <div class="se-table__toolbar">
      <div class="se-table__toolbar-main">
        @if (selectable() && selection().length > 0) {
          <span class="se-table__selected" aria-live="polite">
            {{ selection().length }} selected
          </span>
          <ng-content select="[seTableBulk]" />
          <button seButton variant="ghost" size="sm" type="button" (click)="selection.set([])">
            Clear selection
          </button>
        } @else {
          <ng-content select="[seTableToolbar]" />
        }
      </div>
      @if (!hideDensity()) {
        <button
          seButton
          variant="ghost"
          size="sm"
          iconOnly
          type="button"
          [attr.aria-pressed]="density() === 'compact'"
          aria-label="Compact rows"
          title="Compact rows"
          (click)="density.set(density() === 'compact' ? 'comfortable' : 'compact')"
        >
          <se-icon name="rows" />
        </button>
      }
    </div>

    <div class="se-table__scroll" [style.max-height]="maxHeight() || null">
      <table class="se-table__table" [attr.aria-busy]="loading() ? 'true' : null">
        <caption class="se-sr-only">
          {{
            caption()
          }}
        </caption>
        <thead>
          <tr>
            @if (selectable()) {
              <th class="se-table__check" scope="col">
                <label class="se-choice">
                  <input
                    type="checkbox"
                    [checked]="allSelected()"
                    [indeterminate]="someSelected()"
                    [disabled]="visible().length === 0"
                    (change)="toggleAll()"
                  />
                  <span class="se-sr-only">Select all rows on this page</span>
                </label>
              </th>
            }
            @for (col of columns(); track col.key) {
              <th
                scope="col"
                [class.se-num]="col.numeric"
                [style.width]="col.width || null"
                [attr.aria-sort]="ariaSort(col)"
              >
                @if (col.sortable) {
                  <button
                    class="se-table__sort se-focusable"
                    type="button"
                    (click)="toggleSort(col)"
                  >
                    <span>{{ col.header }}</span>
                    <se-icon [name]="sortIcon(col)" />
                  </button>
                } @else {
                  {{ col.header }}
                }
              </th>
            }
            @if (actions().length > 0) {
              <th class="se-table__actions" scope="col">
                <span class="se-sr-only">Actions</span>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @if (loading()) {
            @for (r of skeletonRows(); track r) {
              <tr class="se-table__skeleton" aria-hidden="true">
                @for (c of spanList(); track c) {
                  <td><span class="se-skeleton__bar"></span></td>
                }
              </tr>
            }
          } @else if (error()) {
            <tr>
              <td class="se-table__state" [attr.colspan]="span()">
                <se-banner
                  tone="danger"
                  [title]="caption() + ' could not be loaded'"
                  actionLabel="Try again"
                  (action)="retry.emit()"
                >
                  {{ error() }}
                </se-banner>
              </td>
            </tr>
          } @else if (visible().length === 0) {
            <tr>
              <td class="se-table__state" [attr.colspan]="span()">
                <se-empty-state
                  [heading]="emptyHeading()"
                  [text]="emptyText()"
                  [actionLabel]="emptyActionLabel()"
                  (action)="emptyAction.emit()"
                />
              </td>
            </tr>
          } @else {
            @for (row of visible(); track idOf(row)) {
              <tr
                [class.se-table__row--selected]="isSelected(row)"
                [class.se-table__row--link]="activatable()"
                (click)="rowClicked($event, row)"
              >
                @if (selectable()) {
                  <td class="se-table__check">
                    <label class="se-choice">
                      <input
                        type="checkbox"
                        [checked]="isSelected(row)"
                        (change)="toggleRow(row)"
                      />
                      <span class="se-sr-only">Select {{ text(columns()[0], row) }}</span>
                    </label>
                  </td>
                }
                @for (col of columns(); track col.key; let first = $first) {
                  <td [class.se-num]="col.numeric">
                    @if (first && activatable()) {
                      <button
                        class="se-table__rowlink se-focusable"
                        type="button"
                        (click)="rowActivate.emit(row)"
                      >
                        <ng-container
                          [ngTemplateOutlet]="cellFor(col) || plain"
                          [ngTemplateOutletContext]="{
                            $implicit: row,
                            value: valueOf(col, row),
                            col: col,
                          }"
                        />
                      </button>
                    } @else {
                      <ng-container
                        [ngTemplateOutlet]="cellFor(col) || plain"
                        [ngTemplateOutletContext]="{
                          $implicit: row,
                          value: valueOf(col, row),
                          col: col,
                        }"
                      />
                    }
                  </td>
                }
                @if (actions().length > 0) {
                  <td class="se-table__actions">
                    @for (a of actions(); track a.label) {
                      @if (!a.hidden || !a.hidden(row)) {
                        <button
                          seButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          [iconOnly]="!!a.icon"
                          [class.se-table__action--danger]="a.danger"
                          [attr.aria-label]="a.label + ': ' + text(columns()[0], row)"
                          [attr.title]="a.icon ? a.label : null"
                          [disabled]="a.disabled ? a.disabled(row) : false"
                          (click)="a.run(row)"
                        >
                          @if (a.icon; as icon) {
                            <se-icon [name]="icon" />
                          } @else {
                            {{ a.label }}
                          }
                        </button>
                      }
                    }
                  </td>
                }
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    @if (pageSize() > 0 && !loading() && !error() && count() > 0) {
      <div class="se-table__footer">
        <span class="se-table__range">{{ rangeText() }}</span>
        <div class="se-table__pager">
          <button
            seButton
            size="sm"
            iconOnly
            type="button"
            aria-label="Previous page"
            [disabled]="currentPage() <= 1"
            (click)="page.set(currentPage() - 1)"
          >
            <se-icon name="chevron-left" />
          </button>
          <span class="se-table__page">Page {{ currentPage() }} of {{ pageCount() }}</span>
          <button
            seButton
            size="sm"
            iconOnly
            type="button"
            aria-label="Next page"
            [disabled]="currentPage() >= pageCount()"
            (click)="page.set(currentPage() + 1)"
          >
            <se-icon name="chevron-right" />
          </button>
        </div>
      </div>
    }

    <ng-template #plain let-row let-col="col">{{ text(col, row) }}</ng-template>
  `,
})
export class SeTableComponent<T> {
  /** The table's accessible name, e.g. "Orders". Also used in the error message. */
  readonly caption = input.required<string>();
  readonly columns = input.required<SeColumn<T>[]>();
  readonly rows = input.required<readonly T[]>();
  /** Stable identity of a row. Defaults to its `id` property. */
  readonly rowId = input<(row: T) => SeRowId>((row) => (row as { id: SeRowId }).id);

  readonly loading = input(false, { transform: booleanish });
  /** What went wrong, in words. Shows the error state with a "Try again" action. */
  readonly error = input<string | null | undefined>('');
  readonly retry = output<void>();

  readonly emptyHeading = input('Nothing here yet');
  readonly emptyText = input('');
  readonly emptyActionLabel = input('');
  readonly emptyAction = output<void>();

  readonly selectable = input(false, { transform: booleanish });
  /** Ids of the selected rows. */
  readonly selection = model<readonly SeRowId[]>([]);

  readonly sort = model<SeSort | null>(null);
  /** Rows per page; 0 turns paging off. */
  readonly pageSize = input(0);
  readonly page = model(1);
  /** The caller sorts and pages; `rows` is already the page to show. */
  readonly serverSide = input(false, { transform: booleanish });
  /** Total rows across all pages. Only needed with `serverSide`. */
  readonly total = input<number | null>(null);

  readonly density = model<SeDensity>('comfortable');
  readonly hideDensity = input(false, { transform: booleanish });
  /** A CSS height. With it the body scrolls and the header row stays in view. */
  readonly maxHeight = input('');

  readonly actions = input<SeRowAction<T>[]>([]);
  /** Makes the first cell of each row a button that emits `rowActivate`. */
  readonly activatable = input(false, { transform: booleanish });
  readonly rowActivate = output<T>();

  private readonly cells = contentChildren(SeCellDirective);

  // ---- derived rows ----
  private readonly sorted = computed(() => {
    const rows = this.rows();
    const sort = this.sort();
    if (this.serverSide() || !sort) return rows;
    const col = this.columns().find((c) => c.key === sort.key);
    if (!col) return rows;
    const compare =
      col.compare ?? ((a: T, b: T) => compareValues(this.valueOf(col, a), this.valueOf(col, b)));
    const sign = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => sign * compare(a, b));
  });
  readonly count = computed(() =>
    this.serverSide() ? (this.total() ?? this.rows().length) : this.rows().length,
  );
  readonly pageCount = computed(() =>
    this.pageSize() > 0 ? Math.max(1, Math.ceil(this.count() / this.pageSize())) : 1,
  );
  /** The requested page, held inside the pages that exist. */
  readonly currentPage = computed(() => Math.min(Math.max(1, this.page()), this.pageCount()));
  readonly visible = computed(() => {
    const rows = this.sorted();
    const size = this.pageSize();
    if (this.serverSide() || size <= 0) return rows;
    const start = (this.currentPage() - 1) * size;
    return rows.slice(start, start + size);
  });
  readonly rangeText = computed(() => {
    const size = this.pageSize();
    const first = (this.currentPage() - 1) * size + 1;
    const last = Math.min(this.count(), first + this.visible().length - 1);
    return `${first}–${last} of ${this.count()}`;
  });

  readonly span = computed(
    () => this.columns().length + (this.selectable() ? 1 : 0) + (this.actions().length ? 1 : 0),
  );
  readonly spanList = computed(() => Array.from({ length: this.span() }, (_, i) => i));
  readonly skeletonRows = computed(() =>
    Array.from({ length: Math.min(this.pageSize() || 5, 10) }, (_, i) => i),
  );

  // ---- cells ----
  valueOf(col: SeColumn<T>, row: T): unknown {
    return col.value ? col.value(row) : (row as Record<string, unknown>)[col.key];
  }
  text(col: SeColumn<T>, row: T): string {
    const value = this.valueOf(col, row);
    if (col.format) return col.format(value, row);
    return value === null || value === undefined || value === '' ? '–' : String(value);
  }
  cellFor(col: SeColumn<T>): TemplateRef<unknown> | null {
    return this.cells().find((c) => c.seCell() === col.key)?.template ?? null;
  }
  idOf(row: T): SeRowId {
    return this.rowId()(row);
  }

  // ---- sorting ----
  /** Ascending, then descending, then back to the order the rows came in. */
  toggleSort(col: SeColumn<T>): void {
    const sort = this.sort();
    if (!sort || sort.key !== col.key) this.sort.set({ key: col.key, direction: 'asc' });
    else if (sort.direction === 'asc') this.sort.set({ key: col.key, direction: 'desc' });
    else this.sort.set(null);
    this.page.set(1);
  }
  ariaSort(col: SeColumn<T>): 'ascending' | 'descending' | 'none' | null {
    if (!col.sortable) return null;
    const sort = this.sort();
    if (!sort || sort.key !== col.key) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }
  sortIcon(col: SeColumn<T>): SeIconName {
    const state = this.ariaSort(col);
    return state === 'ascending' ? 'arrow-up' : state === 'descending' ? 'arrow-down' : 'sort';
  }

  // ---- selection ----
  isSelected(row: T): boolean {
    return this.selection().includes(this.idOf(row));
  }
  readonly allSelected = computed(
    () => this.visible().length > 0 && this.visible().every((r) => this.isSelected(r)),
  );
  readonly someSelected = computed(
    () => !this.allSelected() && this.visible().some((r) => this.isSelected(r)),
  );
  toggleRow(row: T): void {
    const id = this.idOf(row);
    const current = this.selection();
    this.selection.set(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }
  /** Selects, or clears, the rows on this page; other pages keep their selection. */
  toggleAll(): void {
    const pageIds = this.visible().map((r) => this.idOf(r));
    const others = this.selection().filter((id) => !pageIds.includes(id));
    this.selection.set(this.allSelected() ? others : [...others, ...pageIds]);
  }

  /**
   * A pointer convenience on top of the row's real button: clicking anywhere
   * on an activatable row opens it, unless the click was on a control.
   */
  rowClicked(event: MouseEvent, row: T): void {
    if (!this.activatable()) return;
    if ((event.target as HTMLElement).closest('button, a, input, select, label')) return;
    this.rowActivate.emit(row);
  }
}

/** Numbers by size, dates by time, everything else as text; empty values last. */
export function compareValues(a: unknown, b: unknown): number {
  const emptyA = a === null || a === undefined || a === '';
  const emptyB = b === null || b === undefined || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}
