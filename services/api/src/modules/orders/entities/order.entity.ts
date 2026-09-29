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

/** Routable delivery destination. Structurally matched by ShippingAddressDto —
    declared here so the entity carries the real shape instead of `unknown`. */
export interface OrderShippingAddress {
  state: string;
  city: string;
  line: string;
  phone: string;
  landmark?: string;
}

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
  /** Paid in full but the ledger could not allocate every line — staff allocate or refund. */
  STOCK_EXCEPTION = 'stock_exception',
  /** Closed by a refund before fulfilment; only reachable from STOCK_EXCEPTION. */
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  REFUNDED = 'refunded',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nullable for walk-in in-store sales recorded by staff. */
  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'customer_id' })
  customer: User | null;

  /**
   * Guest checkout: who bought, when there is no account. An order carries a
   * customer OR a guest email, never neither — except a staff-recorded in-store
   * sale, which legitimately has no contact at all.
   */
  @Column({ name: 'guest_name', type: 'varchar', length: 160, nullable: true })
  guestName: string | null;

  /** Stored lowercased and trimmed: this is the key a later registration claims on. */
  @Index()
  @Column({ name: 'guest_email', type: 'varchar', length: 320, nullable: true })
  guestEmail: string | null;

  /** Set when a verified registration attached this guest order to an account. */
  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  /**
   * Not a column. Carries the raw tracking token back to the caller on the one
   * response that creates a guest order — only its hash is ever stored, so this
   * is the single moment the plain value exists.
   */
  trackingToken?: string;

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

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  paymentStatus: PaymentStatus;

  /** Captured at creation from catalogue prices; payments must equal this exactly. */
  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  totalAmount: number;

  /** Delivery destination captured at creation for outbound fulfilment. */
  @Column({ name: 'shipping_address', type: 'jsonb', nullable: true })
  shippingAddress: OrderShippingAddress | null;

  /** Handover instructions for the waybill — not routable data, so kept out
      of the address. Set by staff at pack-out. */
  @Column({ name: 'delivery_note', type: 'text', nullable: true })
  deliveryNote: string | null;

  @Column({
    name: 'gross_weight_kg',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  grossWeightKg: number | null;

  /** Pallet staging reference for the warehouse. */
  @Column({ name: 'pallet_ref', type: 'varchar', nullable: true })
  palletRef: string | null;

  /** Generated QR stencil reference printed on the box for scanning. */
  @Column({ name: 'qr_stencil_ref', type: 'varchar', nullable: true })
  qrStencilRef: string | null;

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
