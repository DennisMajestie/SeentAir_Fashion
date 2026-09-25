import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalsModule } from '../approvals/approvals.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductionBatch } from './entities/production-batch.entity';
import { BatchScanEvent } from './entities/batch-scan-event.entity';
import { ProductionCost } from './entities/production-cost.entity';
import { ProductionTelemetry } from './entities/production-telemetry.entity';
import { QCRejection } from './entities/qc-rejection.entity';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionBatch,
      ProductionCost,
      QCRejection,
      BatchScanEvent,
      ProductionTelemetry,
    ]),
    ApprovalsModule,
    CatalogueModule,
    InventoryModule,
  ],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
