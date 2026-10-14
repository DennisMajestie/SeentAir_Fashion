import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideTruck, LucideShieldCheck, LucideShoppingBag, LucideHeadphones } from '@lucide/angular';
import { environment } from '../environments/environment';

type ServiceIcon = 'delivery' | 'quality' | 'returns' | 'support';

interface ServiceTile {
  label: string;
  icon: ServiceIcon;
  link: string;
  external?: boolean;
  fragment?: string;
}

/**
 * The store promises row: Wholesale Deals, Distributors, Pre-order, Contact.
 *
 * Extracted from the app shell so it can also be rendered from inside a page's
 * own section flow. On the landing page it sits directly under the campaign
 * carousel, which is inside `LandingPage`; every other route still gets it from
 * the shell, above the router outlet. Two call sites, one definition.
 *
 * Whether it appears at all is still the route's decision: `ChromeService.promises()`
 * (opt out with `promises: false`) and `immersive` are read by the caller, not
 * here, so this component stays a plain presentational block.
 */
@Component({
  selector: 'app-promises-row',
  imports: [RouterLink, LucideTruck, LucideShieldCheck, LucideShoppingBag, LucideHeadphones],
  template: `
    <div class="m-services" aria-label="Store promises">
      @for (s of services; track s.label) {
        <div class="m-svc">
          <a
            class="m-svc__link"
            [href]="s.external ? s.link : null"
            [routerLink]="s.external ? null : s.link"
            [fragment]="s.fragment"
            [attr.target]="s.external ? '_blank' : null"
            [attr.rel]="s.external ? 'noopener noreferrer' : null"
          >
            <span class="m-svc__ic" aria-hidden="true">
              @switch (s.icon) {
                @case ('delivery') {
                  <svg lucideTruck />
                }
                @case ('quality') {
                  <svg lucideShieldCheck />
                }
                @case ('returns') {
                  <svg lucideShoppingBag />
                }
                @case ('support') {
                  <svg lucideHeadphones />
                }
              }
            </span>
            <span class="m-svc__label">{{ s.label }}</span>
          </a>
        </div>
      }
    </div>
  `,
})
export class PromisesRowComponent {
  /**
   * Store promises, updated per client direction:
   * 1. Wholesale Deals → links to distributors portal
   * 2. Distributors → application form (for now)
   * 3. Special Request / Pre-order → covers missing sizes + missing logistics/waybill fee
   * 4. Contact → Live Chat, WhatsApp, Email (existing /policies#contact)
   *
   * Icons come from Lucide (@lucide/angular): Truck, ShieldCheck, ShoppingBag, Headphones.
   */
  readonly services: ReadonlyArray<ServiceTile> = [
    { label: 'Wholesale Deals', icon: 'delivery', link: environment.distributorsUrl, external: true },
    { label: 'Distributors', icon: 'quality', link: environment.distributorsUrl, external: true },
    { label: 'Pre-order', icon: 'returns', link: environment.distributorsUrl + '/custom', external: true },
    { label: 'Contact', icon: 'support', link: '/policies', fragment: 'contact' },
  ];
}