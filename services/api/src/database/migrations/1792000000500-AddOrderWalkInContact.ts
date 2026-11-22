import { MigrationInterface, QueryRunner } from 'typeorm';

/** Staff-recorded in-store sales can now name the walk-in buyer. */
export class AddOrderWalkInContact1792000000500 implements MigrationInterface {
  name = 'AddOrderWalkInContact1792000000500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "guest_phone" character varying(32) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders" DROP COLUMN "guest_phone"
    `);
  }
}
