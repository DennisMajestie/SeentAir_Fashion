import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Product } from './api.service';
import { SWATCHES } from './product-card.component';
import {
  EMPTY_FILTERS,
  SheetFilters,
  activeFilterCount,
  facetCount,
  matchesSheetFilters,
  priceBands,
} from './shop-filters';

type SectionId = 'size' | 'colour' | 'collection' | 'price';

/**
 * The shop's filter bottom sheet.
 *
 * Pending vs applied is the core of it: everything touched inside the sheet is
 * pending and the grid behind does not move. Only "Show N pieces" commits.
 * Dismissing by scrim, Escape or the back gesture throws the pending set away,
 * which is what makes "Clear all" safely undoable — it clears pending only.
 *
 * The count on the button is computed from the products already in client
 * state. The catalogue arrives in a single request and is filtered in memory,
 * so there is no endpoint to call, nothing to debounce and no stale-response
 * race to guard against. If the catalogue ever outgrows that single fetch this
 * is the thing to revisit — the button would then need a real count endpoint.
 */
@Component({
  selector: 'app-filter-sheet',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sheet-scrim" (click)="close()" aria-hidden="true"></div>
    <div
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-sheet-title"
      #sheet
      (keydown)="onKeydown($event)"
    >
      <span class="sheet-handle" aria-hidden="true"></span>

      <div class="sheet-head">
        <h2 id="filter-sheet-title">Filters</h2>
        <button
          class="link sheet-clear"
          type="button"
          (click)="clearAll()"
          [disabled]="!anyActive()"
        >
          Clear all
        </button>
      </div>

      <div class="sheet-body">
        @for (s of sections; track s.id) {
          <section class="sheet-section">
            <h3>
              <button
                class="sheet-section-head"
                type="button"
                [attr.aria-expanded]="isOpen(s.id)"
                [attr.aria-controls]="'filter-panel-' + s.id"
                [id]="'filter-head-' + s.id"
                (click)="toggleSection(s.id)"
              >
                <span>{{ s.label }}</span>
                <span class="sheet-section-meta">
                  @if (summaryOf(s.id); as sum) {
                    <span class="sheet-section-value">{{ sum }}</span>
                  }
                  <span class="sheet-chevron" [class.open]="isOpen(s.id)" aria-hidden="true"></span>
                </span>
              </button>
            </h3>

            <div
              class="sheet-panel"
              [id]="'filter-panel-' + s.id"
              role="region"
              [attr.aria-labelledby]="'filter-head-' + s.id"
              [hidden]="!isOpen(s.id)"
            >
              @switch (s.id) {
                @case ('size') {
                  <div class="sheet-pills">
                    @for (size of sizes(); track size) {
                      <button
                        class="size-chip sheet-pill"
                        type="button"
                        [attr.aria-pressed]="pending().size === size"
                        [class.active]="pending().size === size"
                        (click)="toggle('size', size)"
                      >
                        {{ size }}
                        <span class="sheet-count">{{ countFor('size', size) }}</span>
                      </button>
                    }
                  </div>
                }
                @case ('colour') {
                  <div class="sheet-colours">
                    @for (c of colours(); track c) {
                      <button
                        class="sheet-colour"
                        type="button"
                        [attr.aria-pressed]="pending().colour === c"
                        [class.active]="pending().colour === c"
                        (click)="toggle('colour', c)"
                      >
                        <span
                          class="sheet-swatch"
                          [style.background]="swatch(c)"
                          aria-hidden="true"
                        >
                          @if (pending().colour === c) {
                            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                              <path
                                d="M3.5 8.5 6.5 11.5 12.5 5"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                              />
                            </svg>
                          }
                        </span>
                        <span class="sheet-colour-name">{{ c }}</span>
                        <span class="sheet-count">{{ countFor('colour', c) }}</span>
                      </button>
                    }
                  </div>
                }
                @case ('collection') {
                  <div class="sheet-pills">
                    @for (coll of collections(); track coll) {
                      <button
                        class="size-chip sheet-pill"
                        type="button"
                        [attr.aria-pressed]="pending().collection === coll"
                        [class.active]="pending().collection === coll"
                        (click)="toggle('collection', coll)"
                      >
                        {{ coll }}
                        <span class="sheet-count">{{ countFor('collection', coll) }}</span>
                      </button>
                    }
                  </div>
                }
                @case ('price') {
                  <div class="sheet-pills">
                    @for (band of bands(); track band.max) {
                      <button
                        class="size-chip sheet-pill"
                        type="button"
                        [attr.aria-pressed]="pending().maxPrice === band.max"
                        [class.active]="pending().maxPrice === band.max"
                        (click)="toggle('maxPrice', band.max)"
                      >
                        {{ band.label }}
                        <span class="sheet-count">{{ countFor('maxPrice', band.max) }}</span>
                      </button>
                    }
                  </div>
                }
              }
            </div>
          </section>
        }
      </div>

      <div class="sheet-foot">
        @if (count() === 0) {
          <p class="sheet-zero">
            Nothing matches this combination.
            <button class="link" type="button" (click)="clearAll()">Clear all</button>
          </p>
        }
        <button
          class="cta block sheet-apply"
          type="button"
          [disabled]="count() === 0"
          (click)="commit()"
        >
          {{
            count() === 0
              ? 'No pieces match'
              : 'Show ' + count() + ' piece' + (count() === 1 ? '' : 's')
          }}
        </button>
      </div>
    </div>
  `,
})
export class FilterSheetComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly products = input.required<Product[]>();
  /** The set currently driving the grid. Pending starts as a copy of this. */
  readonly applied = input.required<SheetFilters>();

  readonly apply = output<SheetFilters>();
  readonly dismiss = output<void>();

  readonly sections: Array<{ id: SectionId; label: string }> = [
    { id: 'size', label: 'Size' },
    { id: 'colour', label: 'Colour' },
    { id: 'collection', label: 'Collection' },
    { id: 'price', label: 'Price' },
  ];

  /** Size and Colour open, Collection and Price collapsed, per the spec. */
  private readonly open = signal<Record<SectionId, boolean>>({
    size: true,
    colour: true,
    collection: false,
    price: false,
  });

  readonly pending = signal<SheetFilters>({ ...EMPTY_FILTERS });

  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');

  constructor() {
    // Pending mirrors applied whenever the sheet is (re)mounted — the parent
    // only creates this component on open, so this runs per opening.
    effect(() => this.pending.set({ ...this.applied() }));
    this.lockBackgroundScroll();
    afterOpen(() => this.focusFirst());
  }

  // --- facets -------------------------------------------------------------

  readonly sizes = computed(() => {
    const order = ['S', 'M', 'L', 'XL', 'XXL', 'OS'];
    const set = new Set(
      this.products()
        .flatMap((p) => p.variants.map((v) => v.size))
        .filter((s): s is string => !!s),
    );
    return [...set].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
  });

  readonly colours = computed(() =>
    [
      ...new Set(
        this.products()
          .flatMap((p) => p.variants.map((v) => v.colour))
          .filter((c): c is string => !!c),
      ),
    ].sort((a, b) => a.localeCompare(b)),
  );

  readonly collections = computed(() =>
    [
      ...new Set(
        this.products()
          .map((p) => p.collection?.name)
          .filter((n): n is string => !!n),
      ),
    ].sort((a, b) => a.localeCompare(b)),
  );

  readonly bands = computed(() => priceBands(this.products()));

  /** What the footer button commits to. Same predicate the grid uses. */
  readonly count = computed(
    () => this.products().filter((p) => matchesSheetFilters(p, this.pending())).length,
  );

  readonly anyActive = computed(() => activeFilterCount(this.pending()) > 0);

  countFor(facet: keyof SheetFilters, value: string | number): number {
    return facetCount(this.products(), this.pending(), facet, value);
  }

  swatch(colour: string): string {
    return SWATCHES[colour.toLowerCase()] ?? '#8a8378';
  }

  summaryOf(id: SectionId): string | null {
    const f = this.pending();
    if (id === 'size') return f.size;
    if (id === 'colour') return f.colour;
    if (id === 'collection') return f.collection;
    if (f.maxPrice === null) return null;
    return this.bands().find((b) => b.max === f.maxPrice)?.label ?? null;
  }

  // --- interaction --------------------------------------------------------

  isOpen(id: SectionId): boolean {
    return this.open()[id];
  }

  toggleSection(id: SectionId): void {
    this.open.set({ ...this.open(), [id]: !this.open()[id] });
  }

  /** Single-select per facet: tapping the active value clears it. */
  toggle(facet: keyof SheetFilters, value: string | number): void {
    const current = this.pending()[facet];
    this.pending.set({ ...this.pending(), [facet]: current === value ? null : value });
  }

  /** Pending only — dismissing still restores whatever the grid is showing. */
  clearAll(): void {
    this.pending.set({ ...EMPTY_FILTERS });
  }

  /** Commit: the parent swaps its applied set, writes the URL and closes us. */
  commit(): void {
    if (this.count() === 0) return;
    this.apply.emit({ ...this.pending() });
  }

  /** Discard: pending dies with the component, so the grid is untouched. */
  close(): void {
    this.dismiss.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    // Focus trap: the sheet is modal, so Tab must cycle within it.
    const focusable = this.focusable();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusable(): HTMLElement[] {
    return Array.from(
      this.sheet().nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null);
  }

  private focusFirst(): void {
    this.focusable()[0]?.focus();
  }

  /**
   * Background scroll lock. Released through DestroyRef rather than a close
   * handler so it cannot leak — the back gesture destroys the component without
   * ever calling dismiss().
   */
  private lockBackgroundScroll(): void {
    if (typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.destroyRef.onDestroy(() => {
      document.body.style.overflow = previous;
    });
  }
}

/** Runs after the view exists, so the first control can take focus. */
function afterOpen(fn: () => void): void {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else setTimeout(fn, 0);
}
