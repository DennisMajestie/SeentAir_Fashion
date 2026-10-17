import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Delivery zones, their states, and the rates charged within them.
 *
 * A ZONE is a group of states (Lagos, Abuja...) that share prices. Its states
 * are held in a child table with a UNIQUE key on the normalised state, so a
 * state can only ever belong to ONE zone. That uniqueness is what lets the
 * quote resolve a destination without ever guessing: if the state is not in
 * the table, the answer is "unserviceable", not "probably this zone".
 *
 * A RATE is the fee for one zone + size class + delivery method, valid between
 * two instants. Rates are versioned by date rather than overwritten, so a
 * price change never rewrites what an in-flight quote was based on. Overlap
 * between two active rates of the same triple is rejected by the service
 * (it would otherwise be ambiguous which price applies); a database-level
 * exclusion constraint would need the btree_gist extension, which a managed
 * host may not grant, so the check lives in application code and is tested.
 *
 * `products.size_class` is additive and defaults to 'medium' so every existing
 * product is immediately shippable at the middle tier rather than falling out
 * of every zone. It stays nullable so "not classified yet" remains expressible.
 */
export class CreateCheckoutShipping1789610000000 implements MigrationInterface {
  name = 'CreateCheckoutShipping1789610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "product_size_class_enum" AS ENUM ('light', 'medium', 'heavy')`,
    );
    await queryRunner.query(
      `CREATE TYPE "checkout_shipping_size_class_enum" AS ENUM ('light', 'medium', 'heavy')`,
    );
    await queryRunner.query(
      `CREATE TYPE "checkout_shipping_method_enum" AS ENUM ('freight', 'pickup')`,
    );

    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN "size_class" "product_size_class_enum" DEFAULT 'medium'`);

    await queryRunner.query(`CREATE TABLE "checkout_shipping_zones" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "name" varchar(120) NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_checkout_shipping_zones" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE "checkout_shipping_zone_states" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "zone_id" uuid NOT NULL,
      "state_key" varchar(80) NOT NULL,
      "state" varchar(120) NOT NULL,
      CONSTRAINT "PK_checkout_shipping_zone_states" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_checkout_shipping_zone_states_unique_state" UNIQUE ("state_key")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_checkout_shipping_zone_states_zone" ON "checkout_shipping_zone_states" ("zone_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "checkout_shipping_zone_states" ADD CONSTRAINT "FK_checkout_shipping_zone_states_zone" FOREIGN KEY ("zone_id") REFERENCES "checkout_shipping_zones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`CREATE TABLE "checkout_shipping_rates" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "zone_id" uuid NOT NULL,
      "size_class" "checkout_shipping_size_class_enum" NOT NULL,
      "method" "checkout_shipping_method_enum" NOT NULL,
      "fee" NUMERIC(12,2) NOT NULL,
      "valid_from" TIMESTAMP NOT NULL DEFAULT now(),
      "valid_to" TIMESTAMP,
      "is_active" boolean NOT NULL DEFAULT true,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_checkout_shipping_rates" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_checkout_shipping_rates_fee_non_negative" CHECK ("fee" >= 0),
      CONSTRAINT "CHK_checkout_shipping_rates_window" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_checkout_shipping_rates_lookup" ON "checkout_shipping_rates" ("zone_id", "size_class", "method", "is_active")`,
    );
    await queryRunner.query(
      `ALTER TABLE "checkout_shipping_rates" ADD CONSTRAINT "FK_checkout_shipping_rates_zone" FOREIGN KEY ("zone_id") REFERENCES "checkout_shipping_zones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "checkout_shipping_rates" DROP CONSTRAINT "FK_checkout_shipping_rates_zone"`,
    );
    await queryRunner.query(`DROP TABLE "checkout_shipping_rates"`);
    await queryRunner.query(
      `ALTER TABLE "checkout_shipping_zone_states" DROP CONSTRAINT "FK_checkout_shipping_zone_states_zone"`,
    );
    await queryRunner.query(`DROP TABLE "checkout_shipping_zone_states"`);
    await queryRunner.query(`DROP TABLE "checkout_shipping_zones"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "size_class"`);
    await queryRunner.query(`DROP TYPE "checkout_shipping_method_enum"`);
    await queryRunner.query(`DROP TYPE "checkout_shipping_size_class_enum"`);
    await queryRunner.query(`DROP TYPE "product_size_class_enum"`);
  }
}