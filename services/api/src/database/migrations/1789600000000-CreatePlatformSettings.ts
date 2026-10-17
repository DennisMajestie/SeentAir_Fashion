import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Platform settings: one row that switches the delivery and tax features on.
 *
 * Every commercial rule that has to change without a redeploy lives here rather
 * than in code, so an owner can turn a feature on, correct a rate, or pull the
 * plug on it again from the admin dashboard. It is deliberately a SINGLE row
 * (enforced by a check constraint) rather than a key/value bag: the settings
 * are known, typed and few, and a fixed shape means the application can read
 * them without guessing a type per key.
 *
 * The seeded row is all-off and all-zero on purpose. Nothing charges a customer
 * an extra fee until an operator explicitly turns a flag on and enters real
 * numbers; a fresh database must never invent a price.
 */
export class CreatePlatformSettings1789600000000 implements MigrationInterface {
  name = 'CreatePlatformSettings1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "platform_settings" (
      "id" INTEGER NOT NULL DEFAULT 1,
      "shipping_enabled" BOOLEAN NOT NULL DEFAULT false,
      "free_delivery_threshold" NUMERIC(12,2),
      "quote_expiry_minutes" INTEGER NOT NULL DEFAULT 1440,
      "vat_enabled" BOOLEAN NOT NULL DEFAULT false,
      "vat_rate_percent" NUMERIC(5,2) NOT NULL DEFAULT 0,
      "prices_include_vat" BOOLEAN NOT NULL DEFAULT false,
      "delivery_taxable" BOOLEAN NOT NULL DEFAULT false,
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_by" UUID,
      CONSTRAINT "PK_platform_settings" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_platform_settings_single_row" CHECK ("id" = 1),
      CONSTRAINT "CHK_platform_settings_vat_rate" CHECK ("vat_rate_percent" >= 0 AND "vat_rate_percent" <= 100),
      CONSTRAINT "CHK_platform_settings_threshold" CHECK ("free_delivery_threshold" IS NULL OR "free_delivery_threshold" >= 0),
      CONSTRAINT "CHK_platform_settings_quote_expiry" CHECK ("quote_expiry_minutes" > 0)
    )`);
    // The one and only row. All flags off, no rates, no free-delivery promise.
    await queryRunner.query(
      `INSERT INTO "platform_settings" ("id") VALUES (1)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "platform_settings"`);
  }
}