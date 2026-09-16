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

  /** Currency is configuration (Open Question #6) — amounts are currency-agnostic numbers. */
  @Column({ name: 'base_price', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
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
}
