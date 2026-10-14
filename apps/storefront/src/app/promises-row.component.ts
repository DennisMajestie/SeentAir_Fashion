import { Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
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
 * own section flow. It briefly was, on the landing page, when the carousel
 * lived there too -- both are now drawn by the shell above the router outlet
 * again, so in practice the shell is the one caller. Kept as its own component
 * because it is self-contained and the inline version was 30 lines of template
 * inside an already-large root component.
 *
 * Whether it appears at all is still the route's decision: `ChromeService.promises()`
 * (opt out with `promises: false`) and `immersive` are read by the caller, not
 * here, so this component stays a plain presentational block.
 */
@Component({
  selector: 'app-promises-row',
  imports: [
    RouterLink,
    NgTemplateOutlet,
    LucideTruck,
    LucideShieldCheck,
    LucideShoppingBag,
    LucideHeadphones,
  ],
  template: `
    <!--
      The icon and label are declared once and stamped into whichever anchor is
      rendered, because the two branches differ only in how they navigate.

      Why two anchors rather than one with [href] plus a conditional [routerLink]:
      the routerLink attribute is what instantiates Angular's RouterLink
      directive, and it does so even when its value is null. RouterLink owns
      [attr.href] as a host binding and writes null onto it, which wiped the
      [href] we had just set. Wholesale Deals, Distributors and Pre-order all
      rendered with href=null -- not dead-looking links, no href attribute at
      all, so clicking did nothing. Selecting the branch structurally is the
      only way to keep the directive off the external anchors.
    -->
    <ng-template #tile let-s>
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
    </ng-template>

    <div class="m-services" aria-label="Store promises">
      @for (s of services; track s.label) {
        <div class="m-svc">
          @if (s.external) {
            <a class="m-svc__link" [href]="s.link" target="_blank" rel="noopener noreferrer">
              <ng-container [ngTemplateOutlet]="tile" [ngTemplateOutletContext]="{ $implicit: s }" />
            </a>
          } @else {
            <a class="m-svc__link" [routerLink]="s.link" [fragment]="s.fragment">
              <ng-container [ngTemplateOutlet]="tile" [ngTemplateOutletContext]="{ $implicit: s }" />
            </a>
          }
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