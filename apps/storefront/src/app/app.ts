import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { environment } from '../environments/environment';
import { MobileHeaderComponent } from './mobile-header.component';
import { MobileBottomNavComponent } from './mobile-bottom-nav.component';
import { DesktopShellComponent } from './desktop-shell.component';
import { PromisesRowComponent } from './promises-row.component';
import { ViewportService } from './viewport.service';
import { ChromeService } from './chrome.service';

@Component({
  selector: 'app-root',
  // A class on the host rather than a wrapper element: `body:has(.m-tabs)`
  // and the sticky-header rules key off the DOM shape, and inserting a div
  // would silently change both.
  host: { '[class.is-immersive]': 'chrome.immersive()' },
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    MobileHeaderComponent,
    MobileBottomNavComponent,
    DesktopShellComponent,
    PromisesRowComponent,
  ],
  template: `
    <!--
      Desktop and mobile shells are mutually exclusive, and which one renders is
      decided in TypeScript rather than CSS. Hiding the mobile shell with a
      media query alone would work visually but would leave its markup live, and
      the reverse -- a CSS-hidden desktop shell -- would still download the four
      banner images on every mobile page load.

      Routes that opt out via the immersive flag in their route data drop the chrome
      entirely and render their own compact back-link bar instead; see
      ChromeService. No route does at the moment -- shop and the product page
      both keep the real header -- but the opt-out is kept for a future
      full-bleed surface. The decision is made here rather than in each page so
      the shell stays in charge of what frames the router outlet.
    -->
    @if (!chrome.immersive()) {
      @if (!viewport.isDesktop()) {
        <app-mobile-header />
      }
      <app-desktop-shell />
    }
<main>
      <!-- Store promises. Lives in <main> so the row scrolls with the page
           instead of riding over the sticky dark header. Suppressed on immersive
           routes, where it pushed the products the shopper came for down the
           page, and on any route whose data sets promises to false -- the
           product page keeps the header but drops the promo tiles.

           The landing page renders this through this same component rather than
           inline; it sits directly under the carousel, which the desktop shell
           draws above the outlet. It briefly moved into LandingPage itself, back
           when the carousel was also moved there, but both belong above the page
           content rather than inside its section flow. -->
      @if (!chrome.immersive() && chrome.promises()) {
        <app-promises-row />
      }
      <router-outlet />
    </main>
    @if (!chrome.immersive() && !viewport.isDesktop()) {
      <app-mobile-tabs />
    }
    <footer class="site-footer">
      <div class="wrap-col">
        <div class="footer-cols">
          <div class="footer-col footer-brand">
            <span class="logo-footer"
              ><img src="assets/logo.png" alt="SEENTAIR" width="180" height="36"
            /></span>
            <p>Streetwear manufactured in-house at our Aba factory, one atelier, no middlemen.</p>
          </div>
          <nav class="footer-col" aria-label="Shop">
            <h4>Shop</h4>
            <a routerLink="/shop">All products</a>
            <a routerLink="/shop">Drop 04: Harmattan</a>
            <a routerLink="/shop">Studio Essentials</a>
          </nav>
<nav class="footer-col" aria-label="Help">
            <h4>Help</h4>
            <a routerLink="/policies" fragment="shipping">Shipping & dispatch</a>
            <a routerLink="/policies" fragment="returns">Returns: 12h window</a>
            <a routerLink="/policies" fragment="payments">Payments</a>
            <a routerLink="/policies" fragment="contact">Contact us</a>
          </nav>
        </div>
        <div class="footer-legal">
          <span class="mono">© 2026 SEENTAIR LIMITED // ATELIER SPEC 01</span>
          <span class="mono">Secure payments via Paystack · Delivery by GIGL</span>
        </div>
      </div>
    </footer>
  `,
})
export class App {
  /** Exposed for the footer links to the other apps. */
  readonly environment = environment;

  /** Which shell is live. See the note on the template's first element. */
  protected readonly viewport = inject(ViewportService);

  /**
   * Whether this route drops the site chrome for its own back-link bar. Public
   * because the host class binding reads it as well as the template.
   */
  readonly chrome = inject(ChromeService);
}
