import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { ApprovalStatus } from '../../common/enums';
import { AccountingService } from '../accounting/accounting.service';
import { ApprovalRequest } from '../approvals/approval-request.entity';
import { InventoryItemType } from '../inventory/inventory-movement.entity';
import { InventoryMovement, MovementType } from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { RawMaterial } from '../materials/entities/raw-material.entity';
import { MaterialsService } from '../materials/materials.service';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order, OrderStatus, PaymentStatus } from '../orders/entities/order.entity';
import { ProductVariant } from '../catalogue/entities/product-variant.entity';
import { ProductionBatch } from '../production/entities/production-batch.entity';
import {
  PRODUCTION_COST_COMPONENTS,
  ProductionCost,
} from '../production/entities/production-cost.entity';

const RANGE_STATUSES = [
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.ORDER_RECEIVED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.RETURNED,
];

/** "Open" = still moving towards delivery; AWAITING_PAYMENT is internal but open. */
const OPEN_STATUSES = new Set<string>([
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.ORDER_RECEIVED,
  OrderStatus.PROCESSING,
]);

interface RangeWindow {
  curStart: Date;
  curEnd: Date;
  priorStart: Date;
  priorEnd: Date;
  grain: 'hour' | 'day';
}

const inWindow = (when: Date, start: Date, end: Date): boolean => {
  const t = new Date(when).getTime();
  return !Number.isNaN(t) && t >= start.getTime() && t < end.getTime();
};

