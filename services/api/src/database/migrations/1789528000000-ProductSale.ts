import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Timed sales on products ("sale surge").
 *
 * The storefront card used to carry a countdown that counted nothing: the
 * product model had one price column and no end date, so the clock restarted
 * from the same value on every card. These two columns make it real.
 *
 * A sale is a percentage off until an end time, stored beside `base_price`
 * rather than written into it. The normal price is never overwritten, so a sale
 * ends by the clock alone and there is nothing to restore afterwards.
 *
 * A percentage rather than a second price column because a product's variants
 * can carry their own price (`product_variants.price_override`): one percentage
 * applies cleanly to every variant, where one flat sale price would not.
 *
 * Both nullable: every existing product is simply "not on sale".
 */
export class ProductSale1789528000000 implements MigrationInterface {
  name = 'ProductSale1789528000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ADD "sale_percent" numeric(5,2)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "sale_ends_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sale_ends_at"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sale_percent"`);
  }
}
