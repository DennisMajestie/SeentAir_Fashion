import { Module } from '@nestjs/common';
import { OrderStatusBus } from './order-status.bus';

/**
 * Exists so OrdersModule and LogisticsModule share ONE OrderStatusBus instance.
 * A bus declared in both modules' `providers` would be two separate Subjects,
 * and each module's writers would push to subscribers of the other copy — a
 * bug that looks like "live updates randomly do nothing".
 */
@Module({
  providers: [OrderStatusBus],
  exports: [OrderStatusBus],
})
export class OrderStatusBusModule {}