/**
 * Aggregation layer over existing entities (appendix 16) — no new core
 * entities. Answers the owner's one-glance question: sales today,
 * profit/loss, low stock, production status, pending approvals.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(ProductionCost)
    private readonly productionCostRepo: Repository<ProductionCost>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(ApprovalRequest)
    private readonly approvalRepo: Repository<ApprovalRequest>,
    @InjectRepository(RawMaterial) private readonly materialRepo: Repository<RawMaterial>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    private readonly accountingService: AccountingService,
    private readonly inventoryService: InventoryService,
    private readonly materialsService: MaterialsService,
  ) {}

  async dashboard(range: 'today' | '7d' | '30d' | 'custom' = 'today', from?: string, to?: string) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const monthStart = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);
    const bounds = this.windowBounds(range, from, to);

    const [
      salesToday,
      salesMonthToDate,
      profitReport,
      salesByChannel,
      salesBySource,
      productionByStage,
      pendingApprovals,
      lowStockMaterials,
      inventorySummary,
      approvalsTrend,
      lowStockTrend,
    ] = await Promise.all([
      this.paidOrderStats(startOfDay, now),
      this.paidOrderStats(monthStart, now),
      this.accountingService.report('profit'),
      this.groupPaidOrdersBy('channel'),
      this.groupPaidOrdersBy('source'),
      this.batchRepo
        .createQueryBuilder('b')
        .select('b.stage', 'stage')
        .addSelect('COUNT(*)', 'count')
        .groupBy('b.stage')
        .getRawMany(),
      this.approvalRepo.count({ where: { status: ApprovalStatus.PENDING } }),
      this.materialsService.lowStock(),
      this.inventoryService.summary(),
      this.pendingApprovalsTrend(bounds),
      this.lowStockTrend(bounds),
    ]);

    const finishedGoodsUnits = inventorySummary
      .filter((i) => i.itemType === InventoryItemType.VARIANT)
      .reduce((sum, i) => sum + i.currentQuantity, 0);
    const stockedVariantCount = inventorySummary.filter(
      (i) => i.itemType === InventoryItemType.VARIANT && i.currentQuantity > 0,
    ).length;

    const rows: Array<{
      created_at: Date;
      status: string;
      payment_status: string;
      total_amount: string | number;
    }> = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.created_at', 'created_at')
      .addSelect('o.status', 'status')
      .addSelect('o.payment_status', 'payment_status')
      .addSelect('o.total_amount', 'total_amount')
      .where('o.created_at >= :from', { from: bounds.priorStart })
      .andWhere('o.created_at < :to', { to: bounds.curEnd })
      .getRawMany();

    const cur = this.bucketize(rows, bounds.curStart, bounds.curEnd, bounds.grain);
    const prior = this.bucketize(rows, bounds.priorStart, bounds.priorEnd, bounds.grain);
    const revenue = cur.reduce((s, b) => s + b.revenue, 0);
    const priorRevenue = prior.reduce((s, b) => s + b.revenue, 0);
    const openOrders = rows.filter(
      (r) => OPEN_STATUSES.has(r.status) && inWindow(r.created_at, bounds.curStart, bounds.curEnd),
    ).length;
    const priorOpenOrders = rows.filter(
      (r) =>
        OPEN_STATUSES.has(r.status) && inWindow(r.created_at, bounds.priorStart, bounds.priorEnd),
    ).length;
    const statusBreakdown = RANGE_STATUSES.map((s) => ({
      status: s,
      count: rows.filter(
        (r) => r.status === s && inWindow(r.created_at, bounds.curStart, bounds.curEnd),
      ).length,
    }));

    return {
      salesToday,
      salesMonthToDate,
      profitLoss: profitReport,
      salesByChannel,
      marketingSourcePerformance: salesBySource,
      production: productionByStage.map((r: { stage: string; count: string }) => ({
        stage: r.stage,
        batches: parseInt(r.count, 10),
      })),
      inventory: {
        finishedGoodsUnits,
        stockedVariantCount,
        lowStockMaterialCount: lowStockMaterials.length,
        lowStockMaterials: lowStockMaterials.map((m) => ({
          id: m.id,
          name: m.name,
          currentQuantity: m.currentQuantity,
          reorderThreshold: m.reorderThreshold,
        })),
      },
      pendingApprovals,
      range: { key: range, from: bounds.curStart.toISOString(), to: bounds.curEnd.toISOString() },
      metrics: { revenue, priorRevenue, openOrders, priorOpenOrders },
      series: cur,
      statusBreakdown,
      trends: { approvals: approvalsTrend, lowStock: lowStockTrend },
    };
  }

  /** Top (or bottom) selling variants by units across paid orders. */
  async sellers(limit = 10, direction: 'best' | 'slow' = 'best') {
    const rows: Array<{
      variant_id: string;
      sku: string;
      product_name: string;
      units: string;
      revenue: string;
    }> = await this.orderItemRepo
      .createQueryBuilder('item')
      .innerJoin('item.order', 'o', 'o.payment_status = :paid', { paid: PaymentStatus.PAID })
      .innerJoin('item.variant', 'v')
      .innerJoin('v.product', 'p')
      .select('v.id', 'variant_id')
      .addSelect('v.sku', 'sku')
      .addSelect('p.name', 'product_name')
      .addSelect('SUM(item.quantity)', 'units')
      .addSelect('SUM(item.quantity * item.unit_price)', 'revenue')
      .groupBy('v.id')
      .addGroupBy('v.sku')
      .addGroupBy('p.name')
      .orderBy('units', direction === 'best' ? 'DESC' : 'ASC')
      .limit(limit)
      .getRawMany();
    return rows.map((r) => ({
      variantId: r.variant_id,
      sku: r.sku,
      productName: r.product_name,
      unitsSold: parseInt(r.units, 10),
      revenue: parseFloat(r.revenue) || 0,
    }));
  }

  /** Low stock across materials (per-material threshold) and every catalogue variant. */
  async lowStock(variantThreshold = 10) {
    const [materials, variants, summary] = await Promise.all([
      this.materialsService.lowStock(),
      this.variantRepo.find({ relations: { product: true } }),
      this.inventoryService.summary(),
    ]);
    const quantityByVariant = new Map(
      summary
        .filter((item) => item.itemType === InventoryItemType.VARIANT)
        .map((item) => [item.itemId, item.currentQuantity]),
    );
    const lowVariants = variants
      .map((variant) => ({
        variantId: variant.id,
        sku: variant.sku,
        productName: variant.product.name,
        currentQuantity: quantityByVariant.get(variant.id) ?? 0,
      }))
      .filter((variant) => variant.currentQuantity <= variantThreshold);
    return {
      materials,
      variants: lowVariants.map((variant) => ({
        ...variant,
        reorderThreshold: variantThreshold,
      })),
      variantThreshold,
    };
  }

  /** Finished-goods movements and recorded cost valuations for the last 12 buckets. */
  async inventoryMovementTrend(period = 'monthly') {
    const periodConfig = {
      weekly: { unit: 'week', interval: '1 week', dateFormat: 'Mon FMDD' },
      monthly: { unit: 'month', interval: '1 month', dateFormat: 'Mon' },
      quarterly: { unit: 'quarter', interval: '3 months', dateFormat: '"Q"Q YYYY' },
    } as const;
    if (!Object.prototype.hasOwnProperty.call(periodConfig, period)) {
      throw new BadRequestException('Period must be weekly, monthly, or quarterly.');
    }
    const config = periodConfig[period as keyof typeof periodConfig];
    const bucketAt = (value: string) =>
      config.unit === 'week'
        ? `(date_trunc('week', ${value} + INTERVAL '1 day') - INTERVAL '1 day')`
        : `date_trunc('${config.unit}', ${value})`;

    const rows: Array<{
      bucketStart: string;
      label: string;
      itemId: string | null;
      stockIn: string | null;
      stockOut: string | null;
      unitsOnHand: string | null;
    }> = await this.movementRepo.query(`
      WITH buckets AS (
        SELECT generate_series(
          ${bucketAt("NOW() AT TIME ZONE 'UTC'")} - INTERVAL '${config.interval}' * 11,
          ${bucketAt("NOW() AT TIME ZONE 'UTC'")},
          INTERVAL '${config.interval}'
        ) AS bucket
      ),
      items AS (
        SELECT DISTINCT item_id
        FROM inventory_movements
        WHERE item_type = $1
      ),
      bucket_items AS (
        SELECT buckets.bucket, items.item_id
        FROM buckets
        CROSS JOIN items
      ),
      opening_stock AS (
        SELECT item_id, SUM(quantity_delta) AS quantity
        FROM inventory_movements
        WHERE item_type = $1
          AND timestamp < (SELECT MIN(bucket) FROM buckets) AT TIME ZONE 'UTC'
        GROUP BY item_id
      ),
      bucket_movements AS (
        SELECT
          item_id,
          ${bucketAt("timestamp AT TIME ZONE 'UTC'")} AS bucket,
          SUM(CASE WHEN quantity_delta > 0 THEN quantity_delta ELSE 0 END) AS stock_in,
          SUM(CASE WHEN quantity_delta < 0 THEN -quantity_delta ELSE 0 END) AS stock_out,
          SUM(quantity_delta) AS net_change
        FROM inventory_movements
        WHERE item_type = $1
          AND timestamp >= (SELECT MIN(bucket) FROM buckets) AT TIME ZONE 'UTC'
          AND timestamp < (
            ${bucketAt("NOW() AT TIME ZONE 'UTC'")} + INTERVAL '${config.interval}'
          ) AT TIME ZONE 'UTC'
        GROUP BY 1, 2
      ),
      item_buckets AS (
        SELECT
          bucket_items.bucket,
          bucket_items.item_id,
          COALESCE(bucket_movements.stock_in, 0)::int AS stock_in,
          COALESCE(bucket_movements.stock_out, 0)::int AS stock_out,
          (
            COALESCE(opening_stock.quantity, 0) +
            SUM(COALESCE(bucket_movements.net_change, 0)) OVER (
              PARTITION BY bucket_items.item_id ORDER BY bucket_items.bucket
            )
          )::int AS units_on_hand
        FROM bucket_items
        LEFT JOIN opening_stock USING (item_id)
        LEFT JOIN bucket_movements
          ON bucket_movements.item_id = bucket_items.item_id
          AND bucket_movements.bucket = bucket_items.bucket
      )
      SELECT
        TO_CHAR(buckets.bucket, 'YYYY-MM-DD') AS "bucketStart",
        TO_CHAR(buckets.bucket, '${config.dateFormat}') AS label,
        item_buckets.item_id AS "itemId",
        COALESCE(item_buckets.stock_in, 0)::int AS "stockIn",
        COALESCE(item_buckets.stock_out, 0)::int AS "stockOut",
        COALESCE(item_buckets.units_on_hand, 0)::int AS "unitsOnHand"
      FROM buckets
      LEFT JOIN item_buckets ON item_buckets.bucket = buckets.bucket
      ORDER BY buckets.bucket
    `, [InventoryItemType.VARIANT]);

    const buckets = new Map<string, {
      label: string;
      stockIn: number;
      stockOut: number;
      unitsOnHand: number;
      items: Array<{ itemId: string; stockIn: number; stockOut: number; unitsOnHand: number }>;
    }>();
    for (const row of rows) {
      const bucket = buckets.get(row.bucketStart) ?? {
        label: row.label.trim(),
        stockIn: 0,
        stockOut: 0,
        unitsOnHand: 0,
        items: [],
      };
      if (row.itemId) {
        const item = {
          itemId: row.itemId,
          stockIn: Number(row.stockIn) || 0,
          stockOut: Number(row.stockOut) || 0,
          unitsOnHand: Number(row.unitsOnHand) || 0,
        };
        bucket.items.push(item);
        bucket.stockIn += item.stockIn;
        bucket.stockOut += item.stockOut;
        bucket.unitsOnHand += item.unitsOnHand;
      }
      buckets.set(row.bucketStart, bucket);
    }

    const itemIds = [...new Set([...buckets.values()].flatMap((bucket) => bucket.items.map((item) => item.itemId)))];
    const completedBatches = itemIds.length
      ? await this.batchRepo.find({
          where: { completedDate: Not(IsNull()), variant: { id: In(itemIds) } },
          relations: { variant: true },
        })
      : [];
    const batchIds = completedBatches.map((batch) => batch.id);
    const [costs, productionMovements] = batchIds.length
      ? await Promise.all([
          this.productionCostRepo.find({
            where: { batch: { id: In(batchIds) } },
            relations: { batch: { variant: true } },
          }),
          this.movementRepo.find({
            where: {
              itemType: InventoryItemType.VARIANT,
              movementType: MovementType.PRODUCTION,
              referenceId: In(batchIds),
            },
          }),
        ])
      : [[], []];
    const costByBatch = new Map(costs.map((cost) => [cost.batch.id, cost]));
    const producedQuantityByBatch = new Map<string, number>();
    for (const movement of productionMovements) {
      if (!movement.referenceId) continue;
      producedQuantityByBatch.set(
        movement.referenceId,
        (producedQuantityByBatch.get(movement.referenceId) ?? 0) + movement.quantityDelta,
      );
    }
    const batchesByVariant = new Map<string, ProductionBatch[]>();
    for (const batch of completedBatches) {
      const variantBatches = batchesByVariant.get(batch.variant.id) ?? [];
      variantBatches.push(batch);
      batchesByVariant.set(batch.variant.id, variantBatches);
    }
    for (const variantBatches of batchesByVariant.values()) {
      variantBatches.sort(
        (a, b) => new Date(a.completedDate!).getTime() - new Date(b.completedDate!).getTime(),
      );
    }

    return [...buckets.entries()].map(([bucketStart, bucket]) => {
      const [year, monthNumber, day] = bucketStart.slice(0, 10).split('-').map(Number);
      const bucketEnd = new Date(Date.UTC(year, monthNumber - 1, day));
      if (config.unit === 'week') bucketEnd.setUTCDate(bucketEnd.getUTCDate() + 7);
      else if (config.unit === 'month') bucketEnd.setUTCMonth(bucketEnd.getUTCMonth() + 1);
      else bucketEnd.setUTCMonth(bucketEnd.getUTCMonth() + 3);
      const bucketEndTime = bucketEnd.getTime();
      const unitCostByVariant = new Map<string, number | null>();
      const unitCostFor = (variantId: string): number | null => {
        if (unitCostByVariant.has(variantId)) return unitCostByVariant.get(variantId)!;
        const latestBatch = [...(batchesByVariant.get(variantId) ?? [])]
          .reverse()
          .find((batch) => new Date(batch.completedDate!).getTime() < bucketEndTime);
        const cost = latestBatch ? costByBatch.get(latestBatch.id) : undefined;
        const producedQuantity = latestBatch
          ? producedQuantityByBatch.get(latestBatch.id) ?? 0
          : 0;
        if (
          !latestBatch ||
          !cost ||
          new Date(cost.updatedAt).getTime() >= bucketEndTime ||
          producedQuantity <= 0 ||
          !PRODUCTION_COST_COMPONENTS.every((component) => cost.confirmedComponents?.includes(component))
        ) {
          unitCostByVariant.set(variantId, null);
          return null;
        }
        const unitCost =
          (Number(cost.materialCost) +
            Number(cost.sewingCost) +
            Number(cost.brandingCost) +
            Number(cost.packagingCost)) /
          producedQuantity;
        unitCostByVariant.set(variantId, unitCost);
        return unitCost;
      };

      let stockValue = 0;
      let stockInValue = 0;
      let stockOutValue = 0;
      let stockValueComplete = true;
      let stockInValueComplete = true;
      let stockOutValueComplete = true;
      for (const item of bucket.items) {
        const unitCost = unitCostFor(item.itemId);
        if (item.unitsOnHand !== 0) {
          if (unitCost === null) stockValueComplete = false;
          else stockValue += item.unitsOnHand * unitCost;
        }
        if (item.stockIn > 0) {
          if (unitCost === null) stockInValueComplete = false;
          else stockInValue += item.stockIn * unitCost;
        }
        if (item.stockOut > 0) {
          if (unitCost === null) stockOutValueComplete = false;
          else stockOutValue += item.stockOut * unitCost;
        }
      }

      return {
        label: bucket.label,
        stockIn: bucket.stockIn,
        stockOut: bucket.stockOut,
        unitsOnHand: bucket.unitsOnHand,
        stockInValue: stockInValueComplete ? Math.round(stockInValue * 100) / 100 : null,
        stockOutValue: stockOutValueComplete ? Math.round(stockOutValue * 100) / 100 : null,
        stockValue: stockValueComplete ? Math.round(stockValue * 100) / 100 : null,
      };
    });
  }

  /** Values finished goods using the latest completed batch cost recorded for each SKU. */
  async inventoryValuation() {
    const inventorySummary = await this.inventoryService.summary();
    const variantStock = new Map(
      inventorySummary
        .filter((item) => item.itemType === InventoryItemType.VARIANT && item.currentQuantity > 0)
        .map((item) => [item.itemId, item.currentQuantity]),
    );
    const finishedGoodsUnits = [...variantStock.values()].reduce(
      (total, quantity) => total + quantity,
      0,
    );
    const stockedVariantCount = variantStock.size;
    if (stockedVariantCount === 0) {
      return {
        finishedGoodsUnits: 0,
        stockedVariantCount: 0,
        totalValue: 0,
        unvaluedUnits: 0,
        unvaluedVariantCount: 0,
        method: 'latest-recorded-completed-batch-cost',
      };
    }

    const completedBatches = await this.batchRepo.find({
      where: {
        completedDate: Not(IsNull()),
        variant: { id: In([...variantStock.keys()]) },
      },
      relations: { variant: true },
    });
    const batchIds = completedBatches.map((batch) => batch.id);

    if (batchIds.length === 0) {
      return {
        finishedGoodsUnits,
        stockedVariantCount,
        totalValue: null,
        unvaluedUnits: finishedGoodsUnits,
        unvaluedVariantCount: stockedVariantCount,
        method: 'latest-recorded-completed-batch-cost',
      };
    }

    const [costs, productionMovements] = await Promise.all([
      this.productionCostRepo.find({
        where: { batch: { id: In(batchIds) } },
        relations: { batch: { variant: true } },
      }),
      this.movementRepo.find({
        where: {
          itemType: InventoryItemType.VARIANT,
          movementType: MovementType.PRODUCTION,
          referenceId: In(batchIds),
        },
      }),
    ]);

    const producedQuantityByBatch = new Map<string, number>();
    for (const movement of productionMovements) {
      if (!movement.referenceId) continue;
      producedQuantityByBatch.set(
        movement.referenceId,
        (producedQuantityByBatch.get(movement.referenceId) ?? 0) + movement.quantityDelta,
      );
    }

    const costByBatch = new Map(costs.map((cost) => [cost.batch.id, cost]));
    const latestBatchByVariant = new Map<string, ProductionBatch>();
    for (const batch of completedBatches) {
      const previous = latestBatchByVariant.get(batch.variant.id);
      if (
        !previous ||
        new Date(batch.completedDate!).getTime() > new Date(previous.completedDate!).getTime()
      ) {
        latestBatchByVariant.set(batch.variant.id, batch);
      }
    }

    let totalValue = 0;
    let unvaluedUnits = 0;
    let unvaluedVariantCount = 0;
    for (const [variantId, quantity] of variantStock) {
      const batch = latestBatchByVariant.get(variantId);
      const cost = batch ? costByBatch.get(batch.id) : undefined;
      const producedQuantity = batch ? producedQuantityByBatch.get(batch.id) ?? 0 : 0;
      if (
        !batch ||
        !cost ||
        producedQuantity <= 0 ||
        !PRODUCTION_COST_COMPONENTS.every((component) => cost.confirmedComponents?.includes(component))
      ) {
        unvaluedUnits += quantity;
        unvaluedVariantCount += 1;
        continue;
      }
      const unitCost =
        (Number(cost.materialCost) +
          Number(cost.sewingCost) +
          Number(cost.brandingCost) +
          Number(cost.packagingCost)) /
        producedQuantity;
      totalValue += quantity * unitCost;
    }

    return {
      finishedGoodsUnits,
      stockedVariantCount,
      totalValue: unvaluedUnits === 0 ? Math.round(totalValue * 100) / 100 : null,
      unvaluedUnits,
      unvaluedVariantCount,
      method: 'latest-recorded-completed-batch-cost',
    };
  }

  /**
   * Approval backlog over the window: at each bucket end, how many of the
   * REQUESTS CURRENTLY PENDING were raised by then. Exact, non-fabricated —
   * a request decided mid-window has left the current backlog and is not
   * carried backwards.
   */
  private async pendingApprovalsTrend(bounds: RangeWindow): Promise<number[]> {
    const rows: Array<{ created_at: Date }> = await this.approvalRepo
      .createQueryBuilder('a')
      .select('a.created_at', 'created_at')
      .where('a.status = :status', { status: ApprovalStatus.PENDING })
      .getRawMany();
    const created = rows
      .map((r) => new Date(r.created_at).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((x, y) => x - y);
    return this.stateCounts(created, bounds);
  }

  /**
   * Low-stock material count over the window, replaying the movement ledger
   * with the same rule as MaterialsService.lowStock() (derived quantity <=
   * reorder threshold). Materials created after a bucket end are never counted.
   */
  private async lowStockTrend(bounds: RangeWindow): Promise<number[]> {
    const materials = await this.materialRepo.find();
    const thresholds = new Map(materials.map((m) => [m.id, m.reorderThreshold]));
    const created = new Map(materials.map((m) => [m.id, m.createdAt.getTime()]));
    const rows: Array<{ item_id: string; quantity_delta: string | null; timestamp: Date }> =
      await this.movementRepo
        .createQueryBuilder('m')
        .select('m.item_id', 'item_id')
        .addSelect('m.quantity_delta', 'quantity_delta')
        .addSelect('m.timestamp', 'timestamp')
        .where('m.item_type = :type', { type: InventoryItemType.MATERIAL })
        .orderBy('m.timestamp', 'ASC')
        .getRawMany();
    const step = bounds.grain === 'hour' ? 3_600_000 : 86_400_000;
    const slots = Math.max(
      1,
      Math.floor((bounds.curEnd.getTime() - bounds.curStart.getTime()) / step) + 1,
    );
    const sums = new Map<string, number>();
    let ptr = 0;
    // Seed cumulative quantities with every movement before the window start.
    while (
      ptr < rows.length &&
      new Date(rows[ptr].timestamp).getTime() < bounds.curStart.getTime()
    ) {
      sums.set(
        rows[ptr].item_id,
        (sums.get(rows[ptr].item_id) ?? 0) + (Number(rows[ptr].quantity_delta) || 0),
      );
      ptr += 1;
    }
    const out: number[] = [];
    for (let i = 0; i < slots; i++) {
      const edge = Math.min(bounds.curStart.getTime() + (i + 1) * step, bounds.curEnd.getTime());
      while (ptr < rows.length && new Date(rows[ptr].timestamp).getTime() < edge) {
        sums.set(
          rows[ptr].item_id,
          (sums.get(rows[ptr].item_id) ?? 0) + (Number(rows[ptr].quantity_delta) || 0),
        );
        ptr += 1;
      }
      let count = 0;
      for (const m of materials) {
        if ((created.get(m.id) ?? 0) > edge) continue;
        if ((sums.get(m.id) ?? 0) <= (thresholds.get(m.id) ?? 0)) count += 1;
      }
      out.push(count);
    }
    return out;
  }

  /** Cumulative count of time-ordered events at each aligned bucket end. */
  private stateCounts(eventsAsc: number[], bounds: RangeWindow): number[] {
    const step = bounds.grain === 'hour' ? 3_600_000 : 86_400_000;
    const slots = Math.max(
      1,
      Math.floor((bounds.curEnd.getTime() - bounds.curStart.getTime()) / step) + 1,
    );
    const out: number[] = [];
    let ptr = 0;
    for (let i = 0; i < slots; i++) {
      const edge = Math.min(bounds.curStart.getTime() + (i + 1) * step, bounds.curEnd.getTime());
      while (ptr < eventsAsc.length && eventsAsc[ptr] < edge) ptr += 1;
      out.push(ptr);
    }
    return out;
  }

  /** Compare-window geometry for a range request. Custom accepts from/to as
      inclusive date strings (YYYY-MM-DD); the selected "to" day is included. */
  private windowBounds(
    range: 'today' | '7d' | '30d' | 'custom',
    from?: string,
    to?: string,
  ): RangeWindow {
    const now = new Date();
    const startOfDay = (d: Date) => {
      const c = new Date(d);
      c.setHours(0, 0, 0, 0);
      return c;
    };
    if (range === 'today') {
      const curStart = startOfDay(now);
      return {
        curStart,
        curEnd: new Date(now.getTime() + 60_000),
        priorStart: new Date(curStart.getTime() - 86_400_000),
        priorEnd: curStart,
        grain: 'hour',
      };
    }
    if (range === 'custom' && from && to) {
      const f = new Date(from);
      const t0 = new Date(to);
      if (!Number.isNaN(f.getTime()) && !Number.isNaN(t0.getTime()) && t0.getTime() > f.getTime()) {
        const t = new Date(t0.getTime() + 86_400_000);
        const span = t.getTime() - f.getTime();
        return {
          curStart: f,
          curEnd: t,
          priorStart: new Date(f.getTime() - span),
          priorEnd: f,
          grain: span <= 3 * 86_400_000 ? 'hour' : 'day',
        };
      }
    }
    const days = range === '30d' ? 30 : 7;
    const curStart = new Date(startOfDay(now).getTime() - (days - 1) * 86_400_000);
    return {
      curStart,
      curEnd: new Date(now.getTime() + 60_000),
      priorStart: new Date(curStart.getTime() - days * 86_400_000),
      priorEnd: curStart,
      grain: 'day',
    };
  }

  private bucketize(
    rows: Array<{
      created_at: Date;
      status: string;
      payment_status: string;
      total_amount: string | number;
    }>,
    start: Date,
    end: Date,
    grain: 'hour' | 'day',
  ) {
    const step = grain === 'hour' ? 3_600_000 : 86_400_000;
    const slots = Math.max(1, Math.floor((end.getTime() - start.getTime()) / step) + 1);
    const buckets: Array<{ label: string; revenue: number; orders: number }> = [];
    for (let i = 0; i < slots; i++) {
      buckets.push({
        label: this.bucketLabel(new Date(start.getTime() + i * step), grain),
        revenue: 0,
        orders: 0,
      });
    }
    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      if (Number.isNaN(t) || t < start.getTime() || t >= end.getTime()) continue;
      const i = Math.min(slots - 1, Math.max(0, Math.floor((t - start.getTime()) / step)));
      buckets[i].orders += 1;
      if (r.payment_status === PaymentStatus.PAID)
        buckets[i].revenue += Number(r.total_amount) || 0;
    }
    return buckets;
  }

  private bucketLabel(d: Date, grain: 'hour' | 'day'): string {
    if (grain === 'hour') {
      return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(d);
    }
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  private async paidOrderStats(since: Date, until = new Date()) {
    const row: { count: string; revenue: string | null } | undefined = await this.orderRepo
      .createQueryBuilder('o')
      .select('COUNT(*)', 'count')
      .addSelect('SUM(o.total_amount)', 'revenue')
      .where('o.payment_status = :paid AND o.created_at >= :since AND o.created_at < :until', {
        paid: PaymentStatus.PAID,
        since,
        until,
      })
      .getRawOne();
    return {
      orders: parseInt(row?.count ?? '0', 10),
      revenue: parseFloat(row?.revenue ?? '0') || 0,
    };
  }

  private async groupPaidOrdersBy(column: 'channel' | 'source') {
    const rows: Array<{ key: string | null; count: string; revenue: string }> = await this.orderRepo
      .createQueryBuilder('o')
      .select(`o.${column}`, 'key')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(o.total_amount)', 'revenue')
      .where('o.payment_status = :paid', { paid: PaymentStatus.PAID })
      .groupBy(`o.${column}`)
      .getRawMany();
    return rows.map((r) => ({
      [column]: r.key ?? 'unattributed',
      orders: parseInt(r.count, 10),
      revenue: parseFloat(r.revenue) || 0,
    }));
  }
}
