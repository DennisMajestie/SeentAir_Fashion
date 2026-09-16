import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';
import { User } from '../../users/entities/user.entity';
import { OrderItem } from './order-item.entity';

/** One shared order resource for ALL sales channels — no channel silos. */
export enum OrderChannel {
  RETAIL = 'retail',
  WHOLESALE = 'wholesale',
  CUSTOM = 'custom',
  IN_STORE = 'in_store',
}

/**
 * AWAITING_PAYMENT is internal (full payment upfront — appendix 08);
 * the rest are the confirmed customer-facing states (appendix 09).
 */
export enum OrderStatus {
  AWAITING_PAYMENT = 'awaiting_payment',
  ORDER_RECEIVED = 'order_received',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  RETURNED = 'returned',
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nullable for walk-in in-store sales recorded by staff. */
  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'customer_id' })
  customer: User | null;

  @Index()
  @Column({ type: 'enum', enum: OrderChannel })
  channel: OrderChannel;

  /** Marketing source attribution (appendix 15): instagram, whatsapp, tiktok, direct, … */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  source: string | null;

  @Index()
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.AWAITING_PAYMENT })
  status: OrderStatus;

  @Column({ name: 'payment_status', type: 'enum', enum: PaymentStatus, default: PaymentStatus.UNPAID })
  paymentStatus: PaymentStatus;

  /** Captured at creation from catalogue prices; payments must equal this exactly. */
  @Column({ name: 'total_amount', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  totalAmount: number;

  /** Set when the order reaches DELIVERED — anchors the 12h return window and reviews. */
  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @OneToMany(() => OrderItem, (item) => item.order, { eager: true, cascade: true })
  items: OrderItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
