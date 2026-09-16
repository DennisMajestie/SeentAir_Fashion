import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';

/** Delivery price = weight + location (appendix 14): baseFee + pricePerKg × weight, per zone. */
@Entity('delivery_pricing')
export class DeliveryPricing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Destination zone: 'lagos_local', 'interstate', 'international', … */
  @Column({ unique: true })
  zone: string;

  @Column({ name: 'base_fee', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  baseFee: number;

  @Column({ name: 'price_per_kg', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  pricePerKg: number;
}
