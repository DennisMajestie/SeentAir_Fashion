import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';
import { Coupon } from './coupon.entity';

export enum CustomerCouponStatus {
  AVAILABLE = 'available',
  USED = 'used',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

export enum CustomerCouponSource {
  ADMIN_ISSUE = 'admin_issue',
  BUNDLE_CLAIM = 'bundle_claim',
  CODE_CLAIM = 'code_claim',
  CAMPAIGN = 'campaign',
}

/**
 * One coupon in a customer's wallet.
 *
 * `customer_id` is NOT NULL because claiming requires a signed-in shopper, so a
 * wallet row can never belong to an anonymous visitor. `claim_key` is a
 * deterministic string per source ("code:SAVE20NO", "bundle:<id>",
 * "campaign:<id>") and is UNIQUE per customer, which is what makes claiming the
 * same offer twice return the existing row instead of minting a second one.
 */
@Index('IDX_customer_coupon_wallet', ['customerId', 'status'])
@Entity('customer_coupon')
export class CustomerCoupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'coupon_id', type: 'uuid' })
  couponId: string;

  @ManyToOne(() => Coupon, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupon_id' })
  coupon: Coupon;

  @Column({ type: 'enum', enum: CustomerCouponStatus, default: CustomerCouponStatus.AVAILABLE })
  status: CustomerCouponStatus;

  @Column({ type: 'enum', enum: CustomerCouponSource })
  source: CustomerCouponSource;

  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId: string | null;

  @Column({ name: 'claim_key', type: 'varchar', length: 80 })
  claimKey: string;

  @Column({ name: 'claimed_at', type: 'timestamptz', default: () => 'now()' })
  claimedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'redeemed_order_id', type: 'uuid', nullable: true })
  redeemedOrderId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

export enum CouponRedemptionStatus {
  RESERVED = 'reserved',
  CONFIRMED = 'confirmed',
  RELEASED = 'released',
}

/**
 * A coupon applied to an order.
 *
 * Nothing wires this to orders yet (that is the next session), so the table is
 * currently written only by tests. The partial unique index in the migration -
 * at most one row per customer_coupon that is reserved or confirmed - is what
 * makes a retried webhook harmless and a usage cap impossible to oversell.
 */
@Entity('coupon_redemption')
export class CouponRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ name: 'coupon_id', type: 'uuid' })
  couponId: string;

  @Column({ name: 'customer_coupon_id', type: 'uuid', nullable: true })
  customerCouponId: string | null;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ type: 'enum', enum: CouponRedemptionStatus, default: CouponRedemptionStatus.RESERVED })
  status: CouponRedemptionStatus;

  /** Kobo as a major-unit decimal, matching numeric(12,2) money storage. */
  @Column({
    name: 'discount_minor',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  discountMinor: number;

  /** Code, type, value, cap, eligible subtotal and the rule outcome, frozen. */
  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
