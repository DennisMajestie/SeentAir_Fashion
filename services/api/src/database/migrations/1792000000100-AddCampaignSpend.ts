import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCampaignSpend1792000000100 implements MigrationInterface {
  name = 'AddCampaignSpend1792000000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
      ADD COLUMN "spend" numeric(12, 2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns" DROP COLUMN "spend"
    `);
  }
}
