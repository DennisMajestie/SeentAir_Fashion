import { NotFoundException } from '@nestjs/common';
import { WishlistService } from './wishlist.service';

/**
 * The merge is the part that can lose a shopper's data, so it is tested hardest:
 * a sign-in must never drop what was saved, must never duplicate it, and must
 * never fail outright because one id is stale.
 */
const uuid = (n: string): string => `${n.repeat(8)}-0000-0000-0000-000000000000`;

function harness(
  knownProductIds: string[],
  existingProductIds: string[] = [],
  deleteOnly = false,
) {
  const insert = jest.fn(async (..._args: unknown[]) => undefined);
  const deleteQb = {
    delete: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(async () => ({ affected: 1 })),
  };
  const productQb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => knownProductIds.map((id) => ({ id }))),
  };
  const productRepo = {
    findOne: jest.fn(async () => (knownProductIds.length ? { id: knownProductIds[0] } : null)),
    createQueryBuilder: jest.fn(() => productQb),
  };
  const itemQb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => existingProductIds.map((product_id) => ({ product_id }))),
    getOne: jest.fn(async () => null),
  };
  const itemRepo = {
    find: jest.fn(async () => []),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: unknown) => v),
    insert,
    createQueryBuilder: jest.fn(() => (deleteOnly ? deleteQb : itemQb)),
  };
  const service = new WishlistService(itemRepo as never, productRepo as never);
  return { service, itemRepo, productRepo, deleteQb, productQb };
}

describe('WishlistService.add', () => {
  it('saves a product the shopper can see', async () => {
    const { service, itemRepo } = harness([uuid('a')]);
    await service.add('u1', uuid('a'));
    expect(itemRepo.save).toHaveBeenCalledTimes(1);
  });

  it('refuses a product that does not exist, rather than saving a dead link', async () => {
    const { service } = harness([]);
    await expect(service.add('u1', uuid('a'))).rejects.toThrow(NotFoundException);
  });

  it('treats a repeat tap as the same save instead of erroring', async () => {
    const { service, itemRepo } = harness([uuid('a')]);
    const qb = itemRepo.createQueryBuilder() as unknown as { getOne: jest.Mock };
    qb.getOne.mockResolvedValue({ id: 'existing' });
    const out = await service.add('u1', uuid('a'));
    expect(out).toEqual({ id: 'existing' });
    expect(itemRepo.save).not.toHaveBeenCalled();
  });
});

describe('WishlistService.remove', () => {
  it('scopes the delete to the caller so one customer cannot clear another', async () => {
    const { service, deleteQb } = harness([], [], true);
    await service.remove('u1', uuid('a'));
    expect(deleteQb.where).toHaveBeenCalledWith('user_id = :userId', { userId: 'u1' });
    expect(deleteQb.andWhere).toHaveBeenCalledWith('product_id = :productId', { productId: uuid('a') });
  });
});

describe('WishlistService.merge', () => {
  it('folds a guest list into the account on sign-in', async () => {
    const { service, itemRepo } = harness([uuid('a'), uuid('b')]);

    const out = await service.merge('u1', [uuid('a'), uuid('b')]);

    expect(out.merged).toBe(2);
    expect(itemRepo.insert).toHaveBeenCalledTimes(1);
    expect(itemRepo.insert.mock.calls[0][0]).toHaveLength(2);
  });

  it('never duplicates a product already saved to the account', async () => {
    const { service, itemRepo } = harness([uuid('a'), uuid('b')], [uuid('a')]);

    const out = await service.merge('u1', [uuid('a'), uuid('b')]);

    expect(out.merged).toBe(1);
    expect(itemRepo.insert.mock.calls[0][0]).toEqual([{ user: { id: 'u1' }, product: { id: uuid('b') } }]);
  });

  it('collapses a list that repeats the same product locally', async () => {
    const { service, itemRepo } = harness([uuid('a')]);

    const out = await service.merge('u1', [uuid('a'), uuid('a'), uuid('a')]);

    expect(out.merged).toBe(1);
  });

  it('skips products that no longer exist instead of failing the sign-in', async () => {
    // A deleted product must not take the whole merge -- and the sign-in -- down.
    const { service, itemRepo } = harness([uuid('a')]);

    const out = await service.merge('u1', [uuid('a'), uuid('z')]);

    expect(out.merged).toBe(1);
    expect(itemRepo.insert.mock.calls[0][0]).toEqual([
      { user: { id: 'u1' }, product: { id: uuid('a') } },
    ]);
  });

  it('drops ids that are not uuids rather than building an invalid query', async () => {
    const { service, itemRepo, productQb } = harness([uuid('a')]);

    await service.merge('u1', ["'; DROP TABLE wishlist_items; --", uuid('a')]);

    const where = (productQb.where as jest.Mock).mock.calls[0][1] as { ids: string[] };
    expect(where.ids).toEqual([uuid('a')]);
    expect(itemRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('aliases the selected columns so the rows are keyed as the code expects', async () => {
    // A bare select() leaves Postgres naming the column itself, so the returned
    // row is not keyed `id` and every lookup silently matches nothing -- which
    // made merge() report zero merged on a real database while its unit test
    // passed against a stub.
    const { service, productQb } = harness([uuid('a')]);
    await service.merge('u1', [uuid('a')]);
    expect(productQb.select).toHaveBeenCalledWith('product.id', 'id');
  });

  it('does nothing for an empty guest list', async () => {
    const { service, itemRepo } = harness([]);
    expect(await service.merge('u1', [])).toEqual({ merged: 0 });
    expect(itemRepo.insert).not.toHaveBeenCalled();
  });

  it('does nothing when every guest product is already saved', async () => {
    const { service, itemRepo } = harness([uuid('a')], [uuid('a')]);
    expect(await service.merge('u1', [uuid('a')])).toEqual({ merged: 0 });
    expect(itemRepo.insert).not.toHaveBeenCalled();
  });
});