import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../common/numeric.transformer';

/** A run exists to be posted (paid) or voided; there is no draft state. */
export enum PayrollRunStatus {
  POSTED = 'posted',
  VOID = 'void',
}

export interface PayrollLine {
  name: string;
  amount: number;
  note?: string;
}

/**
 * One monthly payroll run: the lines as they were paid, approval reference and
 * the ledger entry it produced. Payroll is a fund movement (appendix 19), so a
 * run can only be created against an APPROVED fund-movement request - and the
 * posting writes exactly one ledger_entries row of type 'payroll'.
 */
@Entity('payroll_runs')
@Index(['status'])
export class PayrollRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 'YYYY-MM' — the month the run pays for, not when it was posted. */
  @Column({ name: 'period_month', type: 'varchar', length: 7 })
  periodMonth: string;

  @Column({ type: 'jsonb' })
  lines: PayrollLine[];

  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 2, transformer: numericTransformer })
  totalAmount: number;

  @Column({ type: 'enum', enum: PayrollRunStatus, default: PayrollRunStatus.POSTED })
  status: PayrollRunStatus;

  /** The approved FUND_MOVEMENT request that authorized this run. */
  @Column({ name: 'approval_request_id', type: 'uuid' })
  approvalRequestId: string;

  /** The ledger_entries row this run posted (type 'payroll'). */
  @Column({ name: 'ledger_entry_id', type: 'uuid', nullable: true })
  ledgerEntryId: string | null;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
