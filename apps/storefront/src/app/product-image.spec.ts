import { Product } from './api.service';
import { PRODUCT_PLACEHOLDER, productImage } from './product-image';

/**
 * The photo hierarchy every listing, rail, category pill and search result
 * shares: the product's own photo beats any variant, the first variant that
 * has one is the deterministic fallback, and a missing photo resolves to ONE
 * neutral placeholder — not to the position the product sits at in a grid.
 */
describe('productImage', () => {
  const variant = (imageUrl: string | null) => ({
    id: 'v1',
    sku: 'TEE-M',
    size: 'M',
    colour: 'black',
    priceOverride: null,
    imageUrl,
    availabilityStatus: 'in_stock',
  });

  const product = (over: Partial<Product> = {}): Product => ({
    id: 'p1',
    name: 'Harmattan Tee',
    description: null,
    category: 'tops',
    basePrice: 18500,
    collection: null,
    createdAt: new Date().toISOString(),
    variants: [variant(null)],
    ...over,
  });

  it('prefers the product photo over every variant photo', () => {
    expect(productImage(product({ primaryImageUrl: 'https://cdn.example/top.jpg' }))).toBe(
      'https://cdn.example/top.jpg',
    );
  });

  it('falls back to the first variant that carries a photo', () => {
    expect(
      productImage(
        product({
          variants: [variant(null), variant('https://cdn.example/tee-m.jpg'), variant('https://cdn.example/x.jpg')],
        }),
      ),
    ).toBe('https://cdn.example/tee-m.jpg');
  });

  it('ignores primaryImageUrl when it is an empty string, treating it as absent', () => {
    expect(productImage(product({ primaryImageUrl: '' }))).toBe(PRODUCT_PLACEHOLDER);
  });

  it('resolves to the single shared placeholder when nothing has a photo', () => {
    expect(productImage(product())).toBe(PRODUCT_PLACEHOLDER);
  });

  it('uses the same placeholder for every photo-less product (never a grid slot)', () => {
    const first = productImage(product({ id: 'a' }));
    const other = productImage(product({ id: 'zzz', variants: [] }));
    expect(first).toBe(PRODUCT_PLACEHOLDER);
    expect(other).toBe(PRODUCT_PLACEHOLDER);
  });
});