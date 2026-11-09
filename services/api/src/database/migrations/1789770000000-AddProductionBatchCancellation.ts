import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductionBatchCancellation1789770000000 implements MigrationInterface {
  name = 'AddProductionBatchCancellation1789770000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "production_batches"
      ADD COLUMN IF NOT EXISTS "cancelled_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "cancelled_by" uuid NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "production_batches"
      DROP COLUMN IF EXISTS "cancelled_by",
      DROP COLUMN IF EXISTS "cancelled_at"
    `);
  }
}
