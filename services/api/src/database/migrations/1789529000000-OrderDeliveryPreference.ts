import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Wholesale checkout delivery preference and buyer note.
 *
 * The wholesale cart asked the buyer for a delivery mode (courier freight or
 * factory pickup) and a note for the factory desk, then dropped both on
 * submit: CreateOrderDto had nowhere to put them, so the choice never reached
 * the factory. These are buyer-supplied and distinct from delivery_note, which
 * staff write at pack-out for the waybill.
 */
export class OrderDeliveryPreference1789529000000 implements MigrationInterface {
  name = 'OrderDeliveryPreference1789529000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."orders_delivery_method_enum" AS ENUM('freight', 'pickup')`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "delivery_method" "public"."orders_delivery_method_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ADD "customer_note" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_note"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "delivery_method"`);
    await queryRunner.query(`DROP TYPE "public"."orders_delivery_method_enum"`);
  }
}
