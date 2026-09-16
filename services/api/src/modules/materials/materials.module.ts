import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../accounting/accounting.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MaterialPurchase } from './entities/material-purchase.entity';
import { MaterialUsage } from './entities/material-usage.entity';
import { RawMaterial } from './entities/raw-material.entity';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RawMaterial, MaterialPurchase, MaterialUsage]),
    InventoryModule,
    ApprovalsModule,
    AccountingModule,
  ],
  controllers: [MaterialsController],
  providers: [MaterialsService],
  exports: [MaterialsService],
})
export class MaterialsModule {}
