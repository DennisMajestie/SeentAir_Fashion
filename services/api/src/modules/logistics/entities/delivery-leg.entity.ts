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
import { numericTransformer } from '../../../common/numeric.transformer';
import { Order } from '../../orders/entities/order.entity';

export enum DeliveryLegStatus {
  PENDING = 'pending',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

/**
 * Multi-leg deliveries (appendix 14): some destinations need more than one
 * stage — e.g. dispatch rider to the park, transport company interstate.
 */
@Entity('delivery_legs')
@Index(['order', 'legNumber'], { unique: true })
export class DeliveryLeg {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, { eager: true })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  /** Carrier key: 'gigl' (API-integrated) or a manual carrier name. */
  @Column()
  carrier: string;

  @Column({ name: 'leg_number', type: 'integer', default: 1 })
  legNumber: number;

  @Column({ type: 'enum', enum: DeliveryLegStatus, default: DeliveryLegStatus.PENDING })
  status: DeliveryLegStatus;

  @Column({ name: 'tracking_ref', type: 'varchar', nullable: true })
  trackingRef: string | null;

  @Column({ name: 'weight_kg', type: 'numeric', precision: 8, scale: 2, nullable: true, transformer: numericTransformer })
  weightKg: number | null;

  @Column({ type: 'varchar', nullable: true })
  zone: string | null;

  /** Quoted delivery cost (weight + location — appendix 14). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: numericTransformer })
  cost: number | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
