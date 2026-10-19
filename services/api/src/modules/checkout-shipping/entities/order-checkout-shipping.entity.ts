import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';
import { DeliveryMethod } from '../../orders/entities/order.entity';
import { ProductSizeClass } from '../shipping-size-class';

/**
 * How delivery was priced for one order, frozen at creation.
 *
 * This is the order's own copy: a rate or zone edited tomorrow cannot change
 * what this order was charged, and the order page can show the breakdown without
 * re-deriving anything. An order created before delivery pricing existed has no
 * row at all, which is how "never priced" stays distinct from "was free".
 */
@Entity('order_checkout_shipping')
export class OrderCheckoutShipping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid', unique: true })
  orderId: string;

  @Column({ name: 'quote_id', type: 'uuid', nullable: true })
  quoteId: string | null;

  @Column({ name: 'zone_name', type: 'varchar', length: 120, nullable: true })
  zoneName: string | null;

  @Column({ name: 'state_key', type: 'varchar', length: 80, nullable: true })
  stateKey: string | null;

  @Column({ type: 'enum', enum: DeliveryMethod, nullable: true })
  method: DeliveryMethod | null;

  @Column({ name: 'size_class', type: 'enum', enum: ProductSizeClass, nullable: true })
  sizeClass: ProductSizeClass | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  subtotal: number;

  @Column({ name: 'delivery_fee', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  deliveryFee: number;

  @Column({ name: 'vat_amount', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  vatAmount: number;

  @Column({ name: 'vat_rate_percent', type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numericTransformer })
  vatRatePercent: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  total: number;

  /** The rule evaluation that produced these numbers, for later disputes. */
  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
