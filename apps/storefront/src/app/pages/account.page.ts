import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { offerFor } from '../pricing';
import { ApiService, Order } from '../api.service';
import { WishlistService, WishItem } from '../wishlist.service';

/**
 * Public saved-products surface for both guests and signed-in shoppers.
 * Guests use their local wishlist; signed-in shoppers see their account list.
 */
@Component({
  selector: 'app-account',
  imports: [CommonModule, RouterLink],
  template: `
    @if (!api.isLoggedIn) {
      <h1>Saved</h1>
    }

    @if (wishlistLoading()) {
      <div class="dot-loader" role="status" aria-live="polite">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    } @else if (savedItems().length > 0) {
      <h2 id="saved">Saved</h2>
      <div class="saved-grid">
        @for (item of savedItems(); track item.productId) {
          <a class="saved-row" [routerLink]="['/product', item.productId]">
            @if (item.imageUrl) {
              <img [src]="item.imageUrl" [alt]="item.productName" />
            }
            <span>{{ item.productName }}</span>
            <span class="muted">₦{{ item.price | number: '1.0-2' }}</span>
          </a>
        }
      </div>
      <div class="shop-sentinel loading-sentinel" role="status" aria-live="polite">
        <div class="dot-loader dot-loader--large" role="status" aria-live="polite">
          <span class="dot dot--large"></span>
          <span class="dot dot--large"></span>
          <span class="dot dot--large"></span>
        </div>
      </div>
    }

    @if (api.isLoggedIn) {
      <h1>Your account</h1>
      <button class="link" type="button" (click)="logout()">Sign out</button>

      <!-- ids match the fragments the mobile shell links to: the header bell
           goes to #notifications, the Orders tab goes to #orders. -->
      @if (notifications().length > 0) {
        <h2 id="notifications">Notifications</h2>
        @for (n of notifications(); track n.id) {
          <div class="event">
            <strong>{{ n.type.replaceAll('_', ' ') }}</strong>
            <span class="muted small">{{ n.sentAt | date: 'medium' }}</span>
            <p class="small">{{ n.message }}</p>
          </div>
        }
      }

      <h2 id="orders">Your orders</h2>
      @if (orders().length === 0) {
        <p class="muted">No orders yet. <a routerLink="/">Start shopping</a></p>
      } @else {
        @for (order of orders(); track order.id) {
          <a class="order-row" [routerLink]="['/orders', order.id]">
            <span><code>{{ order.id.slice(0, 8) }}</code></span>
            <span class="status" [class]="'status ' + order.status">{{
              order.status.replaceAll('_', ' ')
            }}</span>
            <span>₦{{ order.totalAmount | number: '1.0-2' }}</span>
          </a>
        }
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class AccountPage implements OnInit {
  readonly api = inject(ApiService);
  private readonly wishlist = inject(WishlistService);

  /** The account's saved products, shown alongside orders and notifications. */
  readonly wishlistItems = signal<WishItem[]>([]);
  readonly wishlistLoading = signal(false);
  /** Saved products regardless of auth state: guests browse their local
    *  list, signed-in shoppers see their account list (merged + synced). */
  readonly savedItems = computed(() =>
    this.api.isLoggedIn ? this.wishlistItems() : this.wishlist.items(),
  );
  readonly orders = signal<Order[]>([]);
  readonly notifications = signal<
    Array<{ id: string; type: string; message: string; sentAt: string }>
  >([]);

  ngOnInit(): void {
    if (this.api.isLoggedIn) this.loadOrders();
    if (this.api.isLoggedIn) {
      this.wishlistLoading.set(true);
      this.api
        .wishlist()
        .pipe(
          map((rows) =>
            rows.map((r) => ({
              productId: r.product.id,
              productName: r.product.name,
              imageUrl: r.product.primaryImageUrl ?? r.product.variants[0]?.imageUrl ?? null,
              price: offerFor(r.product).price,
            })),
          ),
        )
        .subscribe({
          next: (items) => {
            this.wishlistItems.set(items);
            this.wishlistLoading.set(false);
          },
          error: () => {
            this.wishlistLoading.set(false);
          },
        });
    }
  }

  logout(): void {
    this.api.logout();
    this.orders.set([]);
    this.notifications.set([]);
    this.wishlistItems.set([]);
  }

  private loadOrders(): void {
    this.api.myOrders().subscribe((res) => this.orders.set(res.data));
    this.api.notifications().subscribe((res) => this.notifications.set(res.data));
  }
}
