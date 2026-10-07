import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Product categories: the controlled list behind the admin's category dropdown.
 *
 * Until now `Product.category` was free text, so any spelling was a category.
 * This adds a canonical list and backfills it from the categories products
 * already carry, so shipping it neither orphans an existing product nor leaves
 * the dropdown empty. `Product.category` itself is unchanged: the storefront
 * still reads a string, and each write is now checked against this table.
 */
export class ProductCategories1789530000000 implements MigrationInterface {
  name = 'ProductCategories1789530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_categories_name" UNIQUE ("name"), CONSTRAINT "PK_categories" PRIMARY KEY ("id"))`,
    );
    // Backfill from the values already in use. DISTINCT + ON CONFLICT keep this
    // safe to run against a catalogue with repeated or empty category strings.
    await queryRunner.query(
      `INSERT INTO "categories" ("name") SELECT DISTINCT "category" FROM "products" WHERE "category" IS NOT NULL AND "category" <> '' ON CONFLICT ("name") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
