import { Component, inject } from '@angular/core';
import { DesktopHeaderComponent } from './desktop-header.component';
import { HeroCarouselComponent } from './hero-carousel.component';
import { ViewportService } from './viewport.service';
import { ChromeService } from './chrome.service';

/**
 * Everything that exists only above the desktop breakpoint: the shop header and
 * the campaign carousel.
 *
 * Both children sit behind one `@if`, so at mobile widths neither component is
 * constructed and the four banner JPEGs are never requested. Hiding this wrapper
 * with CSS instead would still let the browser download them, because
 * `display: none` does not stop an image fetch.
 *
 * The carousel is opt-in per route (`data.hero`) and only the landing page claims
 * it, so it never rides above the shop, cart, checkout, account, order or policy
 * screens. It briefly moved into `LandingPage` so it could sit between the
 * category rail and New Arrivals, but that put it mid-page; it belongs at the top
 * of the page, above the content, so it is owned here again.
 *
 * Immersive routes skip this shell entirely: a page opting out renders its own
 * compact back-link bar instead. No route opts out at the moment -- shop and the
 * product page both keep the real header.
 */
@Component({
  selector: 'app-desktop-shell',
  imports: [DesktopHeaderComponent, HeroCarouselComponent],
  template: `
    @if (viewport.isDesktop() && !chrome.immersive()) {
      <app-desktop-header />
      @if (chrome.hero()) {
        <app-hero-carousel />
      }
    }
  `,
})
export class DesktopShellComponent {
  protected readonly viewport = inject(ViewportService);
  protected readonly chrome = inject(ChromeService);
}