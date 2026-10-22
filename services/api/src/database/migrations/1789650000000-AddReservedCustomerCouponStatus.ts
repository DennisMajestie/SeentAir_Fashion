import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `reserved` to customer_coupon_status_enum.
 *
 * C2 built the redemption lifecycle (reserved -> confirmed/released) but left
 * the wallet row with only available/used/expired/revoked. That gap is a
 * double-spend: a coupon stays `available` until payment succeeds, so the same
 * held coupon could back two orders placed at the same time, and both would
 * pass the usage-cap check.
 *
 * The wallet row is therefore the authority on whether a coupon is spendable.
 * Reserve flips it, release puts it back, confirm burns it. A single status
 * filter then does the locking that a row-level lock on the coupon alone
 * cannot, because two orders may hold two different wallet rows for the same
 * coupon.
 *
 * Adding a value is safe in Postgres and does not take a lock that blocks
 * reads. Positions matter for a later drop: `reserved` sits before `used` so
 * the enum order still reads as the lifecycle.
 */
export class AddReservedCustomerCouponStatus1789650000000 implements MigrationInterface {
  name = 'AddReservedCustomerCouponStatus1789650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "customer_coupon_status_enum" ADD VALUE IF NOT EXISTS 'reserved' BEFORE 'used'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres cannot drop a value from an enum without rebuilding the type,
    // which needs every dependent column recreated. Rebuilding customer_coupon
    // would touch live redemption history, so this is deliberately not done.
    // Removing a wallet row that is still `reserved` first makes the rebuild
    // possible; until then the extra value is inert, since nothing selects it
    // unless a reservation is in flight.
    throw new Error(
      'customer_coupon_status_enum.reserved is not reversible: dropping an enum value requires rebuilding customer_coupon. ' +
        'Clear in-flight reservations first, then rebuild the type by hand.',
    );
  }
}
