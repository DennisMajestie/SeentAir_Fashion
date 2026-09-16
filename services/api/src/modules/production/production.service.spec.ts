import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { ApprovalActionType } from '../../common/enums';
import { ApprovalsService } from '../approvals/approvals.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { InventoryItemType, MovementType } from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { ProductionBatch } from './entities/production-batch.entity';
import { ProductionCost } from './entities/production-cost.entity';
import { QCDisposition, QCRejection } from './entities/qc-rejection.entity';
import { ProductionService } from './production.service';

const STAGES = ['Production Planned', 'Cutting', 'Sewing', 'Finishing', 'Quality Control', 'Completed'];

describe('ProductionService', () => {
  let service: ProductionService;
  let batch: Record<string, unknown>;
  let rejectionSum: string | null;

  const batchRepo = {
    findOne: jest.fn(async () => ({ ...batch })),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    findAndCount: jest.fn(async () => [[], 0]),
  };
  const rejectionQb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(async () => ({ sum: rejectionSum })),
  };
  const rejectionRepo = {
    createQueryBuilder: jest.fn(() => rejectionQb),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    find: jest.fn(async () => []),
  };
  const costRepo = { findOne: jest.fn(), create: jest.fn((v) => v), save: jest.fn(async (v) => v) };
  const approvalsService = { assertApproved: jest.fn() };
  const inventoryService = { record: jest.fn() };
  const catalogueService = { findVariantById: jest.fn(async () => ({ id: 'v1' })) };
  const dataSource = {
    transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
      fn({ getRepository: () => batchRepo }),
    ),
  };
  const config = {
    get: jest.fn((key: string) => (key === 'production.stages' ? STAGES : undefined)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    rejectionSum = '0';
    batch = {
      id: 'b1',
      quantity: 100,
      stage: 'Quality Control',
      completedDate: null,
      variant: { id: 'v1' },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductionService,
        { provide: getRepositoryToken(ProductionBatch), useValue: batchRepo },
        { provide: getRepositoryToken(ProductionCost), useValue: costRepo },
        { provide: getRepositoryToken(QCRejection), useValue: rejectionRepo },
        { provide: ApprovalsService, useValue: approvalsService },
        { provide: InventoryService, useValue: inventoryService },
        { provide: CatalogueService, useValue: catalogueService },
        { provide: ConfigService, useValue: config },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(ProductionService);
  });

  it('refuses to create a batch without an approved PRODUCTION_START request', async () => {
    approvalsService.assertApproved.mockRejectedValue(new ForbiddenException('not approved'));
    await expect(
      service.create({ variantId: 'v1', quantity: 100, approvalRequestId: 'r1' }, 'u1'),
    ).rejects.toThrow(ForbiddenException);
    expect(batchRepo.save).not.toHaveBeenCalled();
  });

  it('creates an approved batch in the first configured stage', async () => {
    approvalsService.assertApproved.mockResolvedValue(undefined);
    await service.create({ variantId: 'v1', quantity: 100, approvalRequestId: 'r1' }, 'u1');
    expect(approvalsService.assertApproved).toHaveBeenCalledWith(
      'r1',
      ApprovalActionType.PRODUCTION_START,
    );
    expect(batchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'Production Planned' }),
    );
  });

  it('rejects an unknown stage name', async () => {
    await expect(service.updateStage('b1', 'Ironing', 'u1')).rejects.toThrow(BadRequestException);
  });

  it('completion stocks finished goods = quantity minus burned rejects', async () => {
    rejectionSum = '8'; // 8 burned
    await service.updateStage('b1', 'Completed', 'u1');
    expect(inventoryService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: InventoryItemType.VARIANT,
        itemId: 'v1',
        movementType: MovementType.PRODUCTION,
        quantityDelta: 92,
      }),
      expect.anything(),
    );
  });

  it('a completed batch cannot change stage again (no double stock-in)', async () => {
    batch.completedDate = new Date();
    await expect(service.updateStage('b1', 'Cutting', 'u1')).rejects.toThrow(ConflictException);
    await expect(service.updateStage('b1', 'Completed', 'u1')).rejects.toThrow(ConflictException);
    expect(inventoryService.record).not.toHaveBeenCalled();
  });

  it('blocks QC rejections after completion', async () => {
    batch.completedDate = new Date();
    await expect(
      service.recordQCRejection(
        'b1',
        { reason: 'stitching', disposition: QCDisposition.BURNED },
        'u1',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('blocks rejections exceeding the batch quantity', async () => {
    rejectionSum = '95';
    await expect(
      service.recordQCRejection(
        'b1',
        { quantity: 10, reason: 'fabric flaw', disposition: QCDisposition.BURNED },
        'u1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires a reason and records disposition for reporting', async () => {
    rejectionSum = '0';
    const rejection = await service.recordQCRejection(
      'b1',
      { quantity: 3, reason: 'loose hem', disposition: QCDisposition.REPAIRED_RESTOCKED },
      'u1',
    );
    expect(rejection).toEqual(
      expect.objectContaining({
        quantity: 3,
        reason: 'loose hem',
        disposition: QCDisposition.REPAIRED_RESTOCKED,
      }),
    );
  });
});
