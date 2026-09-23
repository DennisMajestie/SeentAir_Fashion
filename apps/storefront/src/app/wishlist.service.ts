import { Injectable, signal } from '@angular/core';
import { Product } from './api.service';

export interface WishItem {
  productId: string;
  productName: string;
  imageUrl: string | null;
  price: number;
}
const WISH_KEY = 'seentair.wishlist';

@Injectable({ providedIn: 'root' })
export class WishlistService {
  readonly items = signal<WishItem[]>(this.load());

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
      /* storage unavailable — wishlist lives in memory only */
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
        imageUrl: product.variants[0]?.imageUrl ?? null,
        price: product.basePrice,
      },
    ]);
  }

  remove(productId: string): void {
    this.persist(this.items().filter((i) => i.productId !== productId));
  }

  get count(): number {
    return this.items().length;
  }
}