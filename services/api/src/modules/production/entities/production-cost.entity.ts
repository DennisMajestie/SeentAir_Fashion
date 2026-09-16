import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';
import { ProductionBatch } from './production-batch.entity';

/**
 * Production cost = raw material + sewing + branding + packaging (appendix 02).
 * One cost record per batch; components can be updated as real figures land.
 */
@Entity('production_costs')
export class ProductionCost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => ProductionBatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch;

  @Column({ name: 'material_cost', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  materialCost: number;

  @Column({ name: 'sewing_cost', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  sewingCost: number;

  @Column({ name: 'branding_cost', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  brandingCost: number;

  @Column({ name: 'packaging_cost', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  packagingCost: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
