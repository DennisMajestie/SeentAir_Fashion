import { MigrationInterface, QueryRunner } from 'typeorm';

/** Points can now be spent at checkout; record that movement explicitly. */
export class AddLoyaltyRedemption1792000000500 implements MigrationInterface {
  name = 'AddLoyaltyRedemption1792000000500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "loyalty_entries_reason_enum" ADD VALUE IF NOT EXISTS 'redeemed' BEFORE 'admin_adjust'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "loyalty_entries" WHERE "reason" = 'redeemed'`);
  }
}
