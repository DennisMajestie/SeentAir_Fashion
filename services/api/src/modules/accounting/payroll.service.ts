import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApprovalActionType } from '../../common/enums';
import { ApprovalsService } from '../approvals/approvals.service';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { LedgerEntry, LedgerEntryType } from './ledger-entry.entity';
import { PayrollRun, PayrollRunStatus } from './payroll-run.entity';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(PayrollRun) private readonly runRepo: Repository<PayrollRun>,
    private readonly approvals: ApprovalsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Post a payroll run: one ledger_entries row of type 'payroll' carrying the
   * run total, linked back to the run, all inside one transaction so a run
   * never exists without its ledger entry (or the other way round).
   */
  async create(dto: CreatePayrollRunDto, actorId: string): Promise<PayrollRun> {
    await this.approvals.assertApproved(dto.approvalRequestId, ApprovalActionType.FUND_MOVEMENT);
    const total = dto.lines.reduce((sum, line) => sum + line.amount, 0);
    if (!Number.isFinite(total) || total <= 0) {
      throw new BadRequestException('A payroll run needs at least one line with an amount');
    }

    return this.dataSource.transaction(async (manager) => {
      const run = await manager.save(
        PayrollRun,
        manager.create(PayrollRun, {
          periodMonth: dto.periodMonth,
          lines: dto.lines,
          totalAmount: total,
          status: PayrollRunStatus.POSTED,
          approvalRequestId: dto.approvalRequestId,
          postedAt: new Date(),
          createdBy: actorId,
        }),
      );
      const entry = await manager.save(
        LedgerEntry,
        manager.create(LedgerEntry, {
          type: LedgerEntryType.PAYROLL,
          amount: total,
          category: `payroll ${dto.periodMonth}`,
          referenceId: run.id,
          recordedBy: actorId,
        }),
      );
      await manager.update(PayrollRun, run.id, { ledgerEntryId: entry.id });
      run.ledgerEntryId = entry.id;
      return run;
    });
  }

  async list(page = 1, limit = 20): Promise<{ data: PayrollRun[]; total: number }> {
    const [data, total] = await this.runRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async detail(id: string): Promise<PayrollRun> {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) throw new NotFoundException(`Payroll run ${id} not found`);
    return run;
  }
}
