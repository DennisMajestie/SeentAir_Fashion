import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CartService } from './cart.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, DecimalPipe],
  template: `
    <div class="micro-strip">
      <span>MANUFACTURED IN-HOUSE // LAGOS, NG</span>
      <span class="acid">FULL PAYMENT · TRACKED DISPATCH · 12H RETURNS</span>
    </div>
    <header class="site-header">
      <a routerLink="/" class="logo">SEENTAIR</a>
      <nav>
        <a routerLink="/shop">Shop</a>
        <a routerLink="/account">Account</a>
        <a routerLink="/cart" class="cart-chip">CART [{{ cart.count | number: '2.0' }}]</a>
      </nav>
    </header>
    <main>
      <router-outlet />
    </main>
    <footer class="site-footer">
      <div class="footer-grid">
        <span class="logo-footer">SEENTAIR</span>
        <span>Streetwear manufactured in-house — one factory, no middlemen.</span>
        <span class="mono">© 2026 SEENTAIR LIMITED // ATELIER SPEC 01</span>
      </div>
    </footer>
  `,
})
export class App {
  readonly cart = inject(CartService);
}
