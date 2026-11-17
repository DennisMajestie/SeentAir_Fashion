import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { LedgerEntry } from './ledger-entry.entity';
import { PayrollController } from './payroll.controller';
import { PayrollRun } from './payroll-run.entity';
import { PayrollService } from './payroll.service';

@Module({
  imports: [TypeOrmModule.forFeature([LedgerEntry, PayrollRun]), ApprovalsModule],
  controllers: [AccountingController, PayrollController],
  providers: [AccountingService, PayrollService],
  exports: [AccountingService], // orders & materials write sale/purchase entries
})
export class AccountingModule {}
