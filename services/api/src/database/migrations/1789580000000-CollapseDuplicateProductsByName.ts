import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Collapse duplicate product rows by display name -- data-driven, no hardcoded ids.
 *
 * Why this exists
 * ---------------
 * `seed-catalogue.ts` modelled each colourway of a "New In" garment as its own
 * product row with a single variant (brown / white-black / beige / black-gold
 * each got their own "Men 2-Piece Set"). Every other collection in the seed is
 * shaped correctly -- one product row per garment, with the colour/size matrix
 * living on its variants. The New In rows were built from reference
 * screenshots, one product per screenshot, and that is the source of the
 * duplicate names in the admin catalogue.
 *
 * The product/variant split is what the rest of the system expects:
 *   product  = a garment design          (name, description, category, photo)
 *   variant  = one colour/size combination (SKU, stock, its own photo)
 * A SKU belongs to a variant, never to a product, so four colourways of one
 * design are one product with four variants -- which is why the storefront and
 * admin both showed "1 colour, 1 size" four times over.
 *
 * Why the earlier migrations did not do this on production
 * --------------------------------------------------------
 * `CollapseDuplicateProducts1789560000000` and
 * `CollapseRemainingDuplicateProducts1789570000000` hardcoded UUIDs copied from
 * a development database. Production was seeded independently and has entirely
 * different ids, so their UPDATE/DELETE statements matched zero rows. TypeORM
 * still recorded them as applied, so they will never run again and the
 * duplicates stayed. This migration derives its targets at run time instead, so
 * it behaves identically on any database that carries the duplicate shape.
 *
 * What it does
 * ------------
 * Groups products by (name, category, collection_id) -- the identity of a
 * listing; two rows sharing all three are the same garment split across rows.
 * For each group it keeps the earliest-created row, adopts the best photo and
 * bestseller flag from any sibling that has them, re-points the siblings'
 * variants onto the survivor, then deletes the emptied rows.
 *
 * `product_variants.product_id` is the only foreign key into `products`, and it
 * is ON DELETE CASCADE -- so variants are re-pointed *before* the old rows are
 * deleted. Variant ids never change, which keeps every downstream reference
 * (order_items, reviews, inventory_movements, BOM rows) pointing at the same
 * variant it always did.
 */
export class CollapseDuplicateProductsByName1789580000000 implements MigrationInterface {
  name = 'CollapseDuplicateProductsByName1789580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Map every non-surviving row to the row that will absorb it. A single
    //    pass over the table with a window function keeps this correct for any
    //    number of duplicates, and a no-op when there are none.
    await queryRunner.query(`
      CREATE TEMPORARY TABLE "_dup_map" AS
      SELECT
        "id" AS "dup_id",
        "canon_id"
      FROM (
        SELECT
          "id",
          FIRST_VALUE("id") OVER dup AS "canon_id",
          ROW_NUMBER() OVER dup AS "rn"
        FROM "products"
        WINDOW dup AS (
          PARTITION BY "name", "category", "collection_id"
          ORDER BY "created_at" ASC, "id" ASC
        )
      ) ranked
      WHERE ranked."rn" > 1
    `);

    // 2. Adopt a photo from a sibling when the survivor has none. Prefer the most
    //    recently updated sibling photo: that is the one an admin uploaded last,
    //    so it is the likelier current choice. Ties break on id for determinism.
    await queryRunner.query(`
      UPDATE "products" AS canon
      SET "primary_image_url" = donor."primary_image_url"
      FROM (
        SELECT DISTINCT ON (m."canon_id")
          m."canon_id",
          p."primary_image_url"
        FROM "_dup_map" m
        JOIN "products" p ON p."id" = m."dup_id"
        WHERE p."primary_image_url" IS NOT NULL
        ORDER BY m."canon_id", p."updated_at" DESC, p."id" DESC
      ) AS donor
      WHERE canon."id" = donor."canon_id"
        AND canon."primary_image_url" IS NULL
    `);

    // 3. A bestseller label on any sibling belongs to the garment, not to the
    //    row, so keep it if any sibling carried it.
    await queryRunner.query(`
      UPDATE "products" AS canon
      SET "is_bestseller" = TRUE
      FROM (
        SELECT m."canon_id"
        FROM "_dup_map" m
        JOIN "products" p ON p."id" = m."dup_id"
        WHERE p."is_bestseller" = TRUE
        GROUP BY m."canon_id"
      ) AS flagged
      WHERE canon."id" = flagged."canon_id"
        AND canon."is_bestseller" = FALSE
    `);

    // 4. Move the siblings' variants onto the survivor. Must run before the
    //    delete below: the FK is ON DELETE CASCADE, so deleting first would
    //    take the variants -- and everything referencing them -- with it.
    await queryRunner.query(`
      UPDATE "product_variants" AS v
      SET "product_id" = m."canon_id"
      FROM "_dup_map" m
      WHERE v."product_id" = m."dup_id"
    `);

    // 5. The siblings are empty now; remove them.
    await queryRunner.query(`
      DELETE FROM "products" AS p
      USING "_dup_map" m
      WHERE p."id" = m."dup_id"
    `);

    await queryRunner.query(`DROP TABLE "_dup_map"`);
  }

  /**
   * Not reversible, and deliberately so.
   *
   * Re-splitting would need to know which variants belonged to which original
   * row -- information this migration discards, and which the schema never
   * stored. Inventing a split would move variants onto products that never
   * existed, breaking the order/review/inventory links this migration was
   * written to protect. Roll back by restoring a database backup instead.
   */
  public async down(): Promise<void> {
    // Intentionally empty -- see the note above.
  }
}