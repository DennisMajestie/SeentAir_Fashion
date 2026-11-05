import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountingService } from '../accounting/accounting.service';
import { ApprovalRequest } from '../approvals/approval-request.entity';
import { InventoryItemType, InventoryMovement } from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { RawMaterial } from '../materials/entities/raw-material.entity';
import { MaterialsService } from '../materials/materials.service';
import { ProductVariant } from '../catalogue/entities/product-variant.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { ProductionBatch } from '../production/entities/production-batch.entity';
import { ProductionCost } from '../production/entities/production-cost.entity';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService inventory valuation', () => {
  let service: AnalyticsService;

  const orderRepo = { createQueryBuilder: jest.fn() };
  const orderItemRepo = {};
  const batchRepo = { find: jest.fn(), createQueryBuilder: jest.fn() };
  const productionCostRepo = { find: jest.fn() };
  const variantRepo = { find: jest.fn() };
  const approvalRepo = { count: jest.fn() };
  const materialRepo = {};
  const movementRepo = {
    find: jest.fn(),
    query: jest.fn(),
  };
  const accountingService = { report: jest.fn() };
  const inventoryService = { summary: jest.fn() };
  const materialsService = { lowStock: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepo },
        { provide: getRepositoryToken(ProductionBatch), useValue: batchRepo },
        { provide: getRepositoryToken(ProductionCost), useValue: productionCostRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: variantRepo },
        { provide: getRepositoryToken(ApprovalRequest), useValue: approvalRepo },
        { provide: getRepositoryToken(RawMaterial), useValue: materialRepo },
        { provide: getRepositoryToken(InventoryMovement), useValue: movementRepo },
        { provide: AccountingService, useValue: accountingService },
        { provide: InventoryService, useValue: inventoryService },
        { provide: MaterialsService, useValue: materialsService },
      ],
    }).compile();
    service = moduleRef.get(AnalyticsService);
  });

  it('returns paid sales totals for the current month alongside the daily dashboard totals', async () => {
    const paidOrderStats = jest.spyOn(service as any, 'paidOrderStats');
    paidOrderStats
      .mockResolvedValueOnce({ orders: 2, revenue: 150 })
      .mockResolvedValueOnce({ orders: 9, revenue: 1250 });
    jest.spyOn(service as any, 'groupPaidOrdersBy').mockResolvedValue([]);
    jest.spyOn(service as any, 'pendingApprovalsTrend').mockResolvedValue([]);
    jest.spyOn(service as any, 'lowStockTrend').mockResolvedValue([]);
    accountingService.report.mockResolvedValue({});
    approvalRepo.count.mockResolvedValue(0);
    materialsService.lowStock.mockResolvedValue([]);
    inventoryService.summary.mockResolvedValue([]);
    batchRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    });
    orderRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    });

    const result = await service.dashboard();

    expect(result.salesToday).toEqual({ orders: 2, revenue: 150 });
    expect(result.salesMonthToDate).toEqual({ orders: 9, revenue: 1250 });
    expect(paidOrderStats).toHaveBeenCalledTimes(2);
    expect((paidOrderStats.mock.calls[1][0] as Date).getDate()).toBe(1);
    expect(paidOrderStats.mock.calls[1][1]).toBeInstanceOf(Date);
  });

  it('values current stock using the latest completed batch cost for each SKU', async () => {
    const earlier = {
      id: 'batch-old',
      completedDate: new Date('2026-01-01T00:00:00Z'),
      variant: { id: 'variant-1' },
    } as ProductionBatch;
    const latest = {
      id: 'batch-new',
      completedDate: new Date('2026-02-01T00:00:00Z'),
      variant: { id: 'variant-1' },
    } as ProductionBatch;
    batchRepo.find.mockResolvedValue([earlier, latest]);
    productionCostRepo.find.mockResolvedValue([
      {
        batch: { id: earlier.id },
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        confirmedComponents: ['materialCost', 'sewingCost', 'brandingCost', 'packagingCost'],
        materialCost: 20,
        sewingCost: 20,
        brandingCost: 10,
        packagingCost: 0,
      },
      {
        batch: { id: latest.id },
        updatedAt: new Date('2026-02-02T00:00:00Z'),
        confirmedComponents: ['materialCost', 'sewingCost', 'brandingCost', 'packagingCost'],
        materialCost: 20,
        sewingCost: 12,
        brandingCost: 4,
        packagingCost: 0,
      },
    ]);
    movementRepo.find.mockResolvedValue([
      { referenceId: earlier.id, quantityDelta: 10 },
      { referenceId: latest.id, quantityDelta: 4 },
    ]);
    inventoryService.summary.mockResolvedValue([
      { itemType: InventoryItemType.VARIANT, itemId: 'variant-1', currentQuantity: 5 },
      { itemType: InventoryItemType.MATERIAL, itemId: 'material-1', currentQuantity: 100 },
    ]);

    await expect(service.inventoryValuation()).resolves.toEqual({
      finishedGoodsUnits: 5,
      stockedVariantCount: 1,
      totalValue: 45,
      unvaluedUnits: 0,
      unvaluedVariantCount: 0,
      method: 'latest-recorded-completed-batch-cost',
    });
  });

  it('does not present a partial total when a stocked SKU has no recorded cost', async () => {
    const batch = {
      id: 'batch-1',
      completedDate: new Date('2026-02-01T00:00:00Z'),
      variant: { id: 'variant-priced' },
    } as ProductionBatch;
    batchRepo.find.mockResolvedValue([batch]);
    productionCostRepo.find.mockResolvedValue([
      {
        batch: { id: batch.id },
        updatedAt: new Date('2026-02-02T00:00:00Z'),
        confirmedComponents: ['materialCost', 'sewingCost', 'brandingCost', 'packagingCost'],
        materialCost: 25,
        sewingCost: 15,
        brandingCost: 10,
        packagingCost: 0,
      },
    ]);
    movementRepo.find.mockResolvedValue([{ referenceId: batch.id, quantityDelta: 10 }]);
    inventoryService.summary.mockResolvedValue([
      { itemType: InventoryItemType.VARIANT, itemId: 'variant-priced', currentQuantity: 2 },
      { itemType: InventoryItemType.VARIANT, itemId: 'variant-unpriced', currentQuantity: 3 },
    ]);

    await expect(service.inventoryValuation()).resolves.toEqual({
      finishedGoodsUnits: 5,
      stockedVariantCount: 2,
      totalValue: null,
      unvaluedUnits: 3,
      unvaluedVariantCount: 1,
      method: 'latest-recorded-completed-batch-cost',
    });
  });

  it('returns a zero value when there is no finished-goods stock', async () => {
    batchRepo.find.mockResolvedValue([]);
    inventoryService.summary.mockResolvedValue([
      { itemType: InventoryItemType.VARIANT, itemId: 'variant-1', currentQuantity: 0 },
      { itemType: InventoryItemType.MATERIAL, itemId: 'material-1', currentQuantity: 100 },
    ]);

    await expect(service.inventoryValuation()).resolves.toEqual({
      finishedGoodsUnits: 0,
      stockedVariantCount: 0,
      totalValue: 0,
      unvaluedUnits: 0,
      unvaluedVariantCount: 0,
      method: 'latest-recorded-completed-batch-cost',
    });
    expect(batchRepo.find).not.toHaveBeenCalled();
    expect(productionCostRepo.find).not.toHaveBeenCalled();
    expect(movementRepo.find).not.toHaveBeenCalled();
  });

  it('counts catalogue variants with no ledger entries as zero-stock alerts', async () => {
    variantRepo.find.mockResolvedValue([
      { id: 'variant-zero', sku: 'ZERO-1', product: { name: 'Zero stock product' } },
      { id: 'variant-low', sku: 'LOW-1', product: { name: 'Low stock product' } },
      { id: 'variant-ok', sku: 'OK-1', product: { name: 'Healthy product' } },
    ]);
    inventoryService.summary.mockResolvedValue([
      { itemType: InventoryItemType.VARIANT, itemId: 'variant-low', currentQuantity: 4 },
      { itemType: InventoryItemType.VARIANT, itemId: 'variant-ok', currentQuantity: 20 },
    ]);
    materialsService.lowStock.mockResolvedValue([]);

    await expect(service.lowStock(10)).resolves.toEqual({
      materials: [],
      variants: [
        {
          variantId: 'variant-zero',
          sku: 'ZERO-1',
          productName: 'Zero stock product',
          currentQuantity: 0,
          reorderThreshold: 10,
        },
        {
          variantId: 'variant-low',
          sku: 'LOW-1',
          productName: 'Low stock product',
          currentQuantity: 4,
          reorderThreshold: 10,
        },
      ],
      variantThreshold: 10,
    });
  });

  it('does not value costs with unconfirmed components as complete', async () => {
    const batch = {
      id: 'batch-incomplete',
      completedDate: new Date('2026-02-01T00:00:00Z'),
      variant: { id: 'variant-1' },
    } as ProductionBatch;
    batchRepo.find.mockResolvedValue([batch]);
    productionCostRepo.find.mockResolvedValue([
      {
        batch: { id: batch.id },
        updatedAt: new Date('2026-02-02T00:00:00Z'),
        confirmedComponents: ['materialCost', 'sewingCost'],
        materialCost: 25,
        sewingCost: 15,
        brandingCost: 0,
        packagingCost: 0,
      },
    ]);
    movementRepo.find.mockResolvedValue([{ referenceId: batch.id, quantityDelta: 10 }]);
    inventoryService.summary.mockResolvedValue([
      { itemType: InventoryItemType.VARIANT, itemId: 'variant-1', currentQuantity: 2 },
    ]);

    await expect(service.inventoryValuation()).resolves.toEqual({
      finishedGoodsUnits: 2,
      stockedVariantCount: 1,
      totalValue: null,
      unvaluedUnits: 2,
      unvaluedVariantCount: 1,
      method: 'latest-recorded-completed-batch-cost',
    });
  });

  it('does not fall back to an older cost when the latest batch cost is incomplete', async () => {
    const earlier = {
      id: 'batch-old',
      completedDate: new Date('2026-01-01T00:00:00Z'),
      variant: { id: 'variant-1' },
    } as ProductionBatch;
    const latest = {
      id: 'batch-new',
      completedDate: new Date('2026-02-01T00:00:00Z'),
      variant: { id: 'variant-1' },
    } as ProductionBatch;
    batchRepo.find.mockResolvedValue([earlier, latest]);
    productionCostRepo.find.mockResolvedValue([
      {
        batch: { id: earlier.id },
        confirmedComponents: ['materialCost', 'sewingCost', 'brandingCost', 'packagingCost'],
        materialCost: 20,
        sewingCost: 10,
        brandingCost: 5,
        packagingCost: 0,
      },
      {
        batch: { id: latest.id },
        confirmedComponents: ['materialCost', 'sewingCost'],
        materialCost: 25,
        sewingCost: 12,
        brandingCost: 0,
        packagingCost: 0,
      },
    ]);
    movementRepo.find.mockResolvedValue([
      { referenceId: earlier.id, quantityDelta: 10 },
      { referenceId: latest.id, quantityDelta: 8 },
    ]);
    inventoryService.summary.mockResolvedValue([
      { itemType: InventoryItemType.VARIANT, itemId: 'variant-1', currentQuantity: 3 },
    ]);

    await expect(service.inventoryValuation()).resolves.toEqual({
      finishedGoodsUnits: 3,
      stockedVariantCount: 1,
      totalValue: null,
      unvaluedUnits: 3,
      unvaluedVariantCount: 1,
      method: 'latest-recorded-completed-batch-cost',
    });
  });

  it('returns 12 monthly ledger buckets with recorded at-cost valuations', async () => {
    const months = Array.from({ length: 12 }, (_, index) => {
      const monthDate = new Date(Date.UTC(2025, 11 + index, 1));
      return {
        bucketStart: monthDate.toISOString().slice(0, 10),
        label: monthDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
        itemId: 'variant-1',
        stockIn: index === 0 ? '12' : index === 11 ? '4' : '0',
        stockOut: index === 0 ? '5' : index === 11 ? '2' : '0',
        unitsOnHand: index === 0 ? '107' : index === 11 ? '109' : '107',
      };
    });
    const batch = {
      id: 'batch-priced',
      completedDate: new Date('2025-01-01T00:00:00.000Z'),
      variant: { id: 'variant-1' },
    } as ProductionBatch;
    batchRepo.find.mockResolvedValue([batch]);
    productionCostRepo.find.mockResolvedValue([{
      batch,
      updatedAt: new Date('2025-02-01T00:00:00.000Z'),
      confirmedComponents: ['materialCost', 'sewingCost', 'brandingCost', 'packagingCost'],
      materialCost: 20,
      sewingCost: 15,
      brandingCost: 10,
      packagingCost: 5,
    }]);
    movementRepo.find.mockResolvedValue([
      { referenceId: batch.id, quantityDelta: 10 },
    ]);
    movementRepo.query.mockResolvedValue(months);

    const trend = await service.inventoryMovementTrend();
    expect(trend).toHaveLength(12);
    expect(trend[0]).toEqual({
      label: 'Dec',
      stockIn: 12,
      stockOut: 5,
      unitsOnHand: 107,
      stockInValue: 60,
      stockOutValue: 25,
      stockValue: 535,
    });
    expect(trend[11]).toEqual({
      label: 'Nov',
      stockIn: 4,
      stockOut: 2,
      unitsOnHand: 109,
      stockInValue: 20,
      stockOutValue: 10,
      stockValue: 545,
    });
    expect(trend.slice(1, 11).every((month) =>
      month.stockIn === 0 &&
      month.stockOut === 0 &&
      month.unitsOnHand === 107 &&
      month.stockInValue === 0 &&
      month.stockOutValue === 0 &&
      month.stockValue === 535,
    )).toBe(true);
    expect(movementRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('opening_stock'),
      [InventoryItemType.VARIANT],
    );
  });

  it('returns zero stock values for monthly buckets when the ledger has no movement data', async () => {
    movementRepo.query.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        bucketStart: new Date(Date.UTC(2025, 11 + index, 1)).toISOString().slice(0, 10),
        label: String(index),
        itemId: null,
        stockIn: 0,
        stockOut: 0,
        unitsOnHand: 0,
      })),
    );

    const trend = await service.inventoryMovementTrend();
    expect(trend).toHaveLength(12);
    expect(trend.every((month) =>
      month.stockIn === 0 &&
      month.stockOut === 0 &&
      month.unitsOnHand === 0 &&
      month.stockInValue === 0 &&
      month.stockOutValue === 0 &&
      month.stockValue === 0,
    )).toBe(true);
  });

  it('returns weekly buckets aligned to Sunday for the chart reference', async () => {
    movementRepo.query.mockResolvedValue([
      {
        bucketStart: '2026-10-11',
        label: 'Oct 11',
        itemId: null,
        stockIn: 0,
        stockOut: 0,
        unitsOnHand: 0,
      },
    ]);

    await expect(service.inventoryMovementTrend('weekly')).resolves.toEqual([
      {
        label: 'Oct 11',
        stockIn: 0,
        stockOut: 0,
        unitsOnHand: 0,
        stockInValue: 0,
        stockOutValue: 0,
        stockValue: 0,
      },
    ]);
    expect(movementRepo.query).toHaveBeenCalledWith(
      expect.stringContaining("INTERVAL '1 week'"),
      [InventoryItemType.VARIANT],
    );
    expect(movementRepo.query.mock.calls.at(-1)?.[0]).toContain("date_trunc('week'");
  });

  it('rejects unsupported inventory movement periods', async () => {
    await expect(service.inventoryMovementTrend('daily')).rejects.toThrow(
      'Period must be weekly, monthly, or quarterly.',
    );
    expect(movementRepo.query).not.toHaveBeenCalled();
  });

  it('marks historical value unavailable when stock has no complete recorded cost', async () => {
    movementRepo.query.mockResolvedValue([
      {
        bucketStart: '2025-12-01',
        label: 'Dec',
        itemId: 'variant-unpriced',
        stockIn: '3',
        stockOut: '0',
        unitsOnHand: '3',
      },
    ]);
    batchRepo.find.mockResolvedValue([]);

    const [month] = await service.inventoryMovementTrend();
    expect(month).toEqual({
      label: 'Dec',
      stockIn: 3,
      stockOut: 0,
      unitsOnHand: 3,
      stockInValue: null,
      stockOutValue: 0,
      stockValue: null,
    });
  });

});
