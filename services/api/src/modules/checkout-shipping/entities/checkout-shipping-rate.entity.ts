import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';
import { DeliveryMethod } from '../../orders/entities/order.entity';
import { ProductSizeClass } from '../shipping-size-class';
import { CheckoutShippingZone } from './checkout-shipping-zone.entity';

/**
 * The fee for one zone + size class + delivery method, valid between two
 * instants. `valid_to` null means "until further notice".
 *
 * Rates are versioned rather than overwritten so that changing a price never
 * rewrites the basis of a quote that was already issued. Which rate applies to
 * a moment is decided by the provider against these windows; two active rates
 * for the same triple whose windows overlap are ambiguous, and the admin
 * service refuses to create one.
 */
@Entity('checkout_shipping_rates')
export class CheckoutShippingRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CheckoutShippingZone, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'zone_id' })
  zone: CheckoutShippingZone;

  @Column({ name: 'size_class', type: 'enum', enum: ProductSizeClass })
  sizeClass: ProductSizeClass;

  /** Reuses the order's own method enum rather than inventing a second one. */
  @Column({ type: 'enum', enum: DeliveryMethod })
  method: DeliveryMethod;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  fee: number;

  @Column({ name: 'valid_from', type: 'timestamptz', default: () => 'now()' })
  validFrom: Date;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}