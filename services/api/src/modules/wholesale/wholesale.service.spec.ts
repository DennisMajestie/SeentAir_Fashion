import { ForbiddenException } from '@nestjs/common';
import { RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { AvailabilityStatus } from '../catalogue/entities/product-variant.entity';
import { WholesaleService } from './wholesale.service';

const buyer: AuthenticatedUser = {
  id: 'wh-1',
  email: 'wholesaler@seentair.test',
  role: RoleName.WHOLESALER,
};

const tier = (discountPercent: number) =>
  ({
    id: 't1',
    name: 'Standard',
    ruleDescription: null,
    discountPercent,
  }) as never;

/** A catalogue product with three variants, only the last of which has an image. */
function product() {
  return {
    id: 'p1',
    name: 'Aba Cargo',
    category: 'trousers',
    basePrice: 9000,
    variants: [
      {
        id: 'v1',
        sku: 'CARGO-S',
        size: 'S',
        colour: 'black',
        priceOverride: null,
        imageUrl: null,
        availabilityStatus: AvailabilityStatus.IN_STOCK,
      },
      {
        id: 'v2',
        sku: 'CARGO-M',
        size: 'M',
        colour: 'black',
        priceOverride: 9500,
        imageUrl: 'https://cdn.example/cargo.jpg',
        availabilityStatus: AvailabilityStatus.OUT_OF_STOCK,
      },
    ],
  } as never;
}

describe('WholesaleService.pricing - catalogue projection', () => {
  let service: WholesaleService;
  let accountRepo: { findOne: jest.Mock };
  let tierRepo: { find: jest.Mock };

  const build = (t: unknown) => {
    accountRepo.findOne.mockResolvedValue(
      t === undefined ? null : { id: 'a1', status: 'approved', tier: t },
    );
    service = new WholesaleService(
      accountRepo as never,
      tierRepo as never,
      {} as never,
      {} as never,
      {} as never,
      { findAll: jest.fn(async () => ({ data: [product()], total: 1 })) } as never,
      {} as never,
      { get: jest.fn(() => 20) } as never,
      // pricing() never touches inventory; the stock endpoint has its own spec.
      { currentQuantity: jest.fn(async () => 0) } as never,
    );
  };

  beforeEach(() => {
    accountRepo = { findOne: jest.fn() };
    tierRepo = { find: jest.fn() };
    build(tier(15));
  });

  it('refuses a buyer with no wholesale account', async () => {
    build(null);
    accountRepo.findOne.mockResolvedValue(null);
    await expect(service.pricing(buyer)).rejects.toThrow(ForbiddenException);
  });

  it('refuses an account that is not approved', async () => {
    accountRepo.findOne.mockResolvedValue({ id: 'a1', status: 'pending', tier: null });
    await expect(service.pricing(buyer)).rejects.toThrow(ForbiddenException);
  });

  it('serves the MOQ from configuration, not a literal', async () => {
    const res = await service.pricing(buyer);
    expect(res.moq).toBe(20);
  });

  it('picks the first variant image as the product thumbnail', async () => {
    const res = await service.pricing(buyer);
    expect(res.data[0].imageUrl).toBe('https://cdn.example/cargo.jpg');
  });

  it('exposes no stock quantity on the pricing payload', async () => {
    const res = await service.pricing(buyer);
    // Stock lives behind the dedicated /wholesale/stock endpoint, so pricing
    // stays a price document. Checked at key level, because
    // `availabilityStatus: "in_stock"` legitimately contains the word.
    const keys = new Set<string>();
    JSON.stringify(res, (_k, v) => {
      if (v && typeof v === 'object') Object.keys(v).forEach((k) => keys.add(k));
      return v;
    });
    for (const leak of [
      'stock',
      'stockQuantity',
      'availableUnits',
      'onHand',
      'quantity',
      'quantityOnHand',
    ]) {
      expect(keys.has(leak)).toBe(false);
    }
  });

  it('leaves imageUrl null when no variant has an image', async () => {
    const p = product() as unknown as { variants: Array<{ imageUrl: string | null }> };
    p.variants.forEach((v) => (v.imageUrl = null));
    const svc = new WholesaleService(
      { findOne: jest.fn(async () => ({ status: 'approved', tier: tier(15) })) } as never,
      tierRepo as never,
      {} as never,
      {} as never,
      {} as never,
      { findAll: jest.fn(async () => ({ data: [p], total: 1 })) } as never,
      {} as never,
      { get: jest.fn(() => 20) } as never,
      { currentQuantity: jest.fn(async () => 0) } as never,
    );
    const res = await svc.pricing(buyer);
    expect(res.data[0].imageUrl).toBeNull();
  });

  it('exposes per-variant availability status but never a stock quantity', async () => {
    const res = await service.pricing(buyer);
    expect(res.data[0].variants[1].availabilityStatus).toBe(AvailabilityStatus.OUT_OF_STOCK);

    // Assert on key names, not substrings: the enum *value* "out_of_stock"
    // legitimately contains the word.
    const keys = new Set<string>();
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          keys.add(k);
          walk(v);
        }
      }
    };
    walk(res);
    expect([...keys].filter((k) => /stock|quantity|onHand|available/i.test(k))).toEqual([]);
    expect(keys.has('availabilityStatus')).toBe(true);
  });

  describe('tier discount', () => {
    it('reports hasDiscount true and applies the tier to every price', async () => {
      const res = await service.pricing(buyer);
      expect(res.hasDiscount).toBe(true);
      // 9000 at 15% off = 7650; the override 9500 at 15% off = 8075.
      expect(res.data[0].wholesalePrice).toBe(7650);
      expect(res.data[0].variants[1].wholesalePrice).toBe(8075);
    });

    it('reports hasDiscount false when the account has no tier, and wholesale equals retail', async () => {
      build(null);
      const res = await service.pricing(buyer);
      expect(res.hasDiscount).toBe(false);
      // This is the bug the catalogue badge used to hide behind "-0% vs retail".
      expect(res.data[0].wholesalePrice).toBe(res.data[0].retailPrice);
      expect(res.data[0].variants[1].wholesalePrice).toBe(res.data[0].variants[1].retailPrice);
    });

    it('treats a 0% tier as no discount', async () => {
      build(tier(0));
      const res = await service.pricing(buyer);
      expect(res.hasDiscount).toBe(false);
      expect(res.data[0].wholesalePrice).toBe(res.data[0].retailPrice);
    });

    it('round-trips applyTierPrice through tierDiscount', () => {
      expect(service.tierDiscount(tier(15) as never)).toBe(15);
      expect(service.tierDiscount(null)).toBe(0);
      expect(service.applyTierPrice(9000, tier(15) as never)).toBe(7650);
      expect(service.applyTierPrice(9000, null)).toBe(9000);
    });
  });
});
