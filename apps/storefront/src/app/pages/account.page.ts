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
    <section class="saved-page" aria-labelledby="saved-title">
      <header class="saved-heading">
        <h1 id="saved-title">Saved items</h1>
        @if (savedItems().length > 0) {
          <p class="saved-count">
            {{ savedItems().length === 1 ? '1 item' : savedItems().length + ' items' }}
          </p>
        }
      </header>

      @if (wishlistLoading()) {
        <div class="saved-grid" aria-hidden="true">
          @for (placeholder of [1, 2, 3, 4]; track placeholder) {
            <div class="saved-card saved-card--placeholder">
              <div class="skeleton saved-placeholder-image"></div>
              <div class="saved-card__body">
                <div class="skeleton saved-placeholder-line saved-placeholder-line--short"></div>
                <div class="skeleton saved-placeholder-line"></div>
              </div>
            </div>
          }
        </div>
      } @else if (savedItems().length > 0) {
        <div class="saved-grid" id="saved">
          @for (item of savedItems(); track item.productId) {
            <a class="saved-card" [routerLink]="['/product', item.productId]">
              <span class="saved-card__image">
                @if (item.imageUrl) {
                  <img [src]="item.imageUrl" [alt]="item.productName" loading="lazy" />
                }
              </span>
              <span class="saved-card__body">
                <span class="saved-card__name">{{ item.productName }}</span>
                <span class="saved-card__price">₦{{ item.price | number: '1.0-2' }}</span>
              </span>
              <span class="saved-card__action" aria-hidden="true">View product</span>
            </a>
          }
        </div>
      } @else {
        <div class="saved-empty">
          <span class="saved-empty__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" />
            </svg>
          </span>
          <h2>Nothing saved yet</h2>
          <p>Tap the heart on a piece to keep it here for later.</p>
          <a class="saved-empty__cta" routerLink="/shop">Browse the collection</a>
        </div>
      }
    </section>

    @if (api.isLoggedIn) {
      <section class="account-details" aria-labelledby="account-title">
        <header class="saved-heading">
          <h1 id="account-title">Your account</h1>
          <button class="sign-out" type="button" (click)="logout()">Sign out</button>
        </header>

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
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .saved-page,
      .account-details {
        width: min(1120px, 100%);
        margin-inline: auto;
        padding-bottom: 3rem;
      }

      .saved-heading {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        margin: 0 0 1.5rem;
      }

      .saved-heading h1 {
        margin: 0;
        font-size: clamp(1.75rem, 4vw, 2.5rem);
        line-height: 1.1;
        letter-spacing: -0.035em;
        text-transform: none;
      }

      .saved-count {
        margin: 0;
        color: var(--muted);
        font-size: var(--type-body-sm);
        white-space: nowrap;
      }

      .saved-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(210px, 100%), 1fr));
        gap: 1rem;
      }

      .saved-card {
        display: flex;
        min-width: 0;
        flex-direction: column;
        overflow: hidden;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        color: inherit;
        text-decoration: none;
        transition:
          border-color var(--dur-1) var(--ease-out),
          transform var(--dur-1) var(--ease-out),
          box-shadow var(--dur-1) var(--ease-out);
      }

      .saved-card:hover {
        border-color: var(--primary-fill);
        box-shadow: 0 10px 28px rgb(28 27 27 / 8%);
        transform: translateY(-2px);
      }

      .saved-card__image {
        display: block;
        width: 100%;
        aspect-ratio: 1 / 1.08;
        background: var(--container);
      }

      .saved-card__image img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .saved-card__body {
        display: grid;
        gap: 0.3rem;
        padding: 0.9rem 0.9rem 0.75rem;
      }

      .saved-card__name {
        overflow: hidden;
        font-weight: 650;
        line-height: 1.25;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .saved-card__price {
        color: var(--primary);
        font-size: var(--type-label-md);
        font-weight: 750;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .saved-card__action {
        margin-top: auto;
        padding: 0 0.9rem 0.9rem;
        color: var(--muted);
        font-size: var(--type-body-sm);
        font-weight: 650;
      }

      .saved-card--placeholder {
        min-height: 260px;
        pointer-events: none;
      }

      .saved-placeholder-image {
        width: 100%;
        aspect-ratio: 1 / 1.08;
        border-radius: 0;
      }

      .saved-placeholder-line {
        width: 100%;
        height: 0.8rem;
      }

      .saved-placeholder-line--short {
        width: 65%;
      }

      .saved-empty {
        display: grid;
        justify-items: center;
        padding: 4rem 1rem;
        border: 1px dashed var(--line-2);
        border-radius: var(--radius);
        background: var(--card);
        text-align: center;
      }

      .saved-empty__icon {
        display: grid;
        width: 3.5rem;
        height: 3.5rem;
        place-items: center;
        margin-bottom: 1rem;
        border-radius: 50%;
        background: var(--primary-tint);
        color: var(--primary);
      }

      .saved-empty__icon svg {
        width: 1.5rem;
        height: 1.5rem;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.7;
      }

      .saved-empty h2,
      .saved-empty p {
        margin: 0;
      }

      .saved-empty h2 {
        font-size: 1.25rem;
      }

      .saved-empty p {
        max-width: 22rem;
        margin-top: 0.5rem;
        color: var(--muted);
      }

      .saved-empty__cta,
      .sign-out {
        margin-top: 1.25rem;
        padding: 0.7rem 1.1rem;
        border-radius: var(--radius-pill);
        background: var(--primary-fill);
        color: var(--on-primary);
        font: inherit;
        font-size: var(--type-body-sm);
        font-weight: 750;
        text-decoration: none;
      }

      .account-details {
        margin-top: 4rem;
      }

      .account-details .saved-heading h1 {
        font-size: 2rem;
      }

      .sign-out {
        margin-top: 0;
        border: 0;
        cursor: pointer;
      }

      @media (max-width: 520px) {
        .saved-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.65rem;
        }

        .saved-card__body,
        .saved-card__action {
          padding-inline: 0.65rem;
        }

        .saved-card__action {
          display: none;
        }

        .account-details .saved-heading {
          align-items: center;
        }
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
