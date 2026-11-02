import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrackConfirmedProductionCostComponents1789740000000 implements MigrationInterface {
  name = 'TrackConfirmedProductionCostComponents1789740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "production_costs"
      ADD COLUMN IF NOT EXISTS "confirmed_components" text[] NOT NULL DEFAULT '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "production_costs"
      DROP COLUMN IF EXISTS "confirmed_components"
    `);
  }
}
