import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';
import { WholesaleModule } from '../wholesale/wholesale.module';
import { AccountingModule } from '../accounting/accounting.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusEvent } from './entities/order-status-event.entity';
import { Order } from './entities/order.entity';
import { Payment } from './entities/payment.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaystackService } from './paystack.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Payment, OrderStatusEvent]),
    CatalogueModule,
    InventoryModule,
    UsersModule,
    WholesaleModule,
    AccountingModule,
    NotificationsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PaystackService],
  exports: [OrdersService],
})
export class OrdersModule {}
