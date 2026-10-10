import { offerFor } from './pricing';
import { Injectable, Injector, inject, signal } from '@angular/core';
import { ApiService, Product } from './api.service';

export interface WishItem {
  productId: string;
  productName: string;
  imageUrl: string | null;
  price: number;
}
const WISH_KEY = 'seentair.wishlist';

/**
 * The saved products, held locally so a guest can save before signing in.
 *
 * Two things this deliberately does not do:
 *
 * - It does not snapshot price or photo as the source of truth. Prices are
 *   re-read from the live product on render, so a saved item never quotes a
 *   price that has since changed (see the backend, which stores the association
 *   only, for the same reason).
 * - It does not treat the local list as authoritative once signed in. The
 *   account list is the real one; syncFromAccount replaces the local copy after
 *   a merge so the two cannot drift apart.
 */
@Injectable({ providedIn: 'root' })
export class WishlistService {
  readonly items = signal<WishItem[]>(this.load());
  /**
   * Resolved lazily rather than injected in the constructor. Every product card
   * injects this service just to know whether a heart is filled, and injecting
   * ApiService directly would drag HttpClient into all of them — so a card would
   * need an HTTP backend it never calls. Only sign-in and the account page reach
   * the server, and they ask for it when they actually need it.
   */
  private readonly injector = inject(Injector);

  private get api(): ApiService {
    return this.injector.get(ApiService);
  }

  private load(): WishItem[] {
    try {
      return JSON.parse(localStorage.getItem(WISH_KEY) ?? '[]') as WishItem[];
    } catch {
      return [];
    }
  }

  private persist(items: WishItem[]): void {
    this.items.set(items);
    try {
      localStorage.setItem(WISH_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable, wishlist lives in memory only */
    }
  }

  has(productId: string): boolean {
    return this.items().some((i) => i.productId === productId);
  }

  toggle(product: Product): void {
    const items = this.items();
    if (this.has(product.id)) {
      this.remove(product.id);
      return;
    }
    this.persist([
      ...items,
      {
        productId: product.id,
        productName: product.name,
        // A persisted snapshot keeps only real photos (the product's own, then
        // the first variant's) — never the shared placeholder, which can appear
        // or disappear as assets ship.
        imageUrl: product.primaryImageUrl ?? product.variants[0]?.imageUrl ?? null,
        price: offerFor(product).price,
      },
    ]);
  }

  remove(productId: string): void {
    this.persist(this.items().filter((i) => i.productId !== productId));
  }

  get count(): number {
    return this.items().length;
  }

  /**
   * Folds the guest's local list into the account and adopts the result.
   *
   * Called once after a successful sign-in. Without it, saving products and then
   * signing in silently loses them: the list stayed in localStorage, keyed to
   * nobody, and the account started empty.
   *
   * The server is the authority on the merged list, so its answer replaces the
   * local copy rather than being merged into it -- otherwise a product the
   * account already had could survive in one copy and not the other. A failure
   * is swallowed: a wishlist sync is not worth failing a sign-in over, and the
   * local list is left intact so a later attempt can retry.
   */
  async mergeIntoAccount(): Promise<void> {
    const ids = this.items().map((i) => i.productId);
    if (ids.length === 0) return;
    try {
      await new Promise<void>((resolve) => {
        this.api.mergeWishlist(ids).subscribe({
          next: () => this.syncFromAccount(),
          error: () => resolve(),
          complete: () => resolve(),
        });
      });
    } catch {
      /* network or server trouble: keep the local list and move on */
    }
  }

  /** Replaces the local list with the account's own. */
  syncFromAccount(): void {
    this.api.wishlist().subscribe({
      next: (rows) =>
        this.persist(
          rows.map((r) => ({
            productId: r.product.id,
            productName: r.product.name,
            imageUrl: r.product.primaryImageUrl ?? r.product.variants[0]?.imageUrl ?? null,
            price: offerFor(r.product).price,
          })),
        ),
      error: () => undefined,
    });
  }
}
