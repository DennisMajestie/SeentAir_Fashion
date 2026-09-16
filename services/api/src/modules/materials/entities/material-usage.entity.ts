import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RawMaterial } from './raw-material.entity';

@Entity('material_usages')
export class MaterialUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RawMaterial, { eager: true })
  @JoinColumn({ name: 'material_id' })
  material: RawMaterial;

  /** FK to production_batches lands in Phase 2 — kept as uuid until then. */
  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId: string | null;

  @Column({ name: 'quantity_used', type: 'integer' })
  quantityUsed: number;

  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedBy: string | null;

  @CreateDateColumn({ name: 'used_at' })
  usedAt: Date;
}
