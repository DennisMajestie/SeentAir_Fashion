import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoyalty1792000000200 implements MigrationInterface {
  name = 'CreateLoyalty1792000000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "loyalty_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customer_id" uuid NOT NULL,
        "points" integer NOT NULL DEFAULT 0,
        "lifetime_points" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_loyalty_accounts_customer" UNIQUE ("customer_id"),
        CONSTRAINT "FK_loyalty_accounts_customer" FOREIGN KEY ("customer_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "loyalty_entries_reason_enum" AS ENUM ('order_delivered', 'return_reversal', 'admin_adjust')
    `);
    await queryRunner.query(`
      CREATE TABLE "loyalty_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customer_id" uuid NOT NULL,
        "order_id" uuid,
        "points" integer NOT NULL,
        "reason" "loyalty_entries_reason_enum" NOT NULL,
        "note" character varying(180) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_entries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_entry_customer" ON "loyalty_entries" ("customer_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "loyalty_entries"`);
    await queryRunner.query(`DROP TYPE "loyalty_entries_reason_enum"`);
    await queryRunner.query(`DROP TABLE "loyalty_accounts"`);
  }
}
