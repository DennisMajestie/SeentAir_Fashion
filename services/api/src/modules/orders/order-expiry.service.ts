import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Order, OrderStatus, PaymentStatus } from './entities/order.entity';
import { OrderStatusEvent } from './entities/order-status-event.entity';
import { CouponsService } from '../coupons/coupons.service';

/**
 * Sweeps up orders that were started and never paid for.
 *
 * Before guest checkout this was self-limiting: creating an order needed an
 * account, so the worst case was a signed-in customer abandoning a basket. A
 * public create endpoint removes that bound, and an unpaid order is not
 * harmless — it sits in the admin's "awaiting payment" count and muddies the
 * conversion figures.
 *
 * Deliberately narrow. It only ever touches orders that are BOTH
 * AWAITING_PAYMENT and UNPAID, and it writes no inventory movements: stock is
 * allocated on payment, not on order creation, so there is nothing to give
 * back. A paid order is never eligible, whatever its age.
 *
 * A coupon IS held by an unpaid order, though, so this is also where a
 * reservation is returned. Without that the usage cap leaks one code per
 * abandoned basket and a campaign quietly runs out.
 *
 * Runs in the API rather than a queue: it is one sweep a night, and standing up
 * Redis and a BullMQ worker for it would be infrastructure without a payload.
 * Revisit when notifications or report generation actually need a queue.
 */
@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderStatusEvent)
    private readonly eventRepo: Repository<OrderStatusEvent>,
    private readonly config: ConfigService,
    private readonly coupons: CouponsService,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async expireUnpaidOrders(): Promise<number> {
    const hours = this.config.get<number>('orders.unpaidExpiryHours') ?? 24;
    const cutoff = new Date(Date.now() - hours * 3_600_000);

    const stale = await this.orderRepo.find({
      where: {
        status: OrderStatus.AWAITING_PAYMENT,
        paymentStatus: PaymentStatus.UNPAID,
        createdAt: LessThan(cutoff),
      },
      loadEagerRelations: false,
    });
    if (stale.length === 0) return 0;

    for (const order of stale) {
      order.status = OrderStatus.CANCELLED;
      // The cancellation and the release share a transaction: an order marked
      // cancelled must not leave its coupon reserved, or the shopper's next
      // checkout refuses a coupon they are still entitled to.
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(Order).save(order);
        await manager.getRepository(OrderStatusEvent).save(
          manager.getRepository(OrderStatusEvent).create({
            order,
            status: OrderStatus.CANCELLED,
            note: `Expired: no payment within ${hours}h`,
          }),
        );
        await this.coupons.release(manager, order.id);
      });
    }
    this.logger.log(`Expired ${stale.length} unpaid order(s) older than ${hours}h`);
    return stale.length;
  }
}
