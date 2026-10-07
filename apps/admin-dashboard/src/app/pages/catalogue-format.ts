/** Shapes and wording shared by the catalogue list and a product's own page. */

export interface VariantRow {
  id: string;
  sku: string;
  size: string | null;
  colour: string | null;
  priceOverride: number | null;
}

export interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  basePrice: number;
  /** Timed sale: percent off until saleEndsAt. salePrice is set only while it runs. */
  salePercent: number | null;
  saleEndsAt: string | null;
  salePrice: number | null;
  variants: VariantRow[];
  collection: { name: string } | null;
}

export interface TierRow {
  id: string;
  name: string;
  ruleDescription: string | null;
  discountPercent: number;
}

/** A sale awaiting approval. Kept with its terms, because the API only accepts
    an approval for exactly the discount and end time that were requested. */
export interface SaleRequest {
  id: string;
  percent: number;
  endsAt: string;
}

export const SALE_REQUESTS_KEY = 'seentair.admin.saleRequests';

/** Sale requests raised from this browser, by product id. Persisted: approval
    comes from someone else and can take hours, so the request has to survive
    a reload for the "Start sale" step to still be there afterwards. */
export function readSaleRequests(): Record<string, SaleRequest> {
  try {
    return JSON.parse(localStorage.getItem(SALE_REQUESTS_KEY) ?? '{}') as Record<
      string,
      SaleRequest
    >;
  } catch {
    return {};
  }
}

export function writeSaleRequests(requests: Record<string, SaleRequest>): void {
  try {
    localStorage.setItem(SALE_REQUESTS_KEY, JSON.stringify(requests));
  } catch {
    // Storage unavailable: the request still works until the page reloads.
  }
}

/** Same 2dp rounding the API uses, so the preview matches what is charged. */
export function salePriceAt(basePrice: number, percent: number): number {
  return Math.round(basePrice * (100 - Number(percent))) / 100;
}

export function onSale(p: ProductRow): boolean {
  return p.salePrice !== null && p.salePrice !== undefined;
}

/** "1 size", "3 sizes". */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Units in stock for a product, from the inventory summary (variant id to quantity). */
export function stockOf(p: ProductRow, stock: Map<string, number>): number {
  return p.variants.reduce((sum, v) => sum + (stock.get(v.id) ?? 0), 0);
}

/** Stock valued at the retail price each size sells for. */
export function stockValue(p: ProductRow, stock: Map<string, number>): number {
  return p.variants.reduce(
    (sum, v) => sum + (stock.get(v.id) ?? 0) * (v.priceOverride ?? p.basePrice),
    0,
  );
}

/** The first and last SKU of a product, enough to recognise it by. */
export function skuRange(p: ProductRow): string {
  const skus = p.variants.map((v) => v.sku);
  if (skus.length === 0) return 'No sizes yet';
  return skus.length > 2 ? `${skus[0]} to ${skus[skus.length - 1]}` : skus.join(', ');
}
