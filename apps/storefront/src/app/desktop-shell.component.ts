import { Component, inject } from '@angular/core';
import { DesktopHeaderComponent } from './desktop-header.component';
import { HeroCarouselComponent } from './hero-carousel.component';
import { ViewportService } from './viewport.service';

/**
 * Everything that exists only above the desktop breakpoint: the shop header and
 * the campaign carousel.
 *
 * Both children sit behind one `@if`, so at mobile widths neither component is
 * constructed and the four banner JPEGs are never requested. Hiding this wrapper
 * with CSS instead would still let the browser download them, because
 * `display: none` does not stop an image fetch.
 */
@Component({
  selector: 'app-desktop-shell',
  imports: [DesktopHeaderComponent, HeroCarouselComponent],
  template: `
    @if (viewport.isDesktop()) {
      <app-desktop-header />
      <app-hero-carousel />
    }
  `,
})
export class DesktopShellComponent {
  protected readonly viewport = inject(ViewportService);
}