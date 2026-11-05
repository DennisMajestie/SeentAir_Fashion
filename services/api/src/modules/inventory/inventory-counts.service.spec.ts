import { BadRequestException } from '@nestjs/common';
import { ApprovalActionType } from '../../common/enums';
import { EntityManager } from 'typeorm';
import { InventoryItemType } from './inventory-movement.entity';
import { InventoryCountsService } from './inventory-counts.service';
import { InventoryStockCount } from './entities/inventory-stock-count.entity';

describe('InventoryCountsService', () => {
  const countRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'count-1', ...value })),
    findAndCount: jest.fn(async () => [[], 0]),
  };
  const lineRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === InventoryStockCount ? countRepo : lineRepo,
    ),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (transactionManager: EntityManager) => Promise<unknown>) =>
      callback(manager as unknown as EntityManager),
    ),
  };
  const inventory = {
    lockItems: jest.fn(async () => undefined),
    currentQuantity: jest.fn(async () => 3),
    record: jest.fn(async (movement: Record<string, unknown>) => movement),
  };
  const approvals = { assertApproved: jest.fn(async () => undefined) };

  const createService = () =>
    new InventoryCountsService(
      countRepo as never,
      inventory as never,
      approvals as never,
      dataSource as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    inventory.currentQuantity.mockResolvedValue(3);
  });

  const item = (countedQuantity: number, approvalRequestId?: string) => ({
    itemType: InventoryItemType.VARIANT,
    itemId: 'variant-1',
    countedQuantity,
    ...(approvalRequestId ? { approvalRequestId } : {}),
  });

  it('records a positive count difference as a ledger adjustment', async () => {
    const result = await createService().record({ items: [item(5)] }, 'staff-1');

    expect(inventory.lockItems).toHaveBeenCalledWith(manager, [item(5)]);
    expect(inventory.record).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: InventoryItemType.VARIANT,
        itemId: 'variant-1',
        quantityDelta: 2,
        actorId: 'staff-1',
        referenceId: 'count-1',
      }),
      manager,
    );
    expect(result.lines[0]).toMatchObject({
      systemQuantity: 3,
      countedQuantity: 5,
      adjustmentQuantity: 2,
    });
  });

  it('persists an unchanged count without creating a zero-delta movement', async () => {
    await createService().record({ items: [item(3)] }, 'staff-1');

    expect(inventory.record).not.toHaveBeenCalled();
    expect(lineRepo.save).toHaveBeenCalled();
  });

  it('requires an approved stock-disposal request before decreasing inventory', async () => {
    await expect(createService().record({ items: [item(2)] }, 'staff-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(approvals.assertApproved).not.toHaveBeenCalled();
    expect(countRepo.save).not.toHaveBeenCalled();
    expect(inventory.record).not.toHaveBeenCalled();
  });

  it('checks the stock-disposal approval and posts an approved negative difference', async () => {
    await createService().record({ items: [item(2, 'approval-1')] }, 'staff-1');

    expect(approvals.assertApproved).toHaveBeenCalledWith(
      'approval-1',
      ApprovalActionType.STOCK_DISPOSAL,
    );
    expect(inventory.record).toHaveBeenCalledWith(
      expect.objectContaining({ quantityDelta: -1 }),
      manager,
    );
  });

  it('rejects duplicate items in the same stock count', async () => {
    await expect(
      createService().record({ items: [item(4), item(4)] }, 'staff-1'),
    ).rejects.toThrow(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
