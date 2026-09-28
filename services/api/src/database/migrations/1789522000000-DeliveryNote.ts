import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Waybill handover note.
 *
 * The staff pack-out screen used to write a free-text string into
 * orders.shippingAddress, but the DTO requires a routable object — so every
 * save 400'd. Rather than loosen the address back to free-form (which is what
 * let a string reach the API in the first place), handover instructions get
 * their own column: "gate code, call on arrival" is not routable data.
 */
export class DeliveryNote1789522000000 implements MigrationInterface {
  name = 'DeliveryNote1789522000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD "delivery_note" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "delivery_note"`);
  }
}
