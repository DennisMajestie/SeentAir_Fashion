import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../catalogue/entities/product.entity';
import { WishlistItem } from './wishlist-item.entity';

/** A wishlist entry as the storefront needs it: the live product plus its price. */
export interface WishlistEntry {
  product: Product;
  addedAt: Date;
}

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem) private readonly itemRepo: Repository<WishlistItem>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
  ) {}

  /** The customer's saved products, newest save first. */
  async listFor(userId: string): Promise<WishlistEntry[]> {
    const rows = await this.itemRepo.find({
      where: { user: { id: userId } },
      relations: { product: { variants: true } },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => ({ product: r.product, addedAt: r.createdAt }));
  }

  async add(userId: string, productId: string): Promise<WishlistItem> {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException(`Product ${productId} not found`);

    // Saving the same product twice is not an error: the shopper tapped again
    // because the first tap had not visibly landed yet. Report the existing row.
    // Raw foreign-key columns again: the same nested-entity serialisation that
    // breaks `delete` also silently returns nothing for `findOne`.
    const existing = await this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.product', 'product')
      .where('item.user_id = :userId', { userId })
      .andWhere('item.product_id = :productId', { productId })
      .getOne();
    if (existing) return existing;

    return this.itemRepo.save(
      this.itemRepo.create({ product, user: { id: userId } as never }),
    );
  }

  async remove(userId: string, productId: string): Promise<void> {
    // Filtered by the raw foreign-key columns rather than `{ product: { id } }`.
    // Nesting an entity in a delete criteria object makes TypeORM serialise the
    // whole relation into the where clause, which Postgres rejects as a uuid.
    await this.itemRepo
      .createQueryBuilder()
      .delete()
      .where('user_id = :userId', { userId })
      .andWhere('product_id = :productId', { productId })
      .execute();
  }

  /**
   * Fold a guest's browser wishlist into their account when they sign in.
   *
   * Without this, saving a product and then signing in silently loses it -- the
   * list stayed in localStorage, keyed to nobody. Ids the shopper could not have
   * added themselves are skipped rather than failing the whole sign-in, so one
   * stale id (a product since deleted) cannot block the merge.
   *
   * Existing saves win: a product already on the account's list is left alone,
   * so a merge never reorders or duplicates what the shopper had.
   */
  async merge(userId: string, productIds: string[]): Promise<{ merged: number }> {
    const unique = [...new Set(productIds)].filter((id) => UUID_PATTERN.test(id));
    if (unique.length === 0) return { merged: 0 };

    const known = await this.productRepo
      .createQueryBuilder('product')
      // Aliased explicitly. A bare select() returns the raw column under
      // Postgres's own name, which is not what the row object is keyed by.
      .select('product.id', 'id')
      .where('product.id IN (:...ids)', { ids: unique })
      .getRawMany<{ id: string }>();
    const knownIds = new Set(known.map((k) => k.id));
    const wanted = unique.filter((id) => knownIds.has(id));
    if (wanted.length === 0) return { merged: 0 };

    const existing = await this.itemRepo
      .createQueryBuilder('item')
      .select('item.product_id', 'product_id')
      .where('item.user_id = :userId', { userId })
      .andWhere('item.product_id IN (:...ids)', { ids: wanted })
      .getRawMany<{ product_id: string }>();
    const already = new Set(existing.map((e) => e.product_id));
    const toAdd = wanted.filter((id) => !already.has(id));
    if (toAdd.length === 0) return { merged: 0 };

    await this.itemRepo.insert(
      toAdd.map((id) => ({ user: { id: userId } as never, product: { id } as never })),
    );
    return { merged: toAdd.length };
  }
}

/** Only well-formed uuids reach the query. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;