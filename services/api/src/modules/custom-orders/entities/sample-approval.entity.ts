import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CustomOrderRequest } from './custom-order-request.entity';

/** The client-added gate: full production must not begin until the buyer approves the sample. */
@Entity('sample_approvals')
export class SampleApproval {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => CustomOrderRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: CustomOrderRequest;

  @Column({ name: 'buyer_approved', type: 'boolean', default: false })
  buyerApproved: boolean;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'decided_at' })
  decidedAt: Date;
}
