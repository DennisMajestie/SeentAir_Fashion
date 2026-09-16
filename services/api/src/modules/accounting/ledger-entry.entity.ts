import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../common/numeric.transformer';

/**
 * Money in: sale, investment. Money out: expense, purchase, payroll, tax.
 * Amounts are stored positive; the type carries the direction.
 */
export enum LedgerEntryType {
  SALE = 'sale',
  INVESTMENT = 'investment',
  EXPENSE = 'expense',
  PURCHASE = 'purchase',
  PAYROLL = 'payroll',
  TAX = 'tax',
}

export const INCOME_TYPES = [LedgerEntryType.SALE, LedgerEntryType.INVESTMENT];
export const OUTFLOW_TYPES = [
  LedgerEntryType.EXPENSE,
  LedgerEntryType.PURCHASE,
  LedgerEntryType.PAYROLL,
  LedgerEntryType.TAX,
];

/** Replaces manual accounting entirely (appendix 12). */
@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'enum', enum: LedgerEntryType })
  type: LedgerEntryType;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  /** Originating record: order id, material purchase id, approval id, … */
  @Column({ name: 'reference_id', type: 'varchar', nullable: true })
  referenceId: string | null;

  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedBy: string | null;

  @Index()
  @CreateDateColumn({ name: 'entry_date' })
  entryDate: Date;
}
