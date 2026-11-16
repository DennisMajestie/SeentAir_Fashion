import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The storefront's floating WhatsApp button points wherever the operator
 * decides: the link lives on the platform settings row and is published
 * through /config/public. Null until the dashboard sets it, and the button
 * simply does not render until then.
 */
export class AddSupportWhatsappUrl1790000000000 implements MigrationInterface {
  name = 'AddSupportWhatsappUrl1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "platform_settings" ADD "support_whatsapp_url" VARCHAR(512)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "platform_settings" DROP COLUMN IF EXISTS "support_whatsapp_url"`,
    );
  }
}
