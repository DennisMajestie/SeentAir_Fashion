import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stored delivery quotes, and the per-order record of how delivery was priced.
 *
 * Session 2 issued a stateless signed token. That cannot be single-use, because
 * there is no row to consume - and a quote is a promise about money, so the same
 * one must never be able to price two orders. A stored row fixes that: the
 * order id is written when the quote is consumed, and the UNIQUE constraint on
 * it makes a second use impossible at the database rather than in application
 * code.
 *
 * The snapshot table is the order's own copy of the decision, so editing a rate
 * or a zone afterwards can never change what an order was charged.
 *
 * Existing orders get no row at all rather than a backfilled zero, so "this
 * order was never priced for delivery" stays distinguishable from "delivery was
 * free".
 */
export class CreateShippingQuotes1789640000000 implements MigrationInterface {
  name = 'CreateShippingQuotes1789640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "checkout_shipping_quote" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "customer_id" uuid,
      "state_key" varchar(80) NOT NULL,
      "zone_id" uuid,
      "zone_name" varchar(120),
      "method" "checkout_shipping_method_enum" NOT NULL,
      "size_class" "checkout_shipping_size_class_enum" NOT NULL,
      "fee" NUMERIC(12,2) NOT NULL,
      "subtotal" NUMERIC(12,2) NOT NULL,
      "total" NUMERIC(12,2) NOT NULL,
      "cart" jsonb NOT NULL,
      "settings_version" jsonb,
      "expires_at" TIMESTAMP NOT NULL,
      "order_id" uuid,
      "consumed_at" TIMESTAMP,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_checkout_shipping_quote" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_checkout_shipping_quote_order" UNIQUE ("order_id"),
      CONSTRAINT "CHK_checkout_shipping_quote_fee_non_negative" CHECK ("fee" >= 0),
      CONSTRAINT "CHK_checkout_shipping_quote_consumed" CHECK ("order_id" IS NULL OR "consumed_at" IS NOT NULL),
      CONSTRAINT "FK_checkout_shipping_quote_customer" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
      CONSTRAINT "FK_checkout_shipping_quote_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_checkout_shipping_quote_expiry" ON "checkout_shipping_quote" ("expires_at")`,
    );

    await queryRunner.query(`CREATE TABLE "order_checkout_shipping" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "order_id" uuid NOT NULL,
      "quote_id" uuid,
      "zone_name" varchar(120),
      "state_key" varchar(80),
      "method" "checkout_shipping_method_enum",
      "size_class" "checkout_shipping_size_class_enum",
      "subtotal" NUMERIC(12,2) NOT NULL,
      "delivery_fee" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "vat_amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "vat_rate_percent" NUMERIC(5,2),
      "total" NUMERIC(12,2) NOT NULL,
      "snapshot" jsonb NOT NULL,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_order_checkout_shipping" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_order_checkout_shipping_order" UNIQUE ("order_id"),
      CONSTRAINT "CHK_order_checkout_shipping_fee_non_negative" CHECK ("delivery_fee" >= 0),
      CONSTRAINT "CHK_order_checkout_shipping_vat_non_negative" CHECK ("vat_amount" >= 0),
      CONSTRAINT "FK_order_checkout_shipping_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
      CONSTRAINT "FK_order_checkout_shipping_quote" FOREIGN KEY ("quote_id") REFERENCES "checkout_shipping_quote"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "order_checkout_shipping"`);
    await queryRunner.query(`DROP TABLE "checkout_shipping_quote"`);
  }
}
