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

describe('WholesaleService.stock - derived availability for buyers', () => {
  let service: WholesaleService;
  let accountRepo: { findOne: jest.Mock };
  let catalogue: { findVariantsByIds: jest.Mock };
  let inventory: { currentQuantity: jest.Mock };

  const build = (status: string | null = 'approved') => {
    accountRepo = { findOne: jest.fn(async () => (status ? { status, tier: null } : null)) };
    inventory = { currentQuantity: jest.fn(async () => 12) };
    catalogue = {
      findVariantsByIds: jest.fn(async (ids: string[]) => {
        const map = new Map<string, unknown>();
        for (const id of ids) {
          map.set(
            id,
            id === 'mto'
              ? { id, availabilityStatus: AvailabilityStatus.MADE_TO_ORDER }
              : { id, availabilityStatus: AvailabilityStatus.IN_STOCK },
          );
        }
        return map;
      }),
    };
    service = new WholesaleService(
      accountRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      catalogue as never,
      {} as never,
      { get: jest.fn(() => 20) } as never,
      inventory as never,
    );
  };

  beforeEach(() => build());

  it('refuses a buyer with no approved account', async () => {
    build(null);
    await expect(service.stock(buyer, ['v1'])).rejects.toThrow(ForbiddenException);
  });

  it('refuses an account that is still pending', async () => {
    build('pending');
    await expect(service.stock(buyer, ['v1'])).rejects.toThrow(ForbiddenException);
  });

  it('returns the derived quantity per variant id', async () => {
    inventory.currentQuantity.mockImplementation(async (_t: string, id: string) =>
      id === 'v1' ? 40 : 0,
    );
    await expect(service.stock(buyer, ['v1', 'v2'])).resolves.toEqual({ v1: 40, v2: 0 });
  });

  it('reports null for made-to-order variants instead of zero', async () => {
    const res = await service.stock(buyer, ['mto']);
    expect(res).toEqual({ mto: null });
    // A made-to-order variant has no shelf stock to read.
    expect(inventory.currentQuantity).not.toHaveBeenCalled();
  });

  it('reports null for an unknown variant id', async () => {
    catalogue.findVariantsByIds.mockResolvedValue(new Map());
    await expect(service.stock(buyer, ['ghost'])).resolves.toEqual({ ghost: null });
  });

  it('returns an empty map for an empty request', async () => {
    await expect(service.stock(buyer, [])).resolves.toEqual({});
    expect(catalogue.findVariantsByIds).not.toHaveBeenCalled();
  });

  it('de-duplicates repeated ids', async () => {
    await service.stock(buyer, ['v1', 'v1', 'v1']);
    expect(catalogue.findVariantsByIds).toHaveBeenCalledWith(['v1']);
  });

  it('asks the ledger for VARIANT item type', async () => {
    await service.stock(buyer, ['v1']);
    expect(inventory.currentQuantity).toHaveBeenCalledWith('variant', 'v1');
  });

  it('exposes quantities only, never ledger metadata', async () => {
    const res = await service.stock(buyer, ['v1']);
    for (const value of Object.values(res)) {
      expect(value === null || typeof value === 'number').toBe(true);
    }
    // Keys are variant ids; nothing else may ride along. No digest, no
    // movement count, no hash head.
    expect(Object.keys(res)).toEqual(['v1']);
    expect(Object.keys(res.v1 ? {} : {})).toHaveLength(0);
  });
});
