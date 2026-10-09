import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Collapse duplicate product rows.
 *
 * Some products were seeded with the same display name but different SKUs/colours.
 * This migration merges them into single canonical products per name:
 *   - Men 2-Piece Set: keep product 90f947a6 (first by created_at), move variants from the other 3 product rows,
 *     then delete the orphaned rows.
 *   - Men Underwear: keep product 4aa3420d (first by created_at), move the variant from the other product,
 *     then delete the orphaned row.
 *
 * Variant `product_id` is repointed; variant IDs stay the same, so all existing
 * references (order_items, reviews, inventory_movements) continue to work.
 */
export class CollapseDuplicateProducts1789560000000 implements MigrationInterface {
  name = 'CollapseDuplicateProducts1789560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -- Men 2-Piece Set: keep 90f947a6 (first by created_at), repoint variants, delete others --
    await queryRunner.query(
      `UPDATE "product_variants" SET "product_id" = '90f947a6-d0e2-4bfd-a8e2-cb91a94bed42' WHERE "product_id" IN ('bfe0fec3-a86e-47a4-8f93-e178370e22cd', '01f47e71-6cd3-44f6-b0af-d8cbe2281a14')`
    );

    await queryRunner.query(
      `DELETE FROM "products" WHERE "id" IN ('bfe0fec3-a86e-47a4-8f93-e178370e22cd', '01f47e71-6cd3-44f6-b0af-d8cbe2281a14')`
    );

    // -- Men Underwear: keep 4aa3420d (first by created_at), repoint variant, delete other --
    await queryRunner.query(
      `UPDATE "product_variants" SET "product_id" = '4aa3420d-f2c3-43b6-a00e-76668f36ca59' WHERE "product_id" = 'b0e908e5-2ec4-4d44-a80c-8bfece73540b'`
    );

    await queryRunner.query(
      `DELETE FROM "products" WHERE "id" = 'b0e908e5-2ec4-4d44-a80c-8bfece73540b'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // -- Re-add the deleted Men Underwear product row --
    await queryRunner.query(`
      INSERT INTO "products" ("id", "name", "description", "sku", "collection_id", "created_at", "updated_at")
      VALUES (
        'b0e908e5-2ec4-4d44-a80c-8bfece73540b',
        'Men Underwear',
        null,
        'SE-UNW-BLK-OS',
        null,
        now(),
        now()
      )
    `);

    // -- Re-add the deleted Men 2-Piece Set product rows --
    await queryRunner.query(`
      INSERT INTO "products" ("id", "name", "description", "sku", "collection_id", "created_at", "updated_at")
      VALUES (
        'bfe0fec3-a86e-47a4-8f93-e178370e22cd',
        'Men 2-Piece Set',
        null,
        'SE-2PC-BGE-OS',
        null,
        now(),
        now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO "products" ("id", "name", "description", "sku", "collection_id", "created_at", "updated_at")
      VALUES (
        '01f47e71-6cd3-44f6-b0af-d8cbe2281a14',
        'Men 2-Piece Set',
        null,
        'SE-2PC-BLG-OS',
        null,
        now(),
        now()
      )
    `);

    // -- Repoint variants back --
    await queryRunner.query(
      `UPDATE "product_variants" SET "product_id" = 'bfe0fec3-a86e-47a4-8f93-e178370e22cd' WHERE "product_id" = '90f947a6-d0e2-4bfd-a8e2-cb91a94bed42' AND "sku" = 'SE-2PC-BGE-OS'`
    );

    await queryRunner.query(
      `UPDATE "product_variants" SET "product_id" = '01f47e71-6cd3-44f6-b0af-d8cbe2281a14' WHERE "product_id" = '90f947a6-d0e2-4bfd-a8e2-cb91a94bed42' AND "sku" = 'SE-2PC-BLG-OS'`
    );

    await queryRunner.query(
      `UPDATE "product_variants" SET "product_id" = 'b0e908e5-2ec4-4d44-a80c-8bfece73540b' WHERE "product_id" = '4aa3420d-f2c3-43b6-a00e-76668f36ca59' AND "sku" = 'SE-UNW-BLK-OS'`
    );
  }
}