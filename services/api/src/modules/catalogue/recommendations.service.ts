import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** A pair needs at least this many paid orders before we call it an affinity. */
const MIN_SUPPORT = 2;

/** Purchase-based suggestions: what other shoppers bought in the same order. */
@Injectable()
export class RecommendationsService {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async forProduct(productId: string, limit = 4): Promise<Array<{ productId: string; score: number }>> {
    const rows: Array<{ product_id: string; score: string }> = await this.dataSource.query(
      `SELECT p.id AS product_id, COUNT(*) AS score
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN product_variants v ON v.id = oi.variant_id
       JOIN products p ON p.id = v.product_id
       WHERE o.payment_status = 'paid'
         AND o.status != 'cancelled'
         AND p.id != $1
         AND o.id IN (
           SELECT oi2.order_id
           FROM order_items oi2
           JOIN product_variants v2 ON v2.id = oi2.variant_id
           WHERE v2.product_id = $1
         )
       GROUP BY p.id
       HAVING COUNT(*) >= $3
         AND EXISTS (
           SELECT 1 FROM product_variants v3
           WHERE v3.product_id = p.id AND v3.availability_status = 'in_stock'
         )
       ORDER BY score DESC, p.id
       LIMIT $2`,
      [productId, limit, MIN_SUPPORT],
    );
    if (rows.length > 0) {
      return rows.map((r) => ({ productId: r.product_id, score: parseInt(r.score, 10) || 0 }));
    }
    const popular: Array<{ product_id: string; score: string }> = await this.dataSource.query(
      `SELECT p.id AS product_id, COUNT(*) AS score
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN product_variants v ON v.id = oi.variant_id
       JOIN products p ON p.id = v.product_id
       WHERE o.payment_status = 'paid'
         AND o.status != 'cancelled'
         AND p.id != $1
       GROUP BY p.id
       HAVING EXISTS (
         SELECT 1 FROM product_variants v2
         WHERE v2.product_id = p.id AND v2.availability_status = 'in_stock'
       )
       ORDER BY score DESC, p.id
       LIMIT $2`,
      [productId, limit],
    );
    return popular.map((r) => ({ productId: r.product_id, score: parseInt(r.score, 10) || 0 }));
  }
}
