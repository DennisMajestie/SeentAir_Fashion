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
import { Coupon } from './coupon.entity';
import { CouponBundle } from './coupon-bundle.entity';

export enum CouponCampaignPlacement {
  HOME_TOP = 'home_top',
}

export enum CouponCampaignClaimKind {
  COUPON = 'coupon',
  BUNDLE = 'bundle',
}

/**
 * A promotional banner.
 *
 * There is deliberately no "is running" column: the window is the truth, and a
 * flag would drift from the clock. Status is derived on read - UPCOMING before
 * `startsAt`, RUNNING between, ENDED at or after `endsAt` - so a banner cannot
 * claim to be live after its window closed just because nobody edited it.
 */
@Index('IDX_coupon_campaign_placement', ['placement', 'isActive', 'startsAt', 'endsAt'])
@Entity('coupon_campaign')
export class CouponCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'badge_text', type: 'varchar', length: 40, nullable: true })
  badgeText: string | null;

  @Column({ type: 'varchar', length: 160 })
  headline: string;

  @Column({ name: 'offer_text', type: 'varchar', length: 255, nullable: true })
  offerText: string | null;

  @Column({ name: 'label_text', type: 'varchar', length: 60, default: 'Limited time offer' })
  labelText: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  @Column({
    type: 'enum',
    enum: CouponCampaignPlacement,
    default: CouponCampaignPlacement.HOME_TOP,
  })
  placement: CouponCampaignPlacement;

  @Column({ type: 'enum', enum: CouponCampaignClaimKind })
  claimKind: CouponCampaignClaimKind;

  @Column({ name: 'coupon_id', type: 'uuid', nullable: true })
  couponId: string | null;

  @Column({ name: 'bundle_id', type: 'uuid', nullable: true })
  bundleId: string | null;

  @ManyToOne(() => Coupon, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupon_id' })
  coupon: Coupon | null;

  @ManyToOne(() => CouponBundle, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bundle_id' })
  bundle: CouponBundle | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

export type CouponCampaignStatus = 'upcoming' | 'running' | 'ended';

/** The banner's state at `now`, derived from the window rather than stored. */
export function campaignStatus(
  campaign: Pick<CouponCampaign, 'startsAt' | 'endsAt'>,
  now: Date,
): CouponCampaignStatus {
  if (now.getTime() < campaign.startsAt.getTime()) return 'upcoming';
  if (now.getTime() >= campaign.endsAt.getTime()) return 'ended';
  return 'running';
}
