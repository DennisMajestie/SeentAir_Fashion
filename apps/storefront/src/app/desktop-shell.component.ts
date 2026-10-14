import { Component, inject } from '@angular/core';
import { DesktopHeaderComponent } from './desktop-header.component';
import { ViewportService } from './viewport.service';
import { ChromeService } from './chrome.service';

/**
 * Everything that exists only above the desktop breakpoint: the shop header.
 *
 * The child sits behind one `@if`, so at mobile widths the component is not
 * constructed at all.
 *
 * The campaign carousel used to live here too, which pinned it above the whole
 * router outlet and made it impossible to place inside the landing page's
 * section flow. It is now rendered by `LandingPage` itself, between the
 * category rail and New Arrivals, and keeps its own desktop-only gate there so
 * the four banner JPEGs are still never requested on a phone.
 *
 * Immersive routes skip this shell entirely: a page opting out renders its own
 * compact back-link bar instead. No route opts out at the moment -- shop and the
 * product page both keep the real header.
 */
@Component({
  selector: 'app-desktop-shell',
  imports: [DesktopHeaderComponent],
  template: `
    @if (viewport.isDesktop() && !chrome.immersive()) {
      <app-desktop-header />
    }
  `,
})
export class DesktopShellComponent {
  protected readonly viewport = inject(ViewportService);
  protected readonly chrome = inject(ChromeService);
}