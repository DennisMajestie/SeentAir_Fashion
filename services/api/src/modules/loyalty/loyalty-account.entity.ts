import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/entities/user.entity';

/**
 * A shopper's loyalty balance. Points are earned on paid orders (1 point per
 * N1,000 spent) and can be adjusted by marketing staff; every change has an
 * entry in loyalty_entries so the balance is explainable (appendix 15).
 */
@Index('IDX_loyalty_account_customer', ['customerId'], { unique: true })
@Entity('loyalty_accounts')
export class LoyaltyAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: User;

  @Column({ type: 'int', default: 0 })
  points: number;

  @Column({ name: 'lifetime_points', type: 'int', default: 0 })
  lifetimePoints: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
