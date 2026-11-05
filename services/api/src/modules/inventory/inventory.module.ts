import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalsModule } from '../approvals/approvals.module';
import { InventoryMovement } from './inventory-movement.entity';
import { InventoryStockCount } from './entities/inventory-stock-count.entity';
import { InventoryStockCountLine } from './entities/inventory-stock-count-line.entity';
import { InventoryController } from './inventory.controller';
import { InventoryCountsService } from './inventory-counts.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryMovement,
      InventoryStockCount,
      InventoryStockCountLine,
    ]),
    ApprovalsModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryCountsService],
  exports: [InventoryService], // materials, sales, production, returns all write through this
})
export class InventoryModule {}
