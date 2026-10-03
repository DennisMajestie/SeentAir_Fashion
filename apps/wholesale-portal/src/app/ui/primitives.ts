import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

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

/**
 * Payment state, at the top of every screen that owes the buyer a number.
 *
 * Payment used to be a fact you scrolled down to: on an invoice it sat in the
 * settlement ledger, below the manifest. That is the wrong place for it. A
 * buyer opening an invoice needs to know within the first screen whether the
 * order is settled or whether it is waiting on them, so this is the first
 * element on invoice detail, orders and home alike.
 *
 * The two states mean opposite things and deliberately do not share a colour:
 * settled is the client's lime tint (--pay-tint), outstanding is the --warn
 * family already used for awaiting-payment elsewhere. Painting an unpaid
 * invoice green would be the single most misleading thing on the page.
 *
 * `role="status"` so the state is announced when the page loads, rather than
 * being something a screen reader user has to go hunting for.
 */
@Component({
  selector: 'se-pay',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="paybar" [class.settled]="paid()" role="status">
      <span class="material-symbols-outlined paybar-icon" aria-hidden="true">{{
        paid() ? 'verified' : 'error'
      }}</span>
      <div class="paybar-body">
        <p class="paybar-title">{{ paid() ? title() : 'Action required' }}</p>
        <p class="paybar-sub">{{ sub() }}</p>
      </div>
      @if (action()) {
        @if (payable()) {
          <button
            type="button"
            class="cta small paybar-cta"
            [disabled]="busy()"
            (click)="pay.emit()"
          >
            {{ busy() ? 'Opening Paystack…' : action() }}
          </button>
        } @else if (internal()) {
          <a class="cta small paybar-cta" [routerLink]="actionHref()">{{ action() }}</a>
        } @else {
          <a class="cta small paybar-cta" [href]="actionHref()">{{ action() }}</a>
        }
      }
      @if (secondary() && secondaryHref()) {
        <a class="paybar-alt" [href]="secondaryHref()">{{ secondary() }}</a>
      }
    </div>
  `,
})
export class PayBannerComponent {
  /** True when payment is settled. False renders the action-required state. */
  readonly paid = input(false);
  readonly title = input('Paid in full');
  readonly sub = input('');
  readonly action = input('');
  readonly actionHref = input('');
  /**
   * Renders the action as a real `<button>` that starts a payment, rather than
   * a link. Needed because the Paystack handoff is an API call followed by a
   * redirect: an anchor would have to carry a transaction created at page load,
   * which leaves an abandoned transaction behind on every invoice view.
   */
  readonly payable = input(false);
  readonly busy = input(false);
  readonly pay = output<void>();
  /**
   * A quieter way out, kept beside the primary action. Card is not the only
   * way an Aba factory takes money: a buyer paying by transfer needs the desk
   * number as much as the one paying by card needs the button.
   */
  readonly secondary = input('');
  readonly secondaryHref = input('');

  /**
   * The action is sometimes an in-app destination and sometimes `tel:`. A plain
   * `href="/orders"` would throw away the router and hard-reload the portal, so
   * in-app paths get a real `routerLink` and only true externals get `href`.
   * `//` is excluded: that is protocol-relative, not an internal path.
   */
  internal(): boolean {
    const href = this.actionHref();
    return href.startsWith('/') && !href.startsWith('//');
  }
}

/** Row + facts + ledger + strip, the vocabulary every page now shares. */
export const PRIMITIVES = [
  StripComponent,
  RowComponent,
  FactsComponent,
  LedgerComponent,
  EmptyComponent,
  PayBannerComponent,
];
