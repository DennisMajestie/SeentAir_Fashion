import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';

export enum CouponType {
  PERCENT_OFF = 'percent_off',
  FIXED_OFF = 'fixed_off',
  FREE_DELIVERY = 'free_delivery',
}

export enum CouponAudience {
  ALL = 'all',
  NEW_CUSTOMERS = 'new_customers',
  SPECIFIC = 'specific',
}

/**
 * A discount rule. `code` is stored already normalised (upper case, no
 * look-alike characters) so the UNIQUE index alone is enough to prevent two
 * coupons colliding; entry is case-insensitive because the lookup normalises
 * first. See coupon-code.ts.
 */
@Entity('coupon')
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 8, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: CouponType })
  type: CouponType;

  /** Percent for PERCENT_OFF, major units for FIXED_OFF, 0 for FREE_DELIVERY. */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  value: number;

  /** REQUIRED for PERCENT_OFF - the margin guardrail. */
  @Column({
    name: 'max_discount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  maxDiscount: number | null;

  @Column({
    name: 'min_spend',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  minSpend: number | null;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'usage_cap', type: 'integer', nullable: true })
  usageCap: number | null;

  @Column({ name: 'per_customer_cap', type: 'integer', default: 1 })
  perCustomerCap: number;

  @Column({ type: 'enum', enum: CouponAudience, default: CouponAudience.ALL })
  audience: CouponAudience;

  /** Sale lines are excluded unless this is turned on per coupon. */
  @Column({ name: 'applies_to_sale_items', type: 'boolean', default: false })
  appliesToSaleItems: boolean;

  @Column({ name: 'include_products', type: 'uuid', array: true, nullable: true })
  includeProducts: string[] | null;

  @Column({ name: 'exclude_products', type: 'uuid', array: true, nullable: true })
  excludeProducts: string[] | null;

  @Column({ name: 'include_categories', type: 'uuid', array: true, nullable: true })
  includeCategories: string[] | null;

  @Column({ name: 'exclude_categories', type: 'uuid', array: true, nullable: true })
  excludeCategories: string[] | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'times_used', type: 'integer', default: 0 })
  timesUsed: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
