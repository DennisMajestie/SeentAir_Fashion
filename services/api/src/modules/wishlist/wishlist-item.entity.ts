import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../catalogue/entities/product.entity';
import { User } from '../users/entities/user.entity';

/**
 * A saved product on a customer's wishlist.
 *
 * This is the server-side half of a list the storefront previously kept only in
 * the browser, which meant the wishlist vanished on a new device and could not
 * be read by staff. The storefront still keeps a local copy so a guest can save
 * before signing in; `merge` folds those into the account on sign-in.
 *
 * Only the product is stored. The card name, photo and price shown alongside it
 * are read live from the product at request time, so a wishlist can never show a
 * stale price or a photo that has since been replaced -- the same reasoning as
 * `soldCount`, which is derived per request rather than stored.
 */
@Entity('wishlist_items')
@Index(['user', 'product'], { unique: true })
export class WishlistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Relations are declared with @JoinColumn, never a second @Column beside them:
   * TypeORM expects the owning side to own the foreign key, and adding a plain
   * column with the same database name leaves the entity describing a column
   * that does not exist. This matches ProductVariant.product.
   */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  @Index()
  user: User;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}