import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductVariant } from '../catalogue/entities/product-variant.entity';
import { Order } from '../orders/entities/order.entity';

export enum ReturnStatus {
  REQUESTED = 'requested',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

/**
 * Confirmed policy (appendix 10): request within 12h of receipt, physical
 * return within 24h of the request, custom/special orders excluded, item
 * travels back via a logistics company with a tracking/parcel ID.
 */
@Entity('return_requests')
export class ReturnRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, { eager: true })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne(() => ProductVariant, { eager: true })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'text' })
  reason: string;

  @CreateDateColumn({ name: 'requested_at' })
  requestedAt: Date;

  /** requestedAt + completion window (24h) — when the physical return is due. */
  @Column({ name: 'return_deadline', type: 'timestamptz' })
  returnDeadline: Date;

  /** Parcel/tracking ID from the logistics company carrying it back. */
  @Column({ name: 'tracking_number', type: 'varchar', nullable: true })
  trackingNumber: string | null;

  @Index()
  @Column({ type: 'enum', enum: ReturnStatus, default: ReturnStatus.REQUESTED })
  status: ReturnStatus;

  /** What resolution was given (refund, replacement, …). */
  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @Column({ type: 'boolean', default: false })
  restocked: boolean;

  @Column({ type: 'boolean', default: false })
  damaged: boolean;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
