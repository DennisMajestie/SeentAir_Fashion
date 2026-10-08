import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Product-level primary image.
 *
 * Product photography used to hang off `product_variants.image_url` alone, so
 * every listing, rail, category pill, search result and wishlist snapshot
 * showed whatever the FIRST variant happened to carry — and when even that was
 * empty, they showed a positional stand-in that had nothing to do with the
 * product. This column gives a product its own photograph, which is what the
 * surfaces above now show (<img src=product.primary_image_url>).
 *
 * The variant image survives for a real job: per-colour shots on the product
 * page and the cart. When a product has no primary image, UIs fall back to the
 * first variant photo, then to one neutral placeholder — never to a grid slot.
 *
 * Nullable: a product without a photo is valid, so existing rows are "no photo
 * yet" rather than a migration error.
 */
export class ProductPrimaryImage1789550000000 implements MigrationInterface {
  name = 'ProductPrimaryImage1789550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ADD "primary_image_url" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "primary_image_url"`);
  }
}