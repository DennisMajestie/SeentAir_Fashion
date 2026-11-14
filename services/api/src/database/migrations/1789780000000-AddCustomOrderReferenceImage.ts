import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomOrderReferenceImage1789780000000 implements MigrationInterface {
  name = 'AddCustomOrderReferenceImage1789780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custom_order_requests" ADD COLUMN IF NOT EXISTS "reference_image_url" varchar(512) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custom_order_requests" DROP COLUMN IF EXISTS "reference_image_url"`,
    );
  }
}
