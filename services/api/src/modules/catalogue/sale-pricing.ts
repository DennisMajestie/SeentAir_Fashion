/**
 * Timed sales ("sale surge").
 *
 * A sale is a percentage off a product's normal retail price until a stated
 * end time. It is stored on the product as `salePercent` + `saleEndsAt` and is
 * never written into `basePrice`: the normal price stays intact underneath, so
 * a sale ends by the clock alone and nothing has to be restored afterwards.
 *
 * Everything that prices a retail sale -- the public product payload and order
 * creation -- goes through these functions, so the price a shopper is shown and
 * the price they are charged cannot disagree.
 */

/** Largest discount a sale may carry. A typo of 500 must not sell at a loss. */
export const MAX_SALE_PERCENT = 90;

/** The sale fields a price calculation needs. A Product satisfies it. */
export interface SaleTerms {
  salePercent?: number | null;
  saleEndsAt?: Date | string | null;
}

/** The discount in force at `now`, or null when no sale is running. */
export function activeSalePercent(terms: SaleTerms, now: Date = new Date()): number | null {
  const percent = terms.salePercent;
  if (percent === null || percent === undefined || !terms.saleEndsAt) return null;
  if (!(percent > 0)) return null;
  // The end is exclusive: at the stated instant the sale is over.
  if (now.getTime() >= new Date(terms.saleEndsAt).getTime()) return null;
  return percent;
}

/** A price with a percentage taken off; 2dp rounding, the same as tier pricing. */
export function applySalePercent(price: number, percent: number): number {
  return Math.round(price * (100 - percent)) / 100;
}

/**
 * What one unit costs a retail buyer right now: the list price (a variant's
 * override, or the product's base price) less any sale in force.
 */
export function retailUnitPrice(
  listPrice: number,
  terms: SaleTerms,
  now: Date = new Date(),
): number {
  const percent = activeSalePercent(terms, now);
  return percent === null ? listPrice : applySalePercent(listPrice, percent);
}
