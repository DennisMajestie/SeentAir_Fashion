import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Actor attribution on order status events.
 *
 * Adds nullable `actor_id` (uuid FK to users.id) and nullable `actor_kind`
 * (varchar: 'staff' | 'customer' | 'system') to `order_status_events`, plus
 * an index on (order_id, created_at) for timeline queries.
 *
 * Legacy rows stay NULL for both (no backfill). Down migration drops the
 * index, both columns.
 */
export class AddActorToOrderStatusEvents1789710000000 implements MigrationInterface {
  name = 'AddActorToOrderStatusEvents1789710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_status_events" ADD COLUMN "actor_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_events" ADD COLUMN "actor_kind" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_events" ADD CONSTRAINT "FK_order_status_events_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_status_events_order_created" ON "order_status_events" ("order_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_status_events_order_created"`);
    await queryRunner.query(`ALTER TABLE "order_status_events" DROP CONSTRAINT IF EXISTS "FK_order_status_events_actor"`);
    await queryRunner.query(`ALTER TABLE "order_status_events" DROP COLUMN "actor_kind"`);
    await queryRunner.query(`ALTER TABLE "order_status_events" DROP COLUMN "actor_id"`);
  }
}
