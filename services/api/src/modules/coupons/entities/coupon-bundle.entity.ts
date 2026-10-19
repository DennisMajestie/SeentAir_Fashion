import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Coupon } from './coupon.entity';

@Entity('coupon_bundle')
export class CouponBundle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'claim_cap', type: 'integer', nullable: true })
  claimCap: number | null;

  @Column({ name: 'per_customer_claim_cap', type: 'integer', default: 1 })
  perCustomerClaimCap: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('coupon_bundle_item')
export class CouponBundleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'bundle_id', type: 'uuid' })
  bundleId: string;

  @Column({ name: 'coupon_id', type: 'uuid' })
  couponId: string;

  @Column(() => Coupon)
  coupon?: Coupon;
}
