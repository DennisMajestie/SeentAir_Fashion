import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeIconComponent } from '../icon/icon.component';

export interface SeBreadcrumb {
  label: string;
  /** A router link. Leave it off the last item: that is the page you are on. */
  link?: string;
}

/**
 * Where this page sits in the app, from the section down to the page itself.
 *
 *     <se-breadcrumbs [items]="[{ label: 'Orders', link: '/orders' }, { label: 'SO-1042' }]" />
 *
 * The last item is always the current page: plain text, never a link.
 */
@Component({
  selector: 'se-breadcrumbs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SeIconComponent],
  template: `
    <nav class="se-breadcrumbs" aria-label="Breadcrumb">
      <ol class="se-breadcrumbs__list">
        @for (item of items(); track $index; let last = $last) {
          <li class="se-breadcrumbs__item">
            @if (item.link && !last) {
              <a class="se-breadcrumbs__link se-focusable" [routerLink]="item.link">{{
                item.label
              }}</a>
            } @else {
              <span class="se-breadcrumbs__text" [attr.aria-current]="last ? 'page' : null">{{
                item.label
              }}</span>
            }
            @if (!last) {
              <se-icon class="se-breadcrumbs__separator" name="chevron-right" />
            }
          </li>
        }
      </ol>
    </nav>
  `,
})
export class SeBreadcrumbsComponent {
  readonly items = input.required<SeBreadcrumb[]>();
}
