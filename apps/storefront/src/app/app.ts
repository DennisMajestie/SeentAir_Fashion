import { Component, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CartService } from './cart.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="site-header" [class.scrolled]="scrolled()">
      <div class="wrap-col header-inner">
        <a routerLink="/" class="logo" aria-label="SEENTAIR home">
          <img src="assets/logo.jpeg" alt="SEENTAIR" width="160" height="32" />
        </a>
        <nav [class.open]="menuOpen()">
          <a routerLink="/shop" (click)="menuOpen.set(false)">Shop</a>
          <a routerLink="/account" (click)="menuOpen.set(false)">Account</a>
          <a [href]="environment.wholesaleUrl" target="_blank" rel="noopener noreferrer" (click)="menuOpen.set(false)">Wholesale</a>
          <a [href]="environment.adminUrl" target="_blank" rel="noopener noreferrer" (click)="menuOpen.set(false)">Admin</a>
          <a [href]="environment.partnerUrl" target="_blank" rel="noopener noreferrer" (click)="menuOpen.set(false)">Partners</a>
        </nav>
        <!-- Cart lives outside <nav> so it stays reachable at every width,
             next to the menu toggle rather than hidden inside the menu. -->
        <div class="header-actions">
          <a
            routerLink="/cart"
            class="cart-btn"
            [attr.aria-label]="cart.count === 1 ? 'Cart, 1 item' : 'Cart, ' + cart.count + ' items'"
            (click)="menuOpen.set(false)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M6 8h12l-1 11.2A2 2 0 0 1 15 21H9a2 2 0 0 1-2-1.8L6 8Z" />
              <path d="M9 8V6.2a3 3 0 0 1 6 0V8" />
            </svg>
            @if (cart.count > 0) {
              <span class="cart-count">{{ cart.count }}</span>
            }
          </a>
          <button
            class="menu-toggle"
            [attr.aria-expanded]="menuOpen()"
            aria-label="Toggle menu"
            (click)="toggleMenu()"
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
    </header>
    <main>
      <router-outlet />
    </main>
    <footer class="site-footer">
      <div class="wrap-col">
        <div class="footer-cols">
          <div class="footer-col footer-brand">
            <span class="logo-footer"><img src="assets/logo.jpeg" alt="SEENTAIR" width="180" height="36" /></span>
            <p>Streetwear manufactured in-house at our Yaba, Lagos factory — one atelier, no middlemen.</p>
          </div>
          <nav class="footer-col" aria-label="Shop">
            <h4>Shop</h4>
            <a routerLink="/shop">All products</a>
            <a routerLink="/shop">Drop 04 — Harmattan</a>
            <a routerLink="/shop">Studio Essentials</a>
          </nav>
          <nav class="footer-col" aria-label="Help">
            <h4>Help</h4>
            <a routerLink="/policies" fragment="shipping">Shipping &amp; dispatch</a>
            <a routerLink="/policies" fragment="returns">Returns — 12h window</a>
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
            <a [href]="environment.wholesaleUrl" target="_blank" rel="noopener noreferrer">Wholesale portal</a>
            <a [href]="environment.adminUrl" target="_blank" rel="noopener noreferrer">Admin dashboard</a>
            <a [href]="environment.partnerUrl" target="_blank" rel="noopener noreferrer">Partner portal</a>
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
export class App implements OnDestroy {
  private readonly onScroll = () => {
    this.scrolled.set((window.scrollY ?? 0) > 10);
  };
  readonly environment = environment;
  readonly cart = inject(CartService);
  readonly scrolled = signal(false);
  readonly menuOpen = signal(false);

  constructor() {
    if (typeof window !== 'undefined') {
      this.onScroll();
      window.addEventListener('scroll', this.onScroll, { passive: true });
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
  }

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }
}