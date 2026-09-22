import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, signal, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CartService } from './cart.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, DecimalPipe],
  template: `
    <p class="announce-bar">
      Drop 04 — Harmattan is live · Lagos dispatch within 24h · Full payment, 12-hour returns
    </p>
    <header class="site-header" [class.scrolled]="scrolled()">
      <div class="wrap-col header-inner">
        <a routerLink="/" class="logo" aria-label="SEENTAIR home">
          <img src="assets/logo.jpeg" alt="SEENTAIR" width="160" height="32" />
        </a>
        <nav [class.open]="menuOpen()">
          <a routerLink="/shop" (click)="menuOpen.set(false)">Shop</a>
          <a routerLink="/account" (click)="menuOpen.set(false)">Account</a>
          <a routerLink="/cart" class="cart-chip" (click)="menuOpen.set(false)">
            Cart
            <span class="cart-count">{{ cart.count | number:'2.0' }}</span>
          </a>
        </nav>
        <button
          class="menu-toggle"
          [attr.aria-expanded]="menuOpen()"
          aria-label="Toggle menu"
          (click)="toggleMenu()"
        >
          <span></span><span></span><span></span>
        </button>
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