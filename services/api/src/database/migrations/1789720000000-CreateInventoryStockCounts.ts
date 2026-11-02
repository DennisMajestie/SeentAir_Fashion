import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventoryStockCounts1789720000000 implements MigrationInterface {
  name = 'CreateInventoryStockCounts1789720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inventory_stock_counts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_stock_counts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_stock_counts_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "inventory_stock_count_lines_item_type_enum" AS ENUM ('variant', 'material')
    `);
    await queryRunner.query(`
      CREATE TABLE "inventory_stock_count_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "stock_count_id" uuid NOT NULL,
        "item_type" "inventory_stock_count_lines_item_type_enum" NOT NULL,
        "item_id" uuid NOT NULL,
        "system_quantity" integer NOT NULL,
        "counted_quantity" integer NOT NULL,
        "adjustment_quantity" integer NOT NULL,
        "approval_request_id" uuid,
        CONSTRAINT "PK_inventory_stock_count_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_stock_count_lines_count"
          FOREIGN KEY ("stock_count_id") REFERENCES "inventory_stock_counts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_stock_counts_created_at"
      ON "inventory_stock_counts" ("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_stock_count_lines_count"
      ON "inventory_stock_count_lines" ("stock_count_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_stock_count_lines_count"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_stock_counts_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_stock_count_lines"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "inventory_stock_count_lines_item_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_stock_counts"`);
  }
}
