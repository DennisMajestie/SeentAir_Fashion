import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalsModule } from '../approvals/approvals.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductionBatch } from './entities/production-batch.entity';
import { ProductionCost } from './entities/production-cost.entity';
import { QCRejection } from './entities/qc-rejection.entity';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductionBatch, ProductionCost, QCRejection]),
    ApprovalsModule,
    CatalogueModule,
    InventoryModule,
  ],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
