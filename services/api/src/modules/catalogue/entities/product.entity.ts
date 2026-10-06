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
import { Collection } from './collection.entity';
import { ProductVariant } from './product-variant.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  /**
   * Seller-applied merchandising label, surfaced as the "Bestseller" badge on
   * the storefront card. Deliberately NOT a sales figure: see the migration.
   * Real popularity stays on `soldCount` below, which is derived per request
   * and never stored, so the two cannot disagree.
   */
  @Column({ name: 'is_bestseller', type: 'boolean', default: false })
  isBestseller: boolean;

  /** Currency is configuration (Open Question #6) — amounts are currency-agnostic numbers. */
  @Column({
    name: 'base_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  basePrice: number;

  @ManyToOne(() => Collection, (collection) => collection.products, { nullable: true, eager: true })
  @JoinColumn({ name: 'collection_id' })
  collection: Collection | null;

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants: ProductVariant[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * How many separate paid orders contain this product. Not a column: it is
   * derived per request by CatalogueService.salesCounts() and attached only to
   * the public product endpoints, so the storefront can show a real "N bought"
   * without the figure ever being stored or drifting out of date.
   *
   * Always present on those endpoints (0 when nothing has sold). Left optional
   * because admin writes return the entity without it.
   */
  soldCount?: number;
}
