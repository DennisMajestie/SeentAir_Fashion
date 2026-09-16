import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';
import { Order } from './order.entity';

export enum PaymentMethod {
  PAYSTACK = 'paystack',
  CASH = 'cash',
  POS = 'pos',
  BANK_TRANSFER = 'bank_transfer',
}

export enum PaymentRecordStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

/**
 * Every channel's payments land here — online (Paystack) and offline
 * (cash/POS/bank transfer, recorded manually by staff). One central record.
 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'enum', enum: PaymentRecordStatus, default: PaymentRecordStatus.PENDING })
  status: PaymentRecordStatus;

  /** Paystack transaction reference (unique) for online payments. */
  @Index({ unique: true, where: 'reference IS NOT NULL' })
  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  /** Staff member who recorded an offline payment. */
  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
