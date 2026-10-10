import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Server-side wishlist.
 *
 * The storefront could save products, but only in the browser: the list did not
 * survive a new device and staff could not see what a customer was saving. This
 * stores the association only -- name, photo and price are read live from the
 * product at request time, so a saved item can never show a stale price.
 *
 * (user_id, product_id) is unique so a product cannot be saved twice, and the
 * merge on sign-in can therefore fold a guest's local list in without having to
 * deduplicate it first. Both cascades keep a deleted user or product from
 * leaving an orphaned row behind.
 */
export class CreateWishlistItems1789590000000 implements MigrationInterface {
  name = 'CreateWishlistItems1789590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "wishlist_items" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "user_id" uuid NOT NULL,
      "product_id" uuid NOT NULL,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_wishlist_items" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_wishlist_items_user_product" ON "wishlist_items" ("user_id", "product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wishlist_items_user" ON "wishlist_items" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" ADD CONSTRAINT "FK_wishlist_items_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" ADD CONSTRAINT "FK_wishlist_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" DROP CONSTRAINT "FK_wishlist_items_product"`,
    );
    await queryRunner.query(`ALTER TABLE "wishlist_items" DROP CONSTRAINT "FK_wishlist_items_user"`);
    await queryRunner.query(`DROP TABLE "wishlist_items"`);
  }
}