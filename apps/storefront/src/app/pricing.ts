import { Product, ProductVariant } from './api.service';

/**
 * What a shopper pays for a product right now, and what it normally costs.
 *
 * The API prices orders with the same rule (services/api .../sale-pricing.ts):
 * a timed sale is a percentage off the list price until `saleEndsAt`. This file
 * only decides what to DISPLAY -- the order is always priced by the server.
 */
export interface Offer {
  /** The price to show and to put in the cart. */
  price: number;
  /** The normal price, when a sale is running; otherwise null. */
  was: number | null;
  /** Percentage off, when a sale is running; otherwise null. */
  percent: number | null;
  /** ISO end time of the running sale; otherwise null. */
  endsAt: string | null;
}

type SaleFields = Pick<Product, 'salePercent' | 'saleEndsAt' | 'salePrice'>;

/**
 * The sale in force for a product, or null.
 *
 * Two conditions, both required. `salePrice` is the server saying the sale was
 * live when the product was fetched, so a stale or scheduled discount is never
 * shown. The clock check then ends the sale on a page that has been open since
 * before it finished, without waiting for a reload.
 */
export function activeSale(
  p: SaleFields,
  now: number = Date.now(),
): { percent: number; endsAt: string } | null {
  if (p.salePrice === null || p.salePrice === undefined) return null;
  if (!p.salePercent || !p.saleEndsAt) return null;
  if (now >= Date.parse(p.saleEndsAt)) return null;
  return { percent: p.salePercent, endsAt: p.saleEndsAt };
}

/** The offer for a product, or for one of its variants when it has its own price. */
export function offerFor(
  p: Product,
  variant?: ProductVariant | null,
  now: number = Date.now(),
): Offer {
  const list = variant?.priceOverride ?? p.basePrice;
  const sale = activeSale(p, now);
  if (!sale) return { price: list, was: null, percent: null, endsAt: null };
  return {
    // Same 2dp rounding as the API, so the displayed price is the charged one.
    price: Math.round(list * (100 - sale.percent)) / 100,
    was: list,
    percent: sale.percent,
    endsAt: sale.endsAt,
  };
}

/**
 * Time left on a sale, for the countdown. Under a day it is a ticking
 * hh:mm:ss; from a day up it is "2d 04h", because seconds on a sale that ends
 * next week are noise.
 */
export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const pad = (n: number): string => n.toString().padStart(2, '0');
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  if (days >= 1) return `${days}d ${pad(hours)}h`;
  return `${pad(hours)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
