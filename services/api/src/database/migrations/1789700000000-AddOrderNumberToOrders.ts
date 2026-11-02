import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Human-readable order numbers.
 *
 * Adds `order_number` (bigint) to `orders`, backed by `order_number_seq`.
 * Existing orders are backfilled in `created_at` ascending order (ties by id)
 * starting at 1001, inside this migration, in one statement. The sequence is
 * then advanced past the maximum backfilled value and the column becomes
 * NOT NULL with DEFAULT nextval(...) plus a UNIQUE index.
 *
 * Application code never sets `order_number` explicitly — the sequence owns it.
 *
 * Down migration drops the index, the column, and the sequence.
 */
export class AddOrderNumberToOrders1789700000000 implements MigrationInterface {
  name = 'AddOrderNumberToOrders1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create the sequence.
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START WITH 1 INCREMENT BY 1`);

    // 2. Add the nullable column first so backfill can write into it.
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "order_number" bigint`,
    );

    // 3. Backfill existing orders in created_at ASC order (ties by id),
    //    starting at 1001, in a single statement.
    await queryRunner.query(`
      WITH numbered AS (
        SELECT id,
               row_number() OVER (ORDER BY "created_at" ASC, id ASC) + 1000 AS n
        FROM "orders"
      )
      UPDATE "orders" o
      SET "order_number" = n.n
      FROM numbered n
      WHERE o.id = n.id;
    `);

    // 4. Advance the sequence past the maximum backfilled value.
    await queryRunner.query(`
      SELECT setval('"order_number_seq"', COALESCE((SELECT MAX("order_number") FROM "orders"), 1000));
    `);

    // 5. Make the column NOT NULL with the sequence default and add UNIQUE index.
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "order_number" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "order_number" SET DEFAULT nextval('"order_number_seq"')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_orders_order_number" ON "orders" ("order_number")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_order_number"`);
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "order_number" DROP DEFAULT`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "order_number"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "order_number_seq"`);
  }
}
