import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deployments created with the first loyalty migration have the earlier
 * 'order_paid' label. Relabel it and add the reversal value; points are now
 * earned at DELIVERED and reversed on return (appendix 15).
 */
export class UpdateLoyaltyReasons1792000000300 implements MigrationInterface {
  name = 'UpdateLoyaltyReasons1792000000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'loyalty_entries_reason_enum'
            AND e.enumlabel = 'order_paid'
        ) THEN
          ALTER TYPE "loyalty_entries_reason_enum"
            RENAME VALUE 'order_paid' TO 'order_delivered';
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TYPE "loyalty_entries_reason_enum" ADD VALUE IF NOT EXISTS 'return_reversal' BEFORE 'admin_adjust'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "loyalty_entries" WHERE "reason" = 'return_reversal'
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'loyalty_entries_reason_enum'
            AND e.enumlabel = 'order_delivered'
        ) THEN
          ALTER TYPE "loyalty_entries_reason_enum"
            RENAME VALUE 'order_delivered' TO 'order_paid';
        END IF;
      END $$;
    `);
  }
}
