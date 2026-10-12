import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { LucideTruck, LucideShieldCheck, LucideShoppingBag, LucideHeadphones } from '@lucide/angular';
import { environment } from '../environments/environment';
import { MobileHeaderComponent } from './mobile-header.component';
import { MobileBottomNavComponent } from './mobile-bottom-nav.component';
import { DesktopShellComponent } from './desktop-shell.component';
import { ViewportService } from './viewport.service';
import { ChromeService } from './chrome.service';

type ServiceIcon = 'delivery' | 'quality' | 'returns' | 'support';

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
    LucideTruck,
    LucideShieldCheck,
    LucideShoppingBag,
    LucideHeadphones,
  ],
  template: `
    <!--
      Desktop and mobile shells are mutually exclusive, and which one renders is
      decided in TypeScript rather than CSS. Hiding the mobile shell with a
      media query alone would work visually but would leave its markup live, and
      the reverse -- a CSS-hidden desktop shell -- would still download the four
      banner images on every mobile page load.

      Immersive routes (shop, product) drop the chrome entirely and render their
      own compact back-link bar instead; see ChromeService. The decision is made
      here rather than in each page so the shell stays in charge of what frames
      the router outlet.
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
           page. -->
      @if (!chrome.immersive()) {
        <div class="m-services" aria-label="Store promises">
          @for (s of services; track s.label) {
            <div class="m-svc">
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
            </div>
          }
        </div>
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
            <a routerLink="/policies" fragment="shipping">Shipping &amp; dispatch</a>
            <a routerLink="/policies" fragment="returns">Returns: 12h window</a>
            <a routerLink="/policies" fragment="payments">Payments</a>
            <a routerLink="/policies" fragment="contact">Contact us</a>
          </nav>
          <nav class="footer-col" aria-label="Account">
            <h4>Account</h4>
            <a routerLink="/account">Sign in / register</a>
            <a routerLink="/account">Your orders</a>
            <a routerLink="/cart">Cart</a>
          </nav>
          <nav class="footer-col" aria-label="Business">
            <h4>Business</h4>
            <a [href]="environment.wholesaleUrl" target="_blank" rel="noopener noreferrer"
              >Wholesale portal</a
            >
            <a [href]="environment.adminUrl" target="_blank" rel="noopener noreferrer"
              >Admin dashboard</a
            >
            <a [href]="environment.partnerUrl" target="_blank" rel="noopener noreferrer"
              >Partner portal</a
            >
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

  /**
   * Store promises, worded as in the approved reference. The last tile reads
   * "24/7 Support" by confirmed client decision. Note that nothing in
   * configuration backs the hours yet: environment.supportWhatsapp and
   * environment.supportHours are both empty, so a real support channel still
   * has to be set up behind this label.
   *
   * Icons come from Lucide (@lucide/angular), the Angular port of the same icon
   * set lucide-react provides: Truck, ShieldCheck, ShoppingBag and Headphones.
   */
  readonly services: ReadonlyArray<{ label: string; icon: ServiceIcon }> = [
    { label: 'Fast Delivery', icon: 'delivery' },
    { label: 'Quality Products', icon: 'quality' },
    { label: 'Easy Returns', icon: 'returns' },
    { label: '24/7 Support', icon: 'support' },
  ];
}
