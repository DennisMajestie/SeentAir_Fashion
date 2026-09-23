import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CartService } from '../cart.service';
import { environment } from '../../environments/environment';

/** Cart — Stitch approved screen, stage 01 "Review": manifest with
    thumbnails, conditional policy notices, summary card with gradient
    total, sticky CTA footer. Checkout owns sign-in + final payment. */
@Component({
  selector: 'app-cart',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <h1 class="page-title">Cart & checkout</h1>

    @if (cart.items().length === 0) {
      <div class="cart-empty u-rise">
        <p class="muted flush">Your cart is empty.</p>
        <a class="cta" routerLink="/shop">Back to the shop</a>
      </div>
    } @else {
      <div class="stage-bar u-rise">
        <div class="stage-label-line">
          <b>Stage 01 · Review</b>
          <span>Step 1 of 3</span>
        </div>
        <div class="stage-segs" role="progressbar" aria-label="Checkout progress, step 1 of 3" aria-valuemin="1" aria-valuemax="3" aria-valuenow="1">
          <span class="seg on"></span><span class="seg"></span><span class="seg"></span>
        </div>
      </div>

      @if (cart.moqEligible) {
        <div class="notice notice-warn u-rise" role="status">
          <svg class="notice-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M10 2.2 18.4 17H1.6L10 2.2Zm0 4-1.2 6h2.4L10 6.2Zm0 8.1a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" />
          </svg>
          <span>
            <span class="notice-title">Wholesale eligibility</span>
            {{ cart.count | number: '2.0' }} units meets the 20-unit MOQ. For tiered
            wholesale pricing and bulk dispatch, place this order from the
            <a [href]="environment.wholesaleUrl" target="_blank" rel="noopener noreferrer">wholesale portal</a>.
          </span>
        </div>
      }
      @if (cart.hasMadeToOrder) {
        <div class="notice notice-warn u-rise" role="status">
          <svg class="notice-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M9 2.5 1.8 15.5A1 1 0 0 0 2.8 17h14.4a1 1 0 0 0 1-1.5L11 2.5a1 1 0 0 0-2 0Z" />
            <path d="M10 7v4M10 13.5h.01" />
          </svg>
          <span>
            <span class="notice-title">Made to order</span>
            One or more pieces are produced on request — sample approval and a
            production run happen before dispatch, so allow extra time.
          </span>
        </div>
      }

      <div class="checkout-cols">
        <section aria-label="Order manifest" class="u-rise">
          <p class="section-label">Items <span class="count">[{{ cart.count | number: '2.0' }}]</span></p>
          @for (item of cart.items(); track item.variantId) {
            <div class="manifest-row">
              @if (item.imageUrl) {
                <img class="m-thumb" [src]="item.imageUrl" [alt]="item.productName" loading="lazy" />
              } @else {
                <div class="m-thumb m-thumb-monogram" aria-hidden="true">{{ item.productName.charAt(0) }}</div>
              }
              <div class="m-body">
                <p class="sku-line">{{ item.sku }}</p>
                <p class="m-name">{{ item.productName }}</p>
                <p class="muted small">{{ item.size || '—' }} / {{ item.colour || '—' }}</p>
              </div>
              <span class="qty-stepper">
                <button type="button" (click)="cart.setQuantity(item.variantId, item.quantity - 1)">−</button>
                <input type="number" min="1" inputmode="numeric" [ngModel]="item.quantity" (ngModelChange)="cart.setQuantity(item.variantId, $event)" />
                <button type="button" (click)="cart.setQuantity(item.variantId, item.quantity + 1)">+</button>
              </span>
              <span class="m-price">₦{{ item.unitPrice * item.quantity | number: '1.0-2' }}</span>
              <button class="discard" (click)="cart.remove(item.variantId)">[REMOVE]</button>
            </div>
          }
        </section>

        <aside class="matrix-panel u-rise-1" aria-label="Order summary">
          <p class="section-label flush-top">Order summary</p>
          <div class="matrix-row"><span>Subtotal</span><span>₦{{ cart.total | number: '1.0-2' }}</span></div>
          <div class="matrix-row"><span>Delivery</span><span>quoted at dispatch</span></div>
          <div class="matrix-row"><span>Payment policy</span><span>full &amp; upfront</span></div>
          <div class="matrix-divider"></div>
          <div class="matrix-total">
            <span class="label">Total due</span>
            <span class="value">₦{{ cart.total | number: '1.0-0' }}</span>
          </div>
        </aside>
      </div>

      <div class="sticky-cta u-rise-2">
        <div class="scta-inner">
          <span class="scta-trust">Final payment · secured by Paystack</span>
          <a class="cta" routerLink="/checkout">Proceed to checkout →</a>
        </div>
      </div>
    }
  `,
})
export class CartPage {
  readonly cart = inject(CartService);
  readonly environment = environment;
}