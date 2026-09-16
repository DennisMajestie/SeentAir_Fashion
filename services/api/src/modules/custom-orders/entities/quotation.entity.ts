import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';
import { CustomOrderRequest } from './custom-order-request.entity';

/**
 * Manual quotation (fabric quality, quantity, style complexity) — no
 * automated pricing formula (client-confirmed). Approved by Manager.
 */
@Entity('quotations')
export class Quotation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => CustomOrderRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: CustomOrderRequest;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'approved_by', type: 'uuid' })
  approvedBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
