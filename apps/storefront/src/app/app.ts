import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { environment } from '../environments/environment';
import { MobileHeaderComponent } from './mobile-header.component';
import { MobileBottomNavComponent } from './mobile-bottom-nav.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, MobileHeaderComponent, MobileBottomNavComponent],
  template: `
    <app-mobile-header />
    <main>
      <router-outlet />
    </main>
    <app-mobile-tabs />
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
}
