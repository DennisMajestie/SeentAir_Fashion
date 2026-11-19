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
import { BatchScanEvent } from './entities/batch-scan-event.entity';
import { ProductionCost } from './entities/production-cost.entity';
import { ProductionTelemetry } from './entities/production-telemetry.entity';
import { QCDisposition, QCRejection } from './entities/qc-rejection.entity';
import { ProductionService } from './production.service';

const STAGES = [
  'Production Planned',
  'Cutting',
  'Sewing',
  'Finishing',
  'Quality Control',
  'Completed',
];

describe('ProductionService', () => {
  let service: ProductionService;
  let batch: Record<string, unknown>;
  let rejectionSum: string | null;

  const batchRepo = {
    findOne: jest.fn(async () => ({ ...batch })),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    findAndCount: jest.fn(async () => [[], 0]),
    createQueryBuilder: jest.fn(() => wipQb),
  };
  const wipQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => wipStageRows),
  };
  let wipStageRows: Array<{ stage: string; batches: string; units: string }> = [];
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
  const scanRepo = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    find: jest.fn(async () => []),
  };
  const telemetryRepo = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    find: jest.fn(async () => []),
  };
  const approvalsService = { assertApproved: jest.fn() };
  const inventoryService = { record: jest.fn() };
  const catalogueService = { findVariantById: jest.fn(async () => ({ id: 'v1' })) };
  let wipMaterialRows: Array<{
    material_id: string;
    material_name: string;
    unit: string;
    quantity: string;
  }> = [];
  const dataSourceQuery = jest.fn<Promise<Array<Record<string, string>>>, [string, ...unknown[]]>(
    async () => wipMaterialRows,
  );
  const dataSource = {
    transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
      fn({
        getRepository: (entity: unknown) =>
          entity === QCRejection ? rejectionRepo : batchRepo,
        query: jest.fn(async (sql: string) =>
          sql.includes('variant_id') ? [{ variant_id: 'v1' }] : [{ count: '1' }],
        ),
      }),
    ),
    query: dataSourceQuery,
  };
  // planning() replaces this implementation per test; everything else reads
  // whatever the current WIP material rows hold.
  beforeEach(() => {
    dataSourceQuery.mockImplementation(async () => wipMaterialRows);
  });
  const config = {
    get: jest.fn((key: string) => (key === 'production.stages' ? STAGES : undefined)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    rejectionSum = '0';
    wipStageRows = [];
    wipMaterialRows = [];
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
        { provide: getRepositoryToken(BatchScanEvent), useValue: scanRepo },
        { provide: getRepositoryToken(ProductionTelemetry), useValue: telemetryRepo },
        { provide: ApprovalsService, useValue: approvalsService },
        { provide: InventoryService, useValue: inventoryService },
        { provide: CatalogueService, useValue: catalogueService },
        { provide: ConfigService, useValue: config },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(ProductionService);
  });

  it('summarizes WIP per stage, excluding completed and cancelled runs', async () => {
    wipStageRows = [
      { stage: 'Production Planned', batches: '2', units: '120' },
      { stage: 'Cutting', batches: '1', units: '40' },
      { stage: 'Sewing', batches: '3', units: '95' },
    ];
    wipMaterialRows = [
      { material_id: 'm1', material_name: 'Ankara cotton', unit: 'yards', quantity: '30' },
      { material_id: 'm2', material_name: 'Thread', unit: 'rolls', quantity: '12' },
    ];

    const wip = await service.wip();

    expect(wip.stages).toEqual([
      { stage: 'Production Planned', batches: 2, units: 120 },
      { stage: 'Cutting', batches: 1, units: 40 },
      { stage: 'Sewing', batches: 3, units: 95 },
    ]);
    expect(wip.totalUnits).toBe(255);
    expect(wip.activeBatches).toBe(6);
    expect(wip.materials).toEqual([
      { materialId: 'm1', materialName: 'Ankara cotton', unit: 'yards', quantity: 30 },
      { materialId: 'm2', materialName: 'Thread', unit: 'rolls', quantity: 12 },
    ]);
  });

  it('omits stages with nothing in them and never counts the completion stage', async () => {
    wipStageRows = [{ stage: 'Quality Control', batches: '1', units: '10' }];

    const wip = await service.wip();

    // 'Completed' is the last configured stage and cannot hold WIP.
    expect(wip.stages).toEqual([{ stage: 'Quality Control', batches: 1, units: 10 }]);
    expect(wip.totalUnits).toBe(10);
    expect(wip.activeBatches).toBe(1);
    expect(wip.materials).toEqual([]);
  });

  it('plans batches from paid sales and open orders minus stock and WIP', async () => {
    dataSourceQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('payment_status')) {
        return sql.includes('make_interval')
          ? [
              { variant_id: 'v1', sku: 'TEE-BLK-M', product_name: 'Black Tee', sold: '50' },
              { variant_id: 'v2', sku: 'TEE-WHT-M', product_name: 'White Tee', sold: '10' },
            ]
          : [
              { variant_id: 'v1', open_units: '12' },
              { variant_id: 'v2', open_units: '0' },
            ];
      }
      if (sql.includes('production_batches')) {
        return [{ variant_id: 'v1', units: '30' }];
      }
      if (sql.includes('inventory_movements')) {
        return [
          { item_id: 'v1', units: '8' },
          { item_id: 'v2', units: '40' },
        ];
      }
      return [];
    });

    const plan = await service.planning();

    expect(plan.windowDays).toBe(30);
    expect(plan.variants).toEqual([
      {
        variantId: 'v1',
        sku: 'TEE-BLK-M',
        productName: 'Black Tee',
        soldLastWindow: 50,
        openOrderUnits: 12,
        stockOnHand: 8,
        inProduction: 30,
        suggested: 24,
      },
      {
        variantId: 'v2',
        sku: 'TEE-WHT-M',
        productName: 'White Tee',
        soldLastWindow: 10,
        openOrderUnits: 0,
        stockOnHand: 40,
        inProduction: 0,
        suggested: 0,
      },
    ]);
  });

  it('drops variants with no demand from the plan', async () => {
    dataSourceQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('payment_status')) {
        return sql.includes('make_interval')
          ? [{ variant_id: 'v2', sku: 'TEE-WHT-M', product_name: 'White Tee', sold: '0' }]
          : [{ variant_id: 'v2', open_units: '0' }];
      }
      return [];
    });

    const plan = await service.planning();
    expect(plan.variants).toEqual([]);
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

  it('marks production cost components confirmed only when explicitly recorded', async () => {
    costRepo.findOne
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async () => costRepo.save.mock.calls[0][0]);

    await service.recordCost('b1', { materialCost: 0, sewingCost: 12 });
    const firstSavedCost = costRepo.save.mock.calls[0][0];
    expect(firstSavedCost.confirmedComponents).toEqual(['materialCost', 'sewingCost']);

    await service.recordCost('b1', { brandingCost: 4, packagingCost: 2 });
    const secondSavedCost = costRepo.save.mock.calls[1][0];
    expect(secondSavedCost.confirmedComponents).toEqual([
      'materialCost',
      'sewingCost',
      'brandingCost',
      'packagingCost',
    ]);
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

  it('locks the batch row without joining its eager variant relation', async () => {
    await service.updateStage('b1', 'Completed', 'u1');
    expect(batchRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b1' },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      }),
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
