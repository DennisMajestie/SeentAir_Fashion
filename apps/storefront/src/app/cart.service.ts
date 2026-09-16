import { Injectable, signal } from '@angular/core';
import { Product, ProductVariant } from './api.service';

export interface CartItem {
  productId: string;
  productName: string;
  variantId: string;
  sku: string;
  size: string | null;
  colour: string | null;
  unitPrice: number;
  quantity: number;
}

const CART_KEY = 'seentair.cart';

@Injectable({ providedIn: 'root' })
export class CartService {
  readonly items = signal<CartItem[]>(this.load());

  private load(): CartItem[] {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') as CartItem[];
    } catch {
      return [];
    }
  }

  private persist(items: CartItem[]): void {
    this.items.set(items);
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable — cart lives in memory only */
    }
  }

  add(product: Product, variant: ProductVariant, quantity: number): void {
    const items = [...this.items()];
    const existing = items.find((i) => i.variantId === variant.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        sku: variant.sku,
        size: variant.size,
        colour: variant.colour,
        unitPrice: variant.priceOverride ?? product.basePrice,
        quantity,
      });
    }
    this.persist(items);
  }

  setQuantity(variantId: string, quantity: number): void {
    const items = this.items()
      .map((i) => (i.variantId === variantId ? { ...i, quantity } : i))
      .filter((i) => i.quantity > 0);
    this.persist(items);
  }

  remove(variantId: string): void {
    this.persist(this.items().filter((i) => i.variantId !== variantId));
  }

  clear(): void {
    this.persist([]);
  }

  get count(): number {
    return this.items().reduce((sum, i) => sum + i.quantity, 0);
  }

  get total(): number {
    return this.items().reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  }
}
