import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CartService } from './cart.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="site-header">
      <a routerLink="/" class="logo">SEENTAIR</a>
      <nav>
        <a routerLink="/shop">Shop</a>
        <a routerLink="/cart">Cart ({{ cart.count }})</a>
        <a routerLink="/account">Account</a>
      </nav>
    </header>
    <main>
      <router-outlet />
    </main>
    <footer class="site-footer">
      <p>Seentair Limited — streetwear manufactured in-house.</p>
    </footer>
  `,
})
export class App {
  readonly cart = inject(CartService);
}
