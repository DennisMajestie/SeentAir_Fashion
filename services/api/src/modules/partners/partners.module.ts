import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../accounting/accounting.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';
import { Partner } from './entities/partner.entity';
import { ProfitDistribution } from './entities/profit-distribution.entity';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Partner, ProfitDistribution]),
    UsersModule,
    AccountingModule,
    ApprovalsModule,
    InventoryModule,
  ],
  controllers: [PartnersController],
  providers: [PartnersService],
})
export class PartnersModule {}
