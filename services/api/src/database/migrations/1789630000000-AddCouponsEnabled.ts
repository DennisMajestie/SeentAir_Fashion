import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the coupon feature flag to the platform settings row.
 *
 * Coupons join shipping and VAT on the single settings row rather than growing
 * a table of their own: one place to look, one cache, one audit trail, and no
 * third convention for "is this switched on". Defaults to false, so an existing
 * install keeps behaving exactly as it did before this column existed.
 */
export class AddCouponsEnabled1789630000000 implements MigrationInterface {
  name = 'AddCouponsEnabled1789630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "platform_settings" ADD COLUMN "coupons_enabled" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_settings" DROP COLUMN "coupons_enabled"`);
  }
}