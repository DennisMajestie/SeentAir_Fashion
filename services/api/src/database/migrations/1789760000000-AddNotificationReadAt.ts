import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationReadAt1789760000000 implements MigrationInterface {
  name = 'AddNotificationReadAt1789760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" ADD "read_at" TIMESTAMPTZ`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "read_at"`);
  }
}
