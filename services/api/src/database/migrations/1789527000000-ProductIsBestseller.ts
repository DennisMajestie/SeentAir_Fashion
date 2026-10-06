import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Merchandising flag: "Bestseller" on the storefront card.
 *
 * This is a seller-applied label, not a computed sales figure. The real
 * popularity number stays the derived `soldCount` (see
 * CatalogueService.salesCounts()), which the storefront shows as "N bought" --
 * that one is computed per request from paid orders so it cannot go stale.
 *
 * A boolean rather than a sales threshold because nothing in the database can
 * turn a threshold into a badge without either inventing a cutoff or shipping
 * the whole order table to the storefront. A column defaults every existing
 * product to false, so the badge is opt-in and the rail cannot imply popularity
 * nobody asked for.
 *
 * Default rather than nullable: every row stays valid without a backfill, and
 * the flag reads as "not a bestseller" instead of "unknown".
 */
export class ProductIsBestseller1789527000000 implements MigrationInterface {
  name = 'ProductIsBestseller1789527000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD "is_bestseller" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "is_bestseller"`);
  }
}
