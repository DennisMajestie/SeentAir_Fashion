import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalsModule } from '../approvals/approvals.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { InventoryModule } from '../inventory/inventory.module';
import { Order } from '../orders/entities/order.entity';
import { Payment } from '../orders/entities/payment.entity';
import { UsersModule } from '../users/users.module';
import { PriceTier } from './entities/price-tier.entity';
import { WholesaleAccount } from './entities/wholesale-account.entity';
import { WholesaleController } from './wholesale.controller';
import { WholesaleService } from './wholesale.service';

@Module({
  imports: [
    // Order/Payment are read here (invoices) — writes stay in OrdersModule.
    TypeOrmModule.forFeature([WholesaleAccount, PriceTier, Order, Payment]),
    UsersModule,
    CatalogueModule,
    ApprovalsModule,
    // Read-only use: derived stock for the availability endpoint. Importing
    // the module grants no HTTP access — WHOLESALER still has no INVENTORY
    // permission, so /inventory/* stays staff-only to buyers.
    InventoryModule,
  ],
  controllers: [WholesaleController],
  providers: [WholesaleService],
  exports: [WholesaleService], // OrdersService gates wholesale orders through this
})
export class WholesaleModule {}
