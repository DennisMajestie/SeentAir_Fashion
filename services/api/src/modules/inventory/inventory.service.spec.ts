import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { InventoryItemType, InventoryMovement, MovementType } from './inventory-movement.entity';
import { InsufficientStockException, InventoryService, ledgerLockKey } from './inventory.service';

const LOCK_SQL = 'SELECT pg_advisory_xact_lock(k) FROM unnest($1::bigint[]) AS k';
const sortedKeys = (keys: bigint[]) =>
  [...keys].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)).map((k) => k.toString());

describe('InventoryService (the movement ledger)', () => {
  let service: InventoryService;
  let currentSum: string | null;

  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(async () => ({ sum: currentSum })),
    getRawMany: jest.fn(async () => []),
  };
  const repo = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: 'mv-1', ...v })),
    count: jest.fn(async () => 0),
    createQueryBuilder: jest.fn(() => queryBuilder),
    findAndCount: jest.fn(async () => [[], 0]),
    find: jest.fn(async () => []),
  };
  /** An EntityManager inside an open transaction, as dataSource.transaction() hands out. */
  const manager = {
    queryRunner: { isTransactionActive: true },
    query: jest.fn(async () => []),
    getRepository: () => repo,
  };
  const tx = manager as never;
  const dataSource = {
    query: jest.fn(async () => [{ total: '0', valid: '0', broken: '0', head_hash: null }]),
    transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) => fn(manager)),
  };

  const sale = (itemId: string, quantityDelta: number) => ({
    itemType: InventoryItemType.VARIANT,
    itemId,
    movementType: MovementType.SALE,
    quantityDelta,
    actorId: 'u1',
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    currentSum = '0';
    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(InventoryMovement), useValue: repo },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(InventoryService);
  });

  it('rejects a zero delta (a movement must move something)', async () => {
    await expect(
      service.record(
        {
          itemType: InventoryItemType.VARIANT,
          itemId: 'v1',
          movementType: MovementType.ADJUSTMENT,
          quantityDelta: 0,
          actorId: 'u1',
        },
        tx,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects a removal that would take stock below zero', async () => {
    currentSum = '5';
    await expect(service.record(sale('v1', -6), tx)).rejects.toThrow('Insufficient stock');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('the guard keeps its contract: InsufficientStockException, HTTP 400, the same message', async () => {
    currentSum = '5';
    const err: unknown = await service.record(sale('v1', -6), tx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InsufficientStockException);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getStatus()).toBe(400);
    expect((err as Error).message).toBe(
      'Insufficient stock: current quantity is 5, movement of -6 refused',
    );
  });

  it('accepts a removal covered by current stock', async () => {
    currentSum = '10';
    const movement = await service.record(sale('v1', -10), tx);
    expect(movement.quantityDelta).toBe(-10);
    expect(repo.save).toHaveBeenCalled();
  });

  it('derives current quantity as the SUM of deltas, never a stored field', async () => {
    currentSum = '42';
    const quantity = await service.currentQuantity(InventoryItemType.MATERIAL, 'm1');
    expect(quantity).toBe(42);
    expect(queryBuilder.select).toHaveBeenCalledWith('SUM(m.quantity_delta)', 'sum');
  });

  it('treats an item with no movements as zero stock', async () => {
    currentSum = null;
    const quantity = await service.currentQuantity(InventoryItemType.VARIANT, 'new-item');
    expect(quantity).toBe(0);
  });

  // ---- per-item write serialisation ----

  it('takes the per-item advisory lock inside the transaction before reading stock', async () => {
    currentSum = '3';
    await service.record(sale('v1', -1), tx);
    expect(manager.query).toHaveBeenCalledWith(LOCK_SQL, [
      [ledgerLockKey(InventoryItemType.VARIANT, 'v1').toString()],
    ]);
    const lockOrder = manager.query.mock.invocationCallOrder[0];
    const readOrder = queryBuilder.getRawOne.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(readOrder);
  });

  it('recordStandalone opens a transaction of its own so the lock has a scope', async () => {
    currentSum = '3';
    await service.recordStandalone(sale('v1', -1));
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(LOCK_SQL, expect.anything());
    expect(repo.save).toHaveBeenCalled();
  });

  it('lockItems sorts and de-duplicates keys and takes them in one statement', async () => {
    const a = { itemType: InventoryItemType.VARIANT, itemId: 'aaaa' };
    const b = { itemType: InventoryItemType.MATERIAL, itemId: 'bbbb' };
    await service.lockItems(tx, [b, a, b]);
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(LOCK_SQL, [
      sortedKeys([ledgerLockKey(a.itemType, a.itemId), ledgerLockKey(b.itemType, b.itemId)]),
    ]);
  });

  it('refuses to lock outside an active transaction rather than locking nothing', async () => {
    const plain = { queryRunner: undefined, query: jest.fn(), getRepository: () => repo };
    await expect(service.record(sale('v1', -1), plain as never)).rejects.toThrow(
      'active transaction',
    );
    expect(plain.query).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('ledgerLockKey is stable and keeps item types apart', () => {
    const id = '2f6f6e1a-0d8e-4d4d-9c0a-1c1e1b6b7a11';
    expect(ledgerLockKey(InventoryItemType.VARIANT, id)).toBe(
      ledgerLockKey(InventoryItemType.VARIANT, id),
    );
    expect(ledgerLockKey(InventoryItemType.VARIANT, id)).not.toBe(
      ledgerLockKey(InventoryItemType.MATERIAL, id),
    );
    expect(typeof ledgerLockKey(InventoryItemType.VARIANT, id)).toBe('bigint');
  });
});
