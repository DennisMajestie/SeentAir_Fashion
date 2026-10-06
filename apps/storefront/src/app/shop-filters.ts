import { offerFor } from './pricing';
import { Product } from './api.service';

/**
 * The facets the filter sheet owns. Category lives on the rail and the search
 * box owns `query`, so neither is here.
 *
 * Single-select per facet, matching how the grid already filters. Multi-select
 * would change the meaning of `filtered()` and the URL shape, so it is a
 * deliberate follow-up rather than something to slip in with the sheet.
 */
export interface SheetFilters {
  size: string | null;
  colour: string | null;
  collection: string | null;
  /** Upper bound, inclusive. Null means no price limit. */
  maxPrice: number | null;
}

export const EMPTY_FILTERS: SheetFilters = {
  size: null,
  colour: null,
  collection: null,
  maxPrice: null,
};

/**
 * ONE predicate, used by both the grid and the sheet's "Show N pieces" count.
 * The spec requires the number on the button to equal what the grid renders, so
 * two implementations that could drift apart are not an option.
 */
export function matchesSheetFilters(p: Product, f: SheetFilters): boolean {
  if (f.collection && p.collection?.name !== f.collection) return false;
  if (f.size && !p.variants.some((v) => v.size === f.size)) return false;
  if (f.colour && !p.variants.some((v) => v.colour === f.colour)) return false;
  // The price a shopper would pay now, so a piece on sale under the band shows.
  if (f.maxPrice !== null && offerFor(p).price > f.maxPrice) return false;
  return true;
}

export function filtersEqual(a: SheetFilters, b: SheetFilters): boolean {
  return (
    a.size === b.size &&
    a.colour === b.colour &&
    a.collection === b.collection &&
    a.maxPrice === b.maxPrice
  );
}

export function activeFilterCount(f: SheetFilters): number {
  return [f.size, f.colour, f.collection, f.maxPrice].filter((v) => v !== null).length;
}

/**
 * How many products a facet option would leave, counted against the rest of the
 * pending selection but ignoring the facet's own current value — so the number
 * beside "Black" answers "what if I picked black", not "what did black do last
 * time". Standard facet counting; without it every unselected option reads 0 as
 * soon as something in the same facet is chosen.
 */
export function facetCount(
  products: Product[],
  pending: SheetFilters,
  facet: keyof SheetFilters,
  value: string | number,
): number {
  const probe: SheetFilters = { ...pending, [facet]: value };
  return products.filter((p) => matchesSheetFilters(p, probe)).length;
}

/** Price bands derived from the catalogue, so they never sit outside real prices. */
export function priceBands(products: Product[]): Array<{ label: string; max: number }> {
  if (products.length === 0) return [];
  const max = Math.max(...products.map((p) => p.basePrice));
  const steps = [25_000, 50_000, 100_000, 200_000].filter((s) => s < max);
  return [...steps, max].map((m) => ({
    label: m === max ? 'Any price' : `Under ₦${(m / 1000).toFixed(0)}k`,
    max: m,
  }));
}
