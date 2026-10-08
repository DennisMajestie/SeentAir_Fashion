import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guest reviews on the public tracking page.
 *
 * The review endpoint used to require a session (Bearer), so a guest who
 * bought on the emailed tracking link — no account, no user id — got
 * "Missing bearer token" when submitting a star rating from the delivered
 * page. The endpoint now also accepts the guest order-access token in the
 * query string, exactly like tracking/payment do, and the review no longer
 * hard-codes `customer_id = user.id`.
 *
 * The column is nullable because a guest has no user id to reference. The
 * review stays attributable through its `order_id` relation (the guest's
 * email lives on the order), and the unique (order_id, variant_id) index
 * already prevents a second review of the same line.
 */
export class ReviewCustomerIdNullable1789540000000 implements MigrationInterface {
  name = 'ReviewCustomerIdNullable1789540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reviews" ALTER COLUMN "customer_id" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reviews" ALTER COLUMN "customer_id" SET NOT NULL`);
  }
}