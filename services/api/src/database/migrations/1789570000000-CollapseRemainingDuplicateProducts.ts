import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Collapse the remaining duplicate product row for Men 2-Piece Set.
 *
 * The first collapse migration missed product 9b90de60 (SKU SE-2PC-BRN-OS).
 * This migration completes the consolidation by repointing its variant
 * and deleting the orphaned product row.
 */
export class CollapseRemainingDuplicateProducts1789570000000 implements MigrationInterface {
  name = 'CollapseRemainingDuplicateProducts1789570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -- Men 2-Piece Set: repoint variant from 9b90de60 to canonical 90f947a6, then delete 9b90de60 --
    await queryRunner.query(
      `UPDATE "product_variants" SET "product_id" = '90f947a6-d0e2-4bfd-a8e2-cb91a94bed42' WHERE "product_id" = '9b90de60-b78f-4dd4-8ba7-32a0970baf1a'`
    );

    await queryRunner.query(
      `DELETE FROM "products" WHERE "id" = '9b90de60-b78f-4dd4-8ba7-32a0970baf1a'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // -- Re-add the deleted Men 2-Piece Set product row --
    await queryRunner.query(`
      INSERT INTO "products" ("id", "name", "description", "sku", "collection_id", "created_at", "updated_at")
      VALUES (
        '9b90de60-b78f-4dd4-8ba7-32a0970baf1a',
        'Men 2-Piece Set',
        null,
        'SE-2PC-BRN-OS',
        null,
        now(),
        now()
      )
    `);

    // -- Repoint variant back --
    await queryRunner.query(
      `UPDATE "product_variants" SET "product_id" = '9b90de60-b78f-4dd4-8ba7-32a0970baf1a' WHERE "product_id" = '90f947a6-d0e2-4bfd-a8e2-cb91a94bed42' AND "sku" = 'SE-2PC-BRN-OS'`
    );
  }
}