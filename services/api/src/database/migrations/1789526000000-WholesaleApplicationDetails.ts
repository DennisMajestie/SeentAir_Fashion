import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Application details for wholesale buyers (appendix 06).
 *
 * The authenticated one-click apply collected nothing, so staff reviewing the
 * queue saw a name, an email and a date with nothing to decide on. These
 * columns let the public application form capture who is buying.
 *
 * All nullable on purpose: rows created by the one-click apply and every row
 * that predates this migration stay valid without a backfill.
 *
 * CAC credentials are deliberately absent for now. The B2B criteria panel on
 * the wholesale login screen advertises CAC verification, so this column set
 * will need extending once that check is actually built -- do not let the
 * marketing copy imply a verification step that does not exist yet.
 */
export class WholesaleApplicationDetails1789526000000 implements MigrationInterface {
  name = 'WholesaleApplicationDetails1789526000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "wholesale_buyer_type_enum" AS ENUM('retailer', 'online_reseller', 'institution', 'distributor', 'other')`,
    );
    await queryRunner.query(
      `ALTER TABLE "wholesale_accounts" ADD "business_name" character varying(160)`,
    );
    await queryRunner.query(
      `ALTER TABLE "wholesale_accounts" ADD "buyer_type" "wholesale_buyer_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wholesale_accounts" ADD "business_phone" character varying(40)`,
    );
    await queryRunner.query(`ALTER TABLE "wholesale_accounts" ADD "city" character varying(80)`);
    await queryRunner.query(`ALTER TABLE "wholesale_accounts" ADD "state" character varying(80)`);
    await queryRunner.query(`ALTER TABLE "wholesale_accounts" ADD "opening_volume" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wholesale_accounts" DROP COLUMN "opening_volume"`);
    await queryRunner.query(`ALTER TABLE "wholesale_accounts" DROP COLUMN "state"`);
    await queryRunner.query(`ALTER TABLE "wholesale_accounts" DROP COLUMN "city"`);
    await queryRunner.query(`ALTER TABLE "wholesale_accounts" DROP COLUMN "business_phone"`);
    await queryRunner.query(`ALTER TABLE "wholesale_accounts" DROP COLUMN "buyer_type"`);
    await queryRunner.query(`ALTER TABLE "wholesale_accounts" DROP COLUMN "business_name"`);
    await queryRunner.query(`DROP TYPE "wholesale_buyer_type_enum"`);
  }
}