import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalsModule } from '../approvals/approvals.module';
import { InventoryMovement } from './inventory-movement.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryMovement]), ApprovalsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService], // materials, sales, production, returns all write through this
})
export class InventoryModule {}
