import { MigrationInterface, QueryRunner } from "typeorm";

export class TwoFactorAuth1789519737452 implements MigrationInterface {
    name = 'TwoFactorAuth1789519737452'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "totp_secret" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "totp_enabled" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "totp_enabled"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "totp_secret"`);
    }

}
