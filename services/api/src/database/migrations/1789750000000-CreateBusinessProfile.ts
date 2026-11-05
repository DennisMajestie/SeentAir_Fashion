import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBusinessProfile1789750000000 implements MigrationInterface {
  name = 'CreateBusinessProfile1789750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "business_profile" (
        "id" integer NOT NULL DEFAULT 1,
        "name" character varying(160) NOT NULL DEFAULT 'Seentair',
        "legal_name" character varying(200),
        "address" text,
        "phone" character varying(40),
        "email" character varying(160),
        "tax_id" character varying(60),
        "currency" character varying(3) NOT NULL DEFAULT 'NGN',
        "timezone" character varying(64) NOT NULL DEFAULT 'Africa/Lagos',
        "fiscal_start" character varying(16) NOT NULL DEFAULT 'January',
        "factory_name" character varying(160),
        "factory_city" character varying(120),
        "factory_address" text,
        "factory_capacity" integer,
        "factory_hours" character varying(120),
        "expiry_warn_days" integer NOT NULL DEFAULT 14,
        "low_stock_mode" character varying(24) NOT NULL DEFAULT 'reorder',
        "default_location_id" character varying(64) DEFAULT 'factory',
        "week_start" character varying(12) NOT NULL DEFAULT 'mon',
        "revenue_goal" numeric(14, 2) NOT NULL DEFAULT 0,
        "updated_by" uuid,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_business_profile" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_business_profile_single_row" CHECK ("id" = 1),
        CONSTRAINT "FK_business_profile_updated_by" FOREIGN KEY ("updated_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`INSERT INTO "business_profile" ("id") VALUES (1)`);

    await queryRunner.query(`ALTER TABLE "users" ADD "title" character varying(120)`);

    await queryRunner.query(`
      CREATE TABLE "notification_preferences" (
        "user_id" uuid NOT NULL,
        "preferences" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_preferences" PRIMARY KEY ("user_id"),
        CONSTRAINT "FK_notification_preferences_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_preferences"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "title"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "business_profile"`);
  }
}
