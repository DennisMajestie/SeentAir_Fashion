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

  /**
   * Timed sale: a percentage off the retail price until `saleEndsAt`. Kept
   * beside `basePrice`, never written into it, so the normal price survives a
   * sale untouched. Both null when the product has never been on sale; after a
   * sale ends the values stay as a record and are simply no longer in force.
   * Whether a sale is running is decided by sale-pricing.ts, nowhere else.
   */
  @Column({
    name: 'sale_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  salePercent: number | null;

  @Column({ name: 'sale_ends_at', type: 'timestamptz', nullable: true })
  saleEndsAt: Date | null;

  /**
   * The product's own photograph: an absolute URL, or a path the storefront can
   * resolve (uploaded files are stored as absolute URLs, seed assets as paths).
   * Nullable: a product without a photo is valid, and storefront surfaces then
   * fall back to a variant's image (product-variant.imageUrl) or finally to a
   * neutral placeholder — never to the position the product happens to sit at.
   */
  @Column({ name: 'primary_image_url', type: 'varchar', nullable: true })
  primaryImageUrl: string | null;

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

  /**
   * The base price with the sale taken off, while a sale is running; null
   * otherwise. Not a column: derived per request beside `soldCount`, so a
   * client can show "was / now" without re-deriving whether the sale is live.
   */
  salePrice?: number | null;
}
