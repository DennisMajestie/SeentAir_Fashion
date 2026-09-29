import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guest checkout, step 1 (docs/phases/phase-8-guest-checkout.md §8.1).
 *
 * Lets an order exist without an account behind it: who bought, where to email
 * the receipt and tracking link, and whether a later registration has claimed
 * it. Additive — no column is dropped or retyped, and every existing order
 * keeps NULL in all three.
 *
 * The index is partial: only guest orders carry an email, so indexing the NULLs
 * of every account order would be dead weight. It is what the step 4 claim
 * looks orders up by.
 */
export class GuestCheckout1789523000000 implements MigrationInterface {
  name = 'GuestCheckout1789523000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD "guest_name" character varying(160)`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "guest_email" character varying(320)`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "claimed_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_guest_email" ON "orders" ("guest_email") WHERE "guest_email" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Refuse rather than silently destroy the only contact details a guest
    // order has: dropping these columns would leave paid orders with no way to
    // reach the buyer and no record of who they were.
    const [{ n }] = (await queryRunner.query(
      `SELECT count(*)::int AS n FROM "orders" WHERE "guest_email" IS NOT NULL`,
    )) as Array<{ n: number }>;
    if (n > 0) {
      throw new Error(
        `Cannot revert: ${n} guest order(s) would lose their only contact details — migrate them to accounts first`,
      );
    }
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_guest_email"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "claimed_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "guest_email"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "guest_name"`);
  }
}
