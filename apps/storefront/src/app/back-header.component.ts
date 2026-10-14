import { CommonModule } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CartService } from './cart.service';

/**
 * The compact header that stands in for the universal chrome on immersive pages.
 *
 * UNUSED right now: shop was the last route declaring `immersive: true` and it
 * now keeps the real site header, so nothing renders this component. It is kept
 * because it is the fallback for whichever surface next needs to opt out of the
 * chrome -- delete it if that never happens.
 *
 * It is deliberately not the site header: a shopper deep in a product or a
 * filtered grid is looking at something, not navigating, so the bar carries the
 * one action that gets them out (back) and the two they are most likely to want
 * mid-flow (search, cart). Back goes to wherever the shopper actually came from
 * and falls back to the shop when there is no history to return to -- a shared
 * link opened cold still has to lead somewhere.
 */
@Component({
  selector: 'app-back-header',
  imports: [CommonModule, RouterLink],
  template: `
    <header class="p-head">
      <div class="p-head__in">
        <button
          class="p-head__btn"
          type="button"
          (click)="back()"
          [attr.aria-label]="backLabel()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>

        <span class="p-head__brand">
          <img src="assets/logo.png" alt="SEENTAIR" />
        </span>

        <div class="p-head__acts">
          @if (showSearch()) {
            <a class="p-head__btn" routerLink="/shop" aria-label="Search products">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </a>
          }
          <a class="p-head__btn" routerLink="/account" aria-label="Account">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </a>
          <a class="p-head__btn" routerLink="/cart" aria-label="Cart">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6" />
              <circle cx="9" cy="20" r="1" />
              <circle cx="17" cy="20" r="1" />
            </svg>
            @if (cart.count > 0) {
              <span class="p-head__badge" aria-hidden="true">{{ cart.count }}</span>
            }
          </a>
        </div>
      </div>
    </header>
  `,
})
export class BackHeaderComponent {
  private readonly router = inject(Router);
  protected readonly cart = inject(CartService);

  /** The shop page already has a search field of its own, so the icon is redundant. */
  readonly showSearch = input(true);

  protected backLabel(): string {
    return 'Back';
  }

  protected back(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
    else void this.router.navigate(['/shop']);
  }
}