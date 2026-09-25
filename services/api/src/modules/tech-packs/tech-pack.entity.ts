import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../common/numeric.transformer';
import { ProductVariant } from '../catalogue/entities/product-variant.entity';

/** Tech-pack lifecycle: draft → approved. New revisions keep a snapshot history. */
export type TechPackStatus = 'draft' | 'approved';

@Entity('tech_packs')
@Index(['variant'], { unique: true })
export class TechPack {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({ type: 'varchar', nullable: true })
  silhouette: string | null;

  @Column({ name: 'target_yield_units', type: 'integer', nullable: true })
  targetYieldUnits: number | null;

  @Column({ name: 'cutting_efficiency_pct', type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numericTransformer })
  cuttingEfficiencyPct: number | null;

  /** Graded measurements keyed by size (chest/length/sleeve/hip per XS–XXL). */
  @Column({ name: 'graded_measurements', type: 'jsonb', nullable: true })
  gradedMeasurements: unknown | null;

  @Column({ name: 'stitch_protocol', type: 'text', nullable: true })
  stitchProtocol: string | null;

  @Column({ name: 'laydown_protocol', type: 'text', nullable: true })
  laydownProtocol: string | null;

  @Column({ name: 'dxf_url', type: 'varchar', length: 500, nullable: true })
  dxfUrl: string | null;

  @Column({ type: 'integer', default: 1 })
  revision: number;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: TechPackStatus;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}