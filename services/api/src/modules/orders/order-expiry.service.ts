import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Order, OrderStatus, PaymentStatus } from './entities/order.entity';
import { OrderStatusEvent } from './entities/order-status-event.entity';

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
 * AWAITING_PAYMENT and UNPAID, and it writes no inventory movements: nothing
 * was ever reserved for an unpaid order, so there is nothing to give back. A
 * paid order is never eligible, whatever its age.
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
      await this.orderRepo.save(order);
      await this.eventRepo.save(
        this.eventRepo.create({
          order,
          status: OrderStatus.CANCELLED,
          note: `Expired: no payment within ${hours}h`,
        }),
      );
    }
    this.logger.log(`Expired ${stale.length} unpaid order(s) older than ${hours}h`);
    return stale.length;
  }
}
