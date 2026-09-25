import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';
import { Product } from './product.entity';
import { ProductBomItem } from './product-bom-item.entity';

export enum AvailabilityStatus {
  IN_STOCK = 'in_stock',
  OUT_OF_STOCK = 'out_of_stock',
  MADE_TO_ORDER = 'made_to_order',
}

@Entity('product_variants')
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'varchar', nullable: true })
  size: string | null;

  @Column({ type: 'varchar', nullable: true })
  colour: string | null;

  @Column({ unique: true })
  sku: string;

  @Column({
    name: 'price_override',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  priceOverride: number | null;

  @Column({ name: 'image_url', type: 'varchar', nullable: true })
  imageUrl: string | null;

  /**
   * Display status only. Actual stock is ALWAYS derived from the
   * inventory movement ledger, never from this field.
   */
  @Column({
    name: 'availability_status',
    type: 'enum',
    enum: AvailabilityStatus,
    default: AvailabilityStatus.IN_STOCK,
  })
  availabilityStatus: AvailabilityStatus;

  /** Garment engineering (Phase 9): how the silhouette is meant to fit. */
  @Column({ name: 'fit_note', type: 'text', nullable: true })
  fitNote: string | null;

  /** Graded pattern dimensions keyed by size (xs/s/m/l/xl/…). */
  @Column({ name: 'pattern_geometry', type: 'jsonb', nullable: true })
  patternGeometry: unknown | null;

  /** Source DXF/spec-sheet file for the pattern. */
  @Column({ name: 'dxf_url', type: 'varchar', length: 500, nullable: true })
  dxfUrl: string | null;

  /** Warehouse location, e.g. "A1-B2" (bay-rack map). */
  @Column({ name: 'storage_location', type: 'varchar', nullable: true })
  storageLocation: string | null;

  @OneToMany(() => ProductBomItem, (bom) => bom.variant)
  bomItems: ProductBomItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
