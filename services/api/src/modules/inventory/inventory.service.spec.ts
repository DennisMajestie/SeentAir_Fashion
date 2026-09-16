import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  InventoryItemType,
  InventoryMovement,
  MovementType,
} from './inventory-movement.entity';
import { InventoryService } from './inventory.service';

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
    createQueryBuilder: jest.fn(() => queryBuilder),
    findAndCount: jest.fn(async () => [[], 0]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    currentSum = '0';
    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(InventoryMovement), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(InventoryService);
  });

  it('rejects a zero delta (a movement must move something)', async () => {
    await expect(
      service.record({
        itemType: InventoryItemType.VARIANT,
        itemId: 'v1',
        movementType: MovementType.ADJUSTMENT,
        quantityDelta: 0,
        actorId: 'u1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects a removal that would take stock below zero', async () => {
    currentSum = '5';
    await expect(
      service.record({
        itemType: InventoryItemType.VARIANT,
        itemId: 'v1',
        movementType: MovementType.SALE,
        quantityDelta: -6,
        actorId: 'u1',
      }),
    ).rejects.toThrow('Insufficient stock');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('accepts a removal covered by current stock', async () => {
    currentSum = '10';
    const movement = await service.record({
      itemType: InventoryItemType.VARIANT,
      itemId: 'v1',
      movementType: MovementType.SALE,
      quantityDelta: -10,
      actorId: 'u1',
    });
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
});
