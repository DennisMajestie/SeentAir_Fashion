import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../accounting/accounting.module';
import { ApprovalRequest } from '../approvals/approval-request.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { MaterialsModule } from '../materials/materials.module';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { ProductionBatch } from '../production/entities/production-batch.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, ProductionBatch, ApprovalRequest]),
    AccountingModule,
    InventoryModule,
    MaterialsModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
