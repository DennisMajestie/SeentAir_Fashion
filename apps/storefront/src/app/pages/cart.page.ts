import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CartService } from '../cart.service';

@Component({
  selector: 'app-cart',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <h1>Your cart</h1>
    @if (cart.items().length === 0) {
      <p class="muted">Your cart is empty. <a routerLink="/">Back to the shop</a></p>
    } @else {
      <table class="cart-table">
        <thead>
          <tr><th>Item</th><th>Qty</th><th>Price</th><th></th></tr>
        </thead>
        <tbody>
          @for (item of cart.items(); track item.variantId) {
            <tr>
              <td>
                <strong>{{ item.productName }}</strong><br />
                <span class="muted">{{ item.size || '—' }} / {{ item.colour || '—' }}</span>
              </td>
              <td>
                <input
                  type="number"
                  min="1"
                  [ngModel]="item.quantity"
                  (ngModelChange)="cart.setQuantity(item.variantId, $event)"
                />
              </td>
              <td>₦{{ item.unitPrice * item.quantity | number: '1.0-2' }}</td>
              <td><button class="link" (click)="cart.remove(item.variantId)">Remove</button></td>
            </tr>
          }
        </tbody>
      </table>
      <p class="total">Total: <strong>₦{{ cart.total | number: '1.0-2' }}</strong></p>
      <a class="cta" routerLink="/checkout">Checkout</a>
      <p class="muted small">Full payment is required upfront — no part-payments.</p>
    }
  `,
})
export class CartPage {
  readonly cart = inject(CartService);
}
