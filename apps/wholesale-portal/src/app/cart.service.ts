import { Injectable, computed, signal } from '@angular/core';

/** One variant line in the draft batch (W3 quick-add or W4 matrix). */
export interface CartLine {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  size: string | null;
  colour: string | null;
  unitPrice: number;
  quantity: number;
}

/**
 * Draft batch allocation shared by Catalogue (W3), Bulk Order Matrix (W4)
 * and Bulk Cart & Checkout (W5). In-memory only — the server order is the
 * single source of truth once the batch is committed.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  readonly lines = signal<CartLine[]>([]);

  readonly units = computed(() => this.lines().reduce((n, l) => n + l.quantity, 0));
  readonly amount = computed(() =>
    Math.round(this.lines().reduce((n, l) => n + l.quantity * l.unitPrice, 0) * 100) / 100,
  );

  /** Merge quantities in (same variant adds up); zero/negative input is ignored. */
  add(newLines: CartLine[]): void {
    const merged = [...this.lines()];
    for (const line of newLines) {
      if (line.quantity <= 0) continue;
      const existing = merged.find((l) => l.variantId === line.variantId);
      if (existing) existing.quantity += line.quantity;
      else merged.push({ ...line });
    }
    this.lines.set(merged.map((l) => ({ ...l })));
  }

  /** Replace all lines of one product with a fresh matrix selection. */
  setProduct(productId: string, newLines: CartLine[]): void {
    const kept = this.lines().filter((l) => l.productId !== productId);
    this.lines.set([...kept, ...newLines.filter((l) => l.quantity > 0).map((l) => ({ ...l }))]);
  }

  removeProduct(productId: string): void {
    this.lines.set(this.lines().filter((l) => l.productId !== productId));
  }

  clear(): void {
    this.lines.set([]);
  }

  /** Payload for POST /orders. */
  toOrderItems(): Array<{ variantId: string; quantity: number }> {
    return this.lines().map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
  }
}
