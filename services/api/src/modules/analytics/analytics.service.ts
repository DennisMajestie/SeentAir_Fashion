import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalStatus } from '../../common/enums';
import { AccountingService } from '../accounting/accounting.service';
import { ApprovalRequest } from '../approvals/approval-request.entity';
import { InventoryItemType } from '../inventory/inventory-movement.entity';
import { InventoryMovement } from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { RawMaterial } from '../materials/entities/raw-material.entity';
import { MaterialsService } from '../materials/materials.service';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order, OrderStatus, PaymentStatus } from '../orders/entities/order.entity';
import { ProductionBatch } from '../production/entities/production-batch.entity';

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
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const bounds = this.windowBounds(range, from, to);

    const [
      salesToday,
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
      this.pendingApprovalsTrend(bounds),
      this.lowStockTrend(bounds),
    ]);

    const finishedGoodsUnits = inventorySummary
      .filter((i) => i.itemType === InventoryItemType.VARIANT)
      .reduce((sum, i) => sum + i.currentQuantity, 0);

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
      (r) => OPEN_STATUSES.has(r.status) && inWindow(r.created_at, bounds.priorStart, bounds.priorEnd),
    ).length;
    const statusBreakdown = RANGE_STATUSES.map((s) => ({
      status: s,
      count: rows.filter((r) => r.status === s && inWindow(r.created_at, bounds.curStart, bounds.curEnd)).length,
    }));

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
    const slots = Math.max(1, Math.floor((bounds.curEnd.getTime() - bounds.curStart.getTime()) / step) + 1);
    const sums = new Map<string, number>();
    let ptr = 0;
    // Seed cumulative quantities with every movement before the window start.
    while (ptr < rows.length && new Date(rows[ptr].timestamp).getTime() < bounds.curStart.getTime()) {
      sums.set(rows[ptr].item_id, (sums.get(rows[ptr].item_id) ?? 0) + (Number(rows[ptr].quantity_delta) || 0));
      ptr += 1;
    }
    const out: number[] = [];
    for (let i = 0; i < slots; i++) {
      const edge = Math.min(bounds.curStart.getTime() + (i + 1) * step, bounds.curEnd.getTime());
      while (ptr < rows.length && new Date(rows[ptr].timestamp).getTime() < edge) {
        sums.set(rows[ptr].item_id, (sums.get(rows[ptr].item_id) ?? 0) + (Number(rows[ptr].quantity_delta) || 0));
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
    const slots = Math.max(1, Math.floor((bounds.curEnd.getTime() - bounds.curStart.getTime()) / step) + 1);
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
  private windowBounds(range: 'today' | '7d' | '30d' | 'custom', from?: string, to?: string): RangeWindow {
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
    rows: Array<{ created_at: Date; status: string; payment_status: string; total_amount: string | number }>,
    start: Date,
    end: Date,
    grain: 'hour' | 'day',
  ) {
    const step = grain === 'hour' ? 3_600_000 : 86_400_000;
    const slots = Math.max(1, Math.floor((end.getTime() - start.getTime()) / step) + 1);
    const buckets: Array<{ label: string; revenue: number; orders: number }> = [];
    for (let i = 0; i < slots; i++) {
      buckets.push({ label: this.bucketLabel(new Date(start.getTime() + i * step), grain), revenue: 0, orders: 0 });
    }
    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      if (Number.isNaN(t) || t < start.getTime() || t >= end.getTime()) continue;
      const i = Math.min(slots - 1, Math.max(0, Math.floor((t - start.getTime()) / step)));
      buckets[i].orders += 1;
      if (r.payment_status === PaymentStatus.PAID) buckets[i].revenue += Number(r.total_amount) || 0;
    }
    return buckets;
  }

  private bucketLabel(d: Date, grain: 'hour' | 'day'): string {
    if (grain === 'hour') {
      return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(d);
    }
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
