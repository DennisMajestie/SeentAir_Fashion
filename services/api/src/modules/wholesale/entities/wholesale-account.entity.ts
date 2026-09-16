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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
