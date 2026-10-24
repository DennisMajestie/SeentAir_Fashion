/**
 * How big a product ships, which selects its delivery rate.
 *
 * Three bands rather than a weight in kilograms: an operator setting a price
 * needs a decision they can make from the garment in front of them, and a
 * weight field invites plausible-looking guesses that quietly ship at the wrong
 * price. The rate table is keyed on these values, so changing this list later
 * would need a migration.
 */
export enum ProductSizeClass {
  LIGHT = 'light',
  MEDIUM = 'medium',
  HEAVY = 'heavy',
}

/** What a product with no size class is priced as. Matches the column default. */
export const DEFAULT_SIZE_CLASS = ProductSizeClass.MEDIUM;

/** Ordering of the bands, lightest to heaviest. */
const SIZE_CLASS_RANK: Record<ProductSizeClass, number> = {
  [ProductSizeClass.LIGHT]: 1,
  [ProductSizeClass.MEDIUM]: 2,
  [ProductSizeClass.HEAVY]: 3,
};

/** A number that grows with weight, so bands can be compared. */
export function sizeClassRank(sizeClass: ProductSizeClass): number {
  return SIZE_CLASS_RANK[sizeClass];
}

/** Coerces anything stored or submitted into a real band, never leaving null behind. */
export function toSizeClass(value: unknown): ProductSizeClass {
  if (value === ProductSizeClass.LIGHT || value === 'light') return ProductSizeClass.LIGHT;
  if (value === ProductSizeClass.HEAVY || value === 'heavy') return ProductSizeClass.HEAVY;
  return DEFAULT_SIZE_CLASS;
}