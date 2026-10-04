import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PriceTier } from './price-tier.entity';

/** Eligibility = ability to meet the MOQ; approved by staff (appendix 06). */
export enum WholesaleAccountStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/**
 * What kind of operation the buyer is. Captured at application time so tier
 * criteria can later be written against real distribution instead of guesswork
 * (appendix 06 criteria are still open: project doc 03 question #2).
 */
export enum WholesaleBuyerType {
  RETAILER = 'retailer',
  ONLINE_RESELLER = 'online_reseller',
  INSTITUTION = 'institution',
  DISTRIBUTOR = 'distributor',
  OTHER = 'other',
}

@Entity('wholesale_accounts')
export class WholesaleAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => PriceTier, { eager: true, nullable: true })
  @JoinColumn({ name: 'tier_id' })
  tier: PriceTier | null;

  @Column({
    name: 'approved_moq_status',
    type: 'enum',
    enum: WholesaleAccountStatus,
    default: WholesaleAccountStatus.PENDING,
  })
  status: WholesaleAccountStatus;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  // --- Application details ---
  // Nullable so accounts created through the authenticated one-click apply
  // (and every row that predates this form) stay valid.

  @Column({ name: 'business_name', type: 'varchar', length: 160, nullable: true })
  businessName: string | null;

  @Column({
    name: 'buyer_type',
    type: 'enum',
    enum: WholesaleBuyerType,
    nullable: true,
  })
  buyerType: WholesaleBuyerType | null;

  @Column({ name: 'business_phone', type: 'varchar', length: 40, nullable: true })
  businessPhone: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  state: string | null;

  /** Buyer's own estimate of units per opening order. Advisory, not enforced. */
  @Column({ name: 'opening_volume', type: 'int', nullable: true })
  openingVolume: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
