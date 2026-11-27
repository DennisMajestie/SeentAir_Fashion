import { MigrationInterface, QueryRunner } from 'typeorm';

/** Storage for hashed, single-use TOTP recovery codes. */
export class AddTotpRecoveryCodes1793000000000 implements MigrationInterface {
  name = 'AddTotpRecoveryCodes1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "totp_recovery_codes" jsonb NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "totp_recovery_codes"
    `);
  }
}
