import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';

/**
 * Structural strip: the unit of layout across the whole portal.
 *
 * One idea, expressed once. Everything that used to be a rounded, shadowed,
 * floating `.panel` is a bordered strip that sits flush in the flow, and
 * everything that used to be a stacked `.ordercard` is a `.dr` row that
 * expands in place.
 *
 * Rule: flat structure, 1px hairline borders, square field corners, no
 * shadows. Depth comes from a hairline and a background step, never a shadow.
 */

/**
 * A labelled block of content. Renders as a bordered strip with an optional
 * uppercase tracked label bar — the replacement for `.panel` + `.tagbar`.
 */
@Component({
  selector: 'se-strip',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="strip" [class.flush]="flush()">
      @if (label() || badge() || trailing()) {
        <header class="strip-head">
          @if (label()) {
            <span class="strip-label">{{ label() }}</span>
          }
          @if (badge()) {
            <span class="strip-badge">{{ badge() }}</span>
          }
          @if (trailing()) {
            <span class="strip-trailing"><ng-content select="[stripTrailing]" /></span>
          }
        </header>
      }
      <div class="strip-body">
        <ng-content />
      </div>
    </section>
  `,
})
export class StripComponent {
  readonly label = input<string>('');
  readonly badge = input<string>('');
  /**
   * Reserves the right-hand slot in the header. Declared as an attribute flag
   * rather than a bound value, so `trailing` and `[trailing]="true"` both mean
   * the same thing; a bare `trailing` would otherwise bind the string `''`.
   */
  readonly trailing = input(false, { transform: booleanAttribute });
  /** Removes the header entirely and tightens the body padding. */
  readonly flush = input(false, { transform: booleanAttribute });
}

/**
 * A collapsible row, one at a time per group.
 *
 * The collapsed head shows identity on the left and the numbers that matter on
 * the right. The panel holds the detail. This is the `.prodrow` pattern lifted
 * out of the catalogue so every screen in the portal uses one behaviour.
 *
 * Accessibility: the head is a real `<button>`, so it is keyboard reachable and
 * announced as a control; `aria-expanded` and `aria-controls` are wired to the
 * panel id.
 */
@Component({
  selector: 'se-row',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="drow" [class.open]="open()">
      <button
        type="button"
        class="drow-head"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="panelId()"
        (click)="toggle()"
      >
        <span class="drow-ident">
          <ng-content select="[rowIdent]" />
        </span>
        <span class="drow-tail">
          <ng-content select="[rowTail]" />
          <span class="material-symbols-outlined chev" aria-hidden="true">expand_more</span>
        </span>
      </button>

      @if (open()) {
        <div class="drow-panel" [id]="panelId()">
          <ng-content select="[rowPanel]" />
          <span class="drow-actions"><ng-content select="[rowActions]" /></span>
        </div>
      }
    </article>
  `,
})
export class RowComponent {
  readonly id = input.required<string>();
  readonly open = input(false);
  readonly toggled = output<boolean>();

  toggle(): void {
    this.toggled.emit(!this.open());
  }

  panelId(): string {
    return `se-row-${this.id()}`;
  }
}

/**
 * Key/value facts in a flush strip. `.meta-grid` and `.stat-grid` were the same
 * idea built twice; this is the single version.
 *
 * `dense` drops to one column below 560px, which is the common case on a phone.
 */
@Component({
  selector: 'se-facts',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="facts" [class.dense]="dense()" [class.bordered]="bordered()">
      @for (fact of facts(); track fact.label) {
        <div class="fact">
          <dt>{{ fact.label }}</dt>
          <dd [class.num]="fact.numeric === true">{{ fact.value }}</dd>
        </div>
      } @empty {
        <div class="fact empty"><dd class="muted">No facts recorded yet.</dd></div>
      }
    </dl>
  `,
})
export class FactsComponent {
  readonly facts = input<ReadonlyArray<{ label: string; value: string; numeric?: boolean }>>([]);
  readonly dense = input(false, { transform: booleanAttribute });
  readonly bordered = input(false, { transform: booleanAttribute });
}

/**
 * A running total. Rows are label + value; `total` marks the one line that is
 * the answer. Replaces the bespoke `.ledger` markup that three pages each
 * reimplemented.
 */
@Component({
  selector: 'se-ledger',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="ledger">
      @for (row of rows(); track row.label) {
        <div class="lg-row" [class.disc]="row.note" [class.total]="row.total">
          <dt>
            {{ row.label }}
            @if (row.note) {
              <span class="lg-note">{{ row.note }}</span>
            }
          </dt>
          <dd class="v" [class.num]="row.numeric !== false">{{ row.value }}</dd>
        </div>
      }
    </dl>
  `,
})
export class LedgerComponent {
  readonly rows = input<
    ReadonlyArray<{
      label: string;
      value: string;
      note?: string;
      total?: boolean;
      numeric?: boolean;
    }>
  >([]);
}

/**
 * Empty state. Twelve `GAP:` comments across the app are unfilled slots; this is
 * what one of them should look like once it is filled — and what a genuinely
 * empty list should look like right now.
 */
@Component({
  selector: 'se-empty',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state" role="status">
      @if (icon()) {
        <span class="empty-state-icon material-symbols-outlined" aria-hidden="true">{{
          icon()
        }}</span>
      }
      <p class="empty-state-title">{{ title() }}</p>
      @if (sub()) {
        <p class="empty-state-sub">{{ sub() }}</p>
      }
      @if (ctaLabel()) {
        <a class="cta small empty-state-cta" [href]="ctaHref() || null">{{ ctaLabel() }}</a>
      }
    </div>
  `,
})
export class EmptyComponent {
  readonly icon = input('');
  readonly title = input.required<string>();
  readonly sub = input('');
  readonly ctaLabel = input('');
  readonly ctaHref = input('');
}

/** Row + facts + ledger + strip, the vocabulary every page now shares. */
export const PRIMITIVES = [
  StripComponent,
  RowComponent,
  FactsComponent,
  LedgerComponent,
  EmptyComponent,
];
