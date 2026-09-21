import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, signal, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CartService } from './cart.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, DecimalPipe],
  template: `
    <header class="site-header" [class.scrolled]="scrolled()">
      <div class="wrap-col header-inner">
        <a routerLink="/" class="logo" aria-label="SEENTAIR home">
          <img src="assets/logo.png" alt="SEENTAIR" width="160" height="32" />
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
        <div class="footer-grid">
          <span class="logo-footer"><img src="assets/logo.png" alt="SEENTAIR" width="180" height="36" /></span>
          <span>Streetwear manufactured in-house — one factory, no middlemen.</span>
          <span class="mono">© 2026 SEENTAIR LIMITED // ATELIER SPEC 01</span>
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