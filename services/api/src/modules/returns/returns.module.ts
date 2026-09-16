import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryModule } from '../inventory/inventory.module';
import { OrderStatusEvent } from '../orders/entities/order-status-event.entity';
import { Order } from '../orders/entities/order.entity';
import { UsersModule } from '../users/users.module';
import { ReturnRequest } from './return-request.entity';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReturnRequest, Order, OrderStatusEvent]),
    InventoryModule,
    UsersModule,
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
