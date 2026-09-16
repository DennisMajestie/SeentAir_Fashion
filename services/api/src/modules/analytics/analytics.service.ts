import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalStatus } from '../../common/enums';
import { AccountingService } from '../accounting/accounting.service';
import { ApprovalRequest } from '../approvals/approval-request.entity';
import { InventoryItemType } from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { MaterialsService } from '../materials/materials.service';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order, PaymentStatus } from '../orders/entities/order.entity';
import { ProductionBatch } from '../production/entities/production-batch.entity';

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
    @InjectRepository(ApprovalRequest)
    private readonly approvalRepo: Repository<ApprovalRequest>,
    private readonly accountingService: AccountingService,
    private readonly inventoryService: InventoryService,
    private readonly materialsService: MaterialsService,
  ) {}

  async dashboard() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      salesToday,
      profitReport,
      salesByChannel,
      salesBySource,
      productionByStage,
      pendingApprovals,
      lowStockMaterials,
      inventorySummary,
    ] = await Promise.all([
      this.paidOrderStats(startOfDay),
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
    ]);

    const finishedGoodsUnits = inventorySummary
      .filter((i) => i.itemType === InventoryItemType.VARIANT)
      .reduce((sum, i) => sum + i.currentQuantity, 0);

    return {
      salesToday,
      profitLoss: profitReport,
      salesByChannel,
      marketingSourcePerformance: salesBySource,
      production: productionByStage.map((r: { stage: string; count: string }) => ({
        stage: r.stage,
        batches: parseInt(r.count, 10),
      })),
      inventory: {
        finishedGoodsUnits,
        lowStockMaterialCount: lowStockMaterials.length,
        lowStockMaterials: lowStockMaterials.map((m) => ({
          id: m.id,
          name: m.name,
          currentQuantity: m.currentQuantity,
          reorderThreshold: m.reorderThreshold,
        })),
      },
      pendingApprovals,
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

  /** Low stock across materials (per-material threshold) and variants (global threshold). */
  async lowStock(variantThreshold = 10) {
    const materials = await this.materialsService.lowStock();
    const summary = await this.inventoryService.summary();
    const lowVariants = summary.filter(
      (i) => i.itemType === InventoryItemType.VARIANT && i.currentQuantity <= variantThreshold,
    );
    return {
      materials,
      variants: lowVariants.map((v) => ({
        variantId: v.itemId,
        currentQuantity: v.currentQuantity,
      })),
      variantThreshold,
    };
  }

  private async paidOrderStats(since: Date) {
    const row: { count: string; revenue: string | null } | undefined = await this.orderRepo
      .createQueryBuilder('o')
      .select('COUNT(*)', 'count')
      .addSelect('SUM(o.total_amount)', 'revenue')
      .where('o.payment_status = :paid AND o.created_at >= :since', {
        paid: PaymentStatus.PAID,
        since,
      })
      .getRawOne();
    return {
      orders: parseInt(row?.count ?? '0', 10),
      revenue: parseFloat(row?.revenue ?? '0') || 0,
    };
  }

  private async groupPaidOrdersBy(column: 'channel' | 'source') {
    const rows: Array<{ key: string | null; count: string; revenue: string }> =
      await this.orderRepo
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
