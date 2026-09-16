import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductionBatch } from './production-batch.entity';

/**
 * Disposition is driven by the rejection reason (appendix 02):
 * defective/bad product → burned (permanent write-off, never enters stock);
 * simple factory error → repaired & restocked (still counts into completion).
 */
export enum QCDisposition {
  BURNED = 'burned',
  REPAIRED_RESTOCKED = 'repaired_restocked',
}

@Entity('qc_rejections')
export class QCRejection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductionBatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  /** Required — the reason determines the disposition path. */
  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'enum', enum: QCDisposition })
  disposition: QCDisposition;

  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
