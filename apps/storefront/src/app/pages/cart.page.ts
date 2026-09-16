import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CartService } from '../cart.service';

/** Cart — Stitch "manifest" rows + summary, feeding into checkout. */
@Component({
  selector: 'app-cart',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <p class="page-kicker">Checkout stage 01 // Review</p>
    <h1 class="page-title">Your cart</h1>
    @if (cart.items().length === 0) {
      <p class="muted">Your cart is empty. <a routerLink="/shop">Back to the shop</a></p>
    } @else {
      <p class="section-label">Items <span class="count">[{{ cart.count | number: '2.0' }}]</span></p>
      @for (item of cart.items(); track item.variantId) {
        <div class="manifest-row">
          <div class="m-body">
            <p class="sku-line">{{ item.sku }}</p>
            <p class="m-name">{{ item.productName }}</p>
            <p class="muted small">{{ item.size || '—' }} / {{ item.colour || '—' }}</p>
          </div>
          <span class="qty-stepper">
            <button type="button" (click)="cart.setQuantity(item.variantId, item.quantity - 1)">−</button>
            <input type="number" min="1" [ngModel]="item.quantity" (ngModelChange)="cart.setQuantity(item.variantId, $event)" />
            <button type="button" (click)="cart.setQuantity(item.variantId, item.quantity + 1)">+</button>
          </span>
          <span class="m-price">₦{{ item.unitPrice * item.quantity | number: '1.0-2' }}</span>
          <button class="discard" (click)="cart.remove(item.variantId)">[REMOVE]</button>
        </div>
      }
      <div class="matrix-panel" style="position:static; max-width:420px; margin-top:1.4rem">
        <div class="matrix-row"><span>Subtotal</span><span>₦{{ cart.total | number: '1.0-2' }}</span></div>
        <div class="matrix-row"><span>Delivery</span><span>quoted at dispatch</span></div>
        <div class="matrix-total">
          <span class="label">Total due</span>
          <span class="value">₦{{ cart.total | number: '1.0-0' }}</span>
        </div>
        <a class="cta" routerLink="/checkout">Proceed to checkout</a>
        <p class="muted small" style="margin-bottom:0">Full payment is required upfront — no part-payments.</p>
      </div>
    }
  `,
})
export class CartPage {
  readonly cart = inject(CartService);
}
