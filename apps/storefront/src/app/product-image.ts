import { Product } from './api.service';

/**
 * The one photograph every storefront surface shows for a product.
 *
 * Hierarchy, in order:
 *   1. the product's own photo (`products.primary_image_url`);
 *   2. the first variant that carries a photo (`product_variants.image_url`) —
 *      deterministic, and the pre-image-feature behaviour, so nothing that
 *      relied on a variant photo regresses;
 *   3. a single neutral placeholder — never, under any circumstance, the
 *      position the product happens to sit at in a grid or rail.
 */
export const PRODUCT_PLACEHOLDER = 'assets/placeholder-product.svg';

export function productImage(p: Product): string {
  if (p.primaryImageUrl) return p.primaryImageUrl;
  const first = p.variants.find((v) => v.imageUrl);
  return first?.imageUrl ?? PRODUCT_PLACEHOLDER;
}