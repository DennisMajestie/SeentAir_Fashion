import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/entities/order.entity';
import { UsersModule } from '../users/users.module';
import { GiglAdapter } from './carriers/gigl.adapter';
import { ManualCarrierAdapter } from './carriers/manual.adapter';
import { DeliveryLeg } from './entities/delivery-leg.entity';
import { DeliveryPricing } from './entities/delivery-pricing.entity';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryLeg, DeliveryPricing, Order]), UsersModule],
  controllers: [LogisticsController],
  providers: [LogisticsService, GiglAdapter, ManualCarrierAdapter],
})
export class LogisticsModule {}
