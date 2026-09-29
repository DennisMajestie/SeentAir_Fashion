import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';
import { WholesaleModule } from '../wholesale/wholesale.module';
import { AccountingModule } from '../accounting/accounting.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeliveryLeg } from '../logistics/entities/delivery-leg.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusEvent } from './entities/order-status-event.entity';
import { Order } from './entities/order.entity';
import { OrderAccessToken } from './entities/order-access-token.entity';
import { Payment } from './entities/payment.entity';
import { ProcessedWebhookEvent } from './entities/processed-webhook-event.entity';
import { OrderStatusBusModule } from './order-status.bus.module';
import { OrderExpiryService } from './order-expiry.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaystackService } from './paystack.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Payment,
      OrderStatusEvent,
      ProcessedWebhookEvent,
      OrderAccessToken,
      // Registered here (not imported from LogisticsModule) so order tracking
      // can read delivery legs without a circular module dependency.
      DeliveryLeg,
    ]),
    CatalogueModule,
    InventoryModule,
    UsersModule,
    WholesaleModule,
    AccountingModule,
    NotificationsModule,
    OrderStatusBusModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PaystackService, OrderExpiryService],
  exports: [OrdersService],
})
export class OrdersModule {}
