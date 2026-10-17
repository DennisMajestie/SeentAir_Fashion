import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CheckoutShippingZoneState } from './checkout-shipping-zone-state.entity';

/**
 * A group of states that share delivery prices (the states column's group).
 * Prices live on the rates, not here, so a zone can be reorganised without
 * touching a single price.
 */
@Entity('checkout_shipping_zones')
export class CheckoutShippingZone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => CheckoutShippingZoneState, (state) => state.zone)
  states: CheckoutShippingZoneState[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}