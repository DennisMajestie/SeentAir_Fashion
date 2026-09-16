import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApprovalActionType, ApprovalStatus } from '../../common/enums';
import { User } from '../users/entities/user.entity';

/**
 * Approval gate for money-moving and stock-moving actions (appendix 19).
 * Later phases call ApprovalsService.assertApproved() before executing
 * purchasing, production starts, price changes, and fund movements —
 * unauthorized versions of these actions are impossible, not just logged.
 */
@Entity('approval_requests')
export class ApprovalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'action_type', type: 'enum', enum: ApprovalActionType })
  actionType: ApprovalActionType;

  /** Free-form context: what is being requested (amounts, product ids, etc.). */
  @Column({ type: 'jsonb', nullable: true })
  payload: unknown | null;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'requested_by' })
  requestedBy: User;

  @Index()
  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.PENDING })
  status: ApprovalStatus;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedBy: User | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
