import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SeBreadcrumb, SeBreadcrumbsComponent } from '../breadcrumbs/breadcrumbs.component';

/**
 * The page template. Every screen in the three apps is one of these, so the
 * breadcrumb, the title, the primary action and the filters are always in the
 * same place.
 *
 *     <se-page title="Orders">
 *       <button seButton variant="primary" sePageActions>New order</button>
 *       <se-table ...>...</se-table>
 *     </se-page>
 *
 *     <se-page title="Order SE-48210" [breadcrumbs]="[{ label: 'Orders', link: '/orders' }, { label: 'SE-48210' }]">
 *       <se-status sePageStatus kind="order" [value]="order.status" />
 *       <p sePageMeta>Placed 6 Oct 2026 by Adaeze O.</p>
 *       <button seButton sePageActions>Print invoice</button>
 *       <se-tabs sePageTabs ... />
 *       ...
 *     </se-page>
 *
 * Slots, in the order they appear: `[sePageStatus]` (beside the title),
 * `[sePageActions]` (top right: one primary action at most), `[sePageMeta]`
 * (one line under the title), `[sePageTabs]`, `[sePageFilters]` (for a list
 * that is not a table), then the content.
 *
 * `width="narrow"` holds the content to a readable measure, for a form or a
 * settings page.
 */
@Component({
  selector: 'se-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeBreadcrumbsComponent],
  host: { class: 'se-page', '[class.se-page--narrow]': "width() === 'narrow'" },
  template: `
    <header class="se-page__header">
      @if (breadcrumbs().length > 0) {
        <se-breadcrumbs [items]="breadcrumbs()" />
      }
      <div class="se-page__titlebar">
        <div class="se-page__heading">
          <h1 class="se-page__title">{{ title() }}</h1>
          <ng-content select="[sePageStatus]" />
        </div>
        <div class="se-page__actions"><ng-content select="[sePageActions]" /></div>
      </div>
      @if (description()) {
        <p class="se-page__description">{{ description() }}</p>
      }
      <div class="se-page__meta"><ng-content select="[sePageMeta]" /></div>
    </header>
    <div class="se-page__tabs"><ng-content select="[sePageTabs]" /></div>
    <div class="se-page__filters"><ng-content select="[sePageFilters]" /></div>
    <div class="se-page__body"><ng-content /></div>
  `,
})
export class SePageComponent {
  readonly title = input.required<string>();
  /** The trail to this page. Leave empty on a page reached straight from the sidebar. */
  readonly breadcrumbs = input<SeBreadcrumb[]>([]);
  /** One line saying what the page is for, when the title alone does not. */
  readonly description = input('');
  readonly width = input<'full' | 'narrow'>('full');
}
