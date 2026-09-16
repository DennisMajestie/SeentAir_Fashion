import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, FindOptionsWhere, In, Repository } from 'typeorm';
import {
  INCOME_TYPES,
  LedgerEntry,
  LedgerEntryType,
  OUTFLOW_TYPES,
} from './ledger-entry.entity';

export interface LedgerRecordInput {
  type: LedgerEntryType;
  amount: number;
  category?: string | null;
  referenceId?: string | null;
  recordedBy?: string | null;
}

export type ReportType = 'income' | 'expenditure' | 'investment' | 'loss' | 'profit';
export const REPORT_TYPES: ReportType[] = ['income', 'expenditure', 'investment', 'loss', 'profit'];

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(LedgerEntry) private readonly ledgerRepo: Repository<LedgerEntry>,
  ) {}

  /** The single write path — sales/purchase flows call this inside their transactions. */
  async record(input: LedgerRecordInput, manager?: EntityManager): Promise<LedgerEntry> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.ledgerRepo;
    return repo.save(
      repo.create({
        type: input.type,
        amount: input.amount,
        category: input.category ?? null,
        referenceId: input.referenceId ?? null,
        recordedBy: input.recordedBy ?? null,
      }),
    );
  }

  async ledger(filters: {
    type?: LedgerEntryType;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ data: LedgerEntry[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const where: FindOptionsWhere<LedgerEntry> = {};
    if (filters.type) where.type = filters.type;
    if (filters.from && filters.to) where.entryDate = Between(filters.from, filters.to);
    const [data, total] = await this.ledgerRepo.findAndCount({
      where,
      order: { entryDate: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  /** The full report suite the client asked for: income, expenditure, investment, loss, profit. */
  async report(type: ReportType, from?: Date, to?: Date) {
    if (!REPORT_TYPES.includes(type)) {
      throw new BadRequestException(`Unknown report type; valid: ${REPORT_TYPES.join(', ')}`);
    }
    const income = await this.sumByTypes(INCOME_TYPES, from, to);
    const expenditure = await this.sumByTypes(OUTFLOW_TYPES, from, to);
    const investment = await this.sumByTypes([LedgerEntryType.INVESTMENT], from, to);
    const net = Math.round((income.total - expenditure.total) * 100) / 100;

    const period = { from: from ?? null, to: to ?? null };
    switch (type) {
      case 'income':
        return { type, period, total: income.total, byType: income.byType };
      case 'expenditure':
        return { type, period, total: expenditure.total, byType: expenditure.byType };
      case 'investment':
        return { type, period, total: investment.total };
      case 'profit':
        return {
          type,
          period,
          income: income.total,
          expenditure: expenditure.total,
          profit: Math.max(0, net),
          net,
        };
      case 'loss':
        return {
          type,
          period,
          income: income.total,
          expenditure: expenditure.total,
          loss: Math.max(0, -net),
          net,
        };
    }
  }

  private async sumByTypes(
    types: LedgerEntryType[],
    from?: Date,
    to?: Date,
  ): Promise<{ total: number; byType: Record<string, number> }> {
    const qb = this.ledgerRepo
      .createQueryBuilder('e')
      .select('e.type', 'type')
      .addSelect('SUM(e.amount)', 'total')
      .where({ type: In(types) })
      .groupBy('e.type');
    if (from && to) qb.andWhere('e.entry_date BETWEEN :from AND :to', { from, to });
    const rows: Array<{ type: string; total: string }> = await qb.getRawMany();
    const byType: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      const amount = parseFloat(row.total) || 0;
      byType[row.type] = amount;
      total += amount;
    }
    return { total: Math.round(total * 100) / 100, byType };
  }
}
