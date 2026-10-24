import { ProductCatalogueSizeClassResolver } from './basket-size-class-resolver';

type VariantRow = { id: string; product: { sizeClass: string | null } };

/** A catalogue that answers find() with every variant it holds. */
function repo(rows: VariantRow[]) {
  return { find: async () => rows } as never;
}

describe('ProductCatalogueSizeClassResolver', () => {
  it('prices from the catalogue and ignores the client hint', async () => {
    const svc = new ProductCatalogueSizeClassResolver(repo([
      { id: 'vTee', product: { sizeClass: 'light' } },
      { id: 'vSet', product: { sizeClass: 'heavy' } },
    ]));
    await expect(
      svc.heaviest([
        { variantId: 'vTee', sizeClass: 'light' },
        { variantId: 'vSet', sizeClass: 'light' },
      ]),
    ).resolves.toBe('heavy');
  });

  it('falls back to the hint for an unknown variant', async () => {
    const svc = new ProductCatalogueSizeClassResolver(repo([
      { id: 'vTee', product: { sizeClass: 'light' } },
    ]));
    await expect(
      svc.heaviest([
        { variantId: 'vGhost', sizeClass: 'heavy' },
        { variantId: 'vTee', sizeClass: 'light' },
      ]),
    ).resolves.toBe('heavy');
  });

  it('uses the hint for lines that carry no variant at all', async () => {
    const svc = new ProductCatalogueSizeClassResolver(repo([]));
    await expect(
      svc.heaviest([]), // empty basket
    ).resolves.toBe('medium');
    await expect(svc.heaviest([{ sizeClass: 'blue whale' }])).resolves.toBe('medium');
  });

  it('keeps the heaviest of many hints when nothing is in the catalogue', async () => {
    const svc = new ProductCatalogueSizeClassResolver(repo([]));
    await expect(
      svc.heaviest([
        { variantId: 'a', sizeClass: 'light' },
        { variantId: 'b', sizeClass: 'medium' },
        { variantId: 'c', sizeClass: 'light' },
      ]),
    ).resolves.toBe('medium');
  });
});
