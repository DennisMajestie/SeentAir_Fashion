import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductVariant } from '../../catalogue/entities/product-variant.entity';

/**
 * A production run tracked through the configured factory stages.
 *
 * Batches are per VARIANT (not just per product): finished-goods stock lives
 * in the inventory ledger at variant granularity, so completion must know
 * exactly which SKU it stocks. A run spanning several sizes/colours is
 * entered as one batch per variant.
 */
@Entity('production_batches')
export class ProductionBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductVariant, { eager: true })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({ type: 'integer' })
  quantity: number;

  /** One of the configured stage names (config: production.stages). */
  @Index()
  @Column({ type: 'varchar' })
  stage: string;

  @Column({ name: 'planned_date', type: 'date', nullable: true })
  plannedDate: string | null;

  /** Set exactly once, when the batch reaches the completion stage. */
  @Column({ name: 'completed_date', type: 'timestamptz', nullable: true })
  completedDate: Date | null;

  /** The approved PRODUCTION_START request that authorized this batch. */
  @Column({ name: 'approval_request_id', type: 'uuid' })
  approvalRequestId: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
