import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';
import { User } from '../../users/entities/user.entity';

/**
 * Business partner/investor (appendix 17) — NOT an affiliate. Receives
 * quarterly profit sharing; never accesses customer-facing surfaces or PII.
 * equityPercentage is the partner's share of TOTAL shares (all partners
 * together hold at most 40%; the founder/CEO holds 60%).
 */
@Entity('partners')
export class Partner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    name: 'equity_percentage',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  equityPercentage: number;

  @Column({
    name: 'invested_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  investedAmount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
