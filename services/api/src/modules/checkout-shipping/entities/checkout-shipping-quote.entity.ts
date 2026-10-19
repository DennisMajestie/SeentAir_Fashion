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
 * A stored delivery quote: a promise about money that is good once.
 *
 * `order_id` is null until an order consumes this row and is UNIQUE, so the
 * database itself refuses a second use. `cart` holds the exact lines and prices
 * the quote was built from, so an order can prove it is the basket that was
 * quoted rather than trusting the client.
 *
 * There is deliberately no relation to Order: the column is enough to mark the
 * quote consumed, and avoiding the entity avoids a circular import between the
 * orders and checkout-shipping modules.
 */
@Entity('checkout_shipping_quote')
export class CheckoutShippingQuote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ name: 'state_key', type: 'varchar', length: 80 })
  stateKey: string;

  @Column({ name: 'zone_id', type: 'uuid', nullable: true })
  zoneId: string | null;

  @Column({ name: 'zone_name', type: 'varchar', length: 120, nullable: true })
  zoneName: string | null;

  @Column({ type: 'enum', enum: DeliveryMethod })
  method: DeliveryMethod;

  @Column({ name: 'size_class', type: 'enum', enum: ProductSizeClass })
  sizeClass: ProductSizeClass;

  /** Major units. What the customer would be charged to be delivered. */
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  fee: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  subtotal: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  total: number;

  /** variantId + quantity + unit price, the basis for the mismatch checks. */
  @Column({ type: 'jsonb' })
  cart: { variantId: string; quantity: number; unitPriceKobo: number }[];

  @Column({ name: 'settings_version', type: 'jsonb', nullable: true })
  settingsVersion: Record<string, unknown> | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /** Null until consumed. UNIQUE, so one quote can price one order only. */
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
