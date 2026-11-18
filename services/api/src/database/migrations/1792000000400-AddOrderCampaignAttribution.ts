import { MigrationInterface, QueryRunner } from 'typeorm';

/** Attribute orders to a marketing campaign captured from a tracked link/UTM. */
export class AddOrderCampaignAttribution1792000000400 implements MigrationInterface {
  name = 'AddOrderCampaignAttribution1792000000400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "campaign_id" uuid NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_campaign_id" ON "orders" ("campaign_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "FK_orders_campaign" FOREIGN KEY ("campaign_id")
        REFERENCES "campaigns"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_campaign"
    `);
    await queryRunner.query(`
      DROP INDEX "IDX_orders_campaign_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders" DROP COLUMN "campaign_id"
    `);
  }
}
