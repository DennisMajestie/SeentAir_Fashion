import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';
import { RawMaterial } from '../../materials/entities/raw-material.entity';
import { ProductVariant } from './product-variant.entity';

/**
 * Planned bill of materials for one SKU (Phase 9): how much of each raw
 * material one unit of the variant consumes. Feed, not a live ledger —
 * consumption still flows through inventory movements (principle #2).
 */
@Entity('product_bom_items')
export class ProductBomItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductVariant, (variant) => variant.bomItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @ManyToOne(() => RawMaterial, { eager: true })
  @JoinColumn({ name: 'material_id' })
  material: RawMaterial;

  /** Per-unit consumption of the material (yards, kg, pieces, …). */
  @Column({ type: 'numeric', precision: 10, scale: 4, transformer: numericTransformer })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}