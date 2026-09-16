import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';

/**
 * Multiple wholesale price tiers exist (client-confirmed). The CRITERIA for
 * assigning a customer to a tier are unresolved (Open Question #2), so tier
 * assignment is manual/admin-set until the client defines the rules.
 */
@Entity('price_tiers')
export class PriceTier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  /** Human-readable description of who belongs here — pending OQ #2. */
  @Column({ name: 'rule_description', type: 'text', nullable: true })
  ruleDescription: string | null;

  /** Percentage off the retail price for this tier (0–100). */
  @Column({
    name: 'discount_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  discountPercent: number;
}
