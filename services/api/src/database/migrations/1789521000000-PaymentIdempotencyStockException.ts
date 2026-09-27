import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Paystack payment path hardening.
 *
 *   - processed_webhook_events: one row per provider event acted on, unique on
 *     (provider, event_id), claimed inside the processing transaction so a
 *     concurrent duplicate delivery cannot apply the same payment twice.
 *   - order_items.shortfall: units the ledger could not allocate at payment time.
 *   - orders.status gains STOCK_EXCEPTION (paid, short on stock) and CANCELLED
 *     (refunded from that state); orders.payment_status gains REFUNDED.
 *
 * Enums are recreated rather than ADD VALUE'd so the migration stays inside a
 * transaction. Reverting is refused while any order sits in one of the new
 * states: folding them back would revive refunded orders as live paid ones.
 */
export class PaymentIdempotencyStockException1789521000000 implements MigrationInterface {
  name = 'PaymentIdempotencyStockException1789521000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "processed_webhook_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider" character varying(40) NOT NULL, "event_id" character varying(200) NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_processed_webhook_events" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_webhook_event_provider_id" ON "processed_webhook_events" ("provider", "event_id")`,
    );

    await queryRunner.query(`ALTER TABLE "order_items" ADD "shortfall" integer NOT NULL DEFAULT 0`);

    await queryRunner.query(
      `ALTER TYPE "public"."orders_status_enum" RENAME TO "orders_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('awaiting_payment', 'order_received', 'processing', 'shipped', 'delivered', 'returned', 'stock_exception', 'cancelled')`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" TYPE "public"."orders_status_enum" USING "status"::"text"::"public"."orders_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'awaiting_payment'`,
    );
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum_old"`);

    await queryRunner.query(
      `ALTER TYPE "public"."orders_payment_status_enum" RENAME TO "orders_payment_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_payment_status_enum" AS ENUM('unpaid', 'paid', 'refunded')`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE "public"."orders_payment_status_enum" USING "payment_status"::"text"::"public"."orders_payment_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'unpaid'`,
    );
    await queryRunner.query(`DROP TYPE "public"."orders_payment_status_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rows in the new states cannot be cast back; fold them into the nearest old state first.
    // Never fold refunded/cancelled orders back into live paid ones.
    const [{ n }] = (await queryRunner.query(
      `SELECT count(*)::int AS n FROM "orders" WHERE "status" IN ('stock_exception', 'cancelled') OR "payment_status" = 'refunded'`,
    )) as Array<{ n: number }>;
    if (n > 0) {
      throw new Error(
        `Cannot revert: ${n} order(s) are in stock_exception/cancelled/refunded — resolve them first`,
      );
    }

    await queryRunner.query(
      `ALTER TYPE "public"."orders_payment_status_enum" RENAME TO "orders_payment_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_payment_status_enum" AS ENUM('unpaid', 'paid')`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE "public"."orders_payment_status_enum" USING "payment_status"::"text"::"public"."orders_payment_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'unpaid'`,
    );
    await queryRunner.query(`DROP TYPE "public"."orders_payment_status_enum_old"`);

    await queryRunner.query(
      `ALTER TYPE "public"."orders_status_enum" RENAME TO "orders_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('awaiting_payment', 'order_received', 'processing', 'shipped', 'delivered', 'returned')`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" TYPE "public"."orders_status_enum" USING "status"::"text"::"public"."orders_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'awaiting_payment'`,
    );
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum_old"`);

    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "shortfall"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_webhook_event_provider_id"`);
    await queryRunner.query(`DROP TABLE "processed_webhook_events"`);
  }
}
