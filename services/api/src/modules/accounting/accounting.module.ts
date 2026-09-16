import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { LedgerEntry } from './ledger-entry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LedgerEntry]), ApprovalsModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService], // orders & materials write sale/purchase entries
})
export class AccountingModule {}
