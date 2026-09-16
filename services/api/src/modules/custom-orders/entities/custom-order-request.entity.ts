import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Confirmed end-to-end flow (appendix 07):
 * submit → review → quote → accept → pay (full) → sample production →
 * buyer approves sample (HARD GATE) → full production → fulfilment → delivery.
 * Custom orders are excluded from returns (made-to-spec).
 */
export enum CustomOrderStatus {
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  QUOTED = 'quoted',
  QUOTE_ACCEPTED = 'quote_accepted',
  PAID = 'paid',
  SAMPLE_IN_PRODUCTION = 'sample_in_production',
  SAMPLE_APPROVED = 'sample_approved',
  IN_PRODUCTION = 'in_production',
  FULFILLED = 'fulfilled',
  DELIVERED = 'delivered',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@Entity('custom_order_requests')
export class CustomOrderRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;

  // Required intake fields (client-confirmed).
  @Column({ type: 'varchar' })
  sizes: string;

  @Column({ type: 'varchar' })
  colours: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'varchar' })
  location: string;

  @Column({ name: 'fabric_quality', type: 'varchar' })
  fabricQuality: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'desired_date', type: 'date' })
  desiredDate: string;

  @Index()
  @Column({ type: 'enum', enum: CustomOrderStatus, default: CustomOrderStatus.SUBMITTED })
  status: CustomOrderStatus;

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
