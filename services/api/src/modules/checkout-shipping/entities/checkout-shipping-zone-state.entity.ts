import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CheckoutShippingZone } from './checkout-shipping-zone.entity';

/**
 * One state inside a zone.
 *
 * `state_key` is the stable identifier from the canonical state list, and the
 * UNIQUE constraint on it is the important part: it makes it impossible for a
 * state to be served by two zones at once, which is what lets a quote resolve
 * a destination by looking it up instead of guessing between candidates.
 */
@Entity('checkout_shipping_zone_states')
export class CheckoutShippingZoneState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CheckoutShippingZone, (zone) => zone.states, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'zone_id' })
  zone: CheckoutShippingZone;

  /** Stable key, e.g. 'lag'. Unique across all zones. */
  @Column({ name: 'state_key', type: 'varchar', length: 80, unique: true })
  stateKey: string;

  /** The name as displayed, e.g. 'Lagos'. */
  @Column({ type: 'varchar', length: 120 })
  state: string;
}