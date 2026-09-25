import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';
import { ProductionBatch } from './production-batch.entity';

/** Live machine/line telemetry snapshot for a batch (floor kiosk). */
@Entity('production_telemetry')
export class ProductionTelemetry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductionBatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch;

  @Column({ type: 'varchar' })
  stage: string;

  @Column({ type: 'varchar' })
  machine: string;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true, transformer: numericTransformer })
  rpm: number | null;

  @Column({ name: 'needle_cycles', type: 'integer', nullable: true })
  needleCycles: number | null;

  @Column({ name: 'thread_reserve_pct', type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numericTransformer })
  threadReservePct: number | null;

  @Column({ name: 'operator_id', type: 'uuid', nullable: true })
  operatorId: string | null;

  @Index()
  @CreateDateColumn({ name: 'recorded_at' })
  recordedAt: Date;
}